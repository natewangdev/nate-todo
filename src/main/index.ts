import { app, BrowserWindow, ipcMain, screen } from 'electron'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomUUID } from 'crypto'
import type { TodoItem } from '../shared/todo'

interface AppSettings {
  ballX?: number
  ballY?: number
  alwaysOnTopPinned?: boolean
  notesPinEnabled?: boolean
  /** 用于一次性迁移；缺省视为 1 */
  settingsVersion?: number
}

/** 2：主窗口默认不置顶，旧配置里保存的置顶状态不再沿用 */
const CURRENT_SETTINGS_VERSION = 2

function migrateSettingsIfNeeded(): void {
  const s = readSettings()
  const version = s.settingsVersion ?? 1
  if (version >= CURRENT_SETTINGS_VERSION) return
  const patch: Partial<AppSettings> = {
    settingsVersion: CURRENT_SETTINGS_VERSION
  }
  if (version < 2) {
    patch.alwaysOnTopPinned = false
  }
  writeSettings({ ...s, ...patch })
}

const BALL_SIZE = 64
const PANEL_WIDTH = 400
const PANEL_HEIGHT = 560

let mainWindow: BrowserWindow | null = null
let windowMode: 'ball' | 'panel' = 'ball'
/** 从悬浮球展开面板前的位置，收起时还原 */
let storedBallPosition: { x: number; y: number } | null = null
let alwaysOnTopPinned = false
let notesPinEnabled = false
let blurCollapseTimer: ReturnType<typeof setTimeout> | null = null
const pinnedTodoWindows = new Map<string, BrowserWindow>()
const dismissedPinnedTodoIds = new Set<string>()
let ballDragState:
  | {
      startCursorScreenX: number
      startCursorScreenY: number
      startWindowX: number
      startWindowY: number
    }
  | null = null
const pinnedNoteDragState = new Map<
  number,
  {
    startCursorScreenX: number
    startCursorScreenY: number
    startWindowX: number
    startWindowY: number
    startWindowWidth: number
  }
>()
const NOTE_MIN_WIDTH = 72
const NOTE_MAX_WIDTH = 720
const NOTE_HEIGHT = 42
/** 便签与可用区顶部的间距，避免贴近屏幕上沿时压住其他应用的标题栏/菜单条 */
const NOTE_TOP_MARGIN = 52
const NOTE_RIGHT_MARGIN = 0
const NOTE_GAP_Y = 8
const NOTE_GAP_X = 12

/** 各便签窗口宽度（由渲染进程按文字测量后上报） */
const pinnedNoteWidths = new Map<string, number>()

function noteWidthForTodo(todoId: string): number {
  const w = pinnedNoteWidths.get(todoId)
  if (typeof w === 'number' && Number.isFinite(w)) {
    return Math.min(NOTE_MAX_WIDTH, Math.max(NOTE_MIN_WIDTH, Math.round(w)))
  }
  return NOTE_MIN_WIDTH
}

function maxNoteWidthInColumn(
  sorted: TodoItem[],
  perColumn: number,
  col: number
): number {
  let m = NOTE_MIN_WIDTH
  for (let i = 0; i < sorted.length; i += 1) {
    if (Math.floor(i / perColumn) === col) {
      const id = sorted[i]?.id
      if (id) m = Math.max(m, noteWidthForTodo(id))
    }
  }
  return m
}

function noteColumnRightOffset(
  sorted: TodoItem[],
  perColumn: number,
  col: number
): number {
  let off = NOTE_RIGHT_MARGIN
  for (let c = 0; c < col; c += 1) {
    off += maxNoteWidthInColumn(sorted, perColumn, c) + NOTE_GAP_X
  }
  return off
}

function todoIdFromPinnedNoteWindow(win: BrowserWindow): string | null {
  for (const [id, w] of pinnedTodoWindows) {
    if (w === win) return id
  }
  return null
}

function clearBlurCollapseTimer(): void {
  if (blurCollapseTimer) {
    clearTimeout(blurCollapseTimer)
    blurCollapseTimer = null
  }
}

function scheduleCollapseOnBlurLoss(): void {
  clearBlurCollapseTimer()
  blurCollapseTimer = setTimeout(() => {
    blurCollapseTimer = null
    if (
      mainWindow &&
      !mainWindow.isDestroyed() &&
      !mainWindow.isFocused() &&
      windowMode === 'panel' &&
      !alwaysOnTopPinned
    ) {
      setMode('ball')
    }
  }, 160)
}

function userDataPath(): string {
  const dir = app.getPath('userData')
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true })
  }
  return dir
}

function todosFile(): string {
  return join(userDataPath(), 'todos.json')
}

function settingsFile(): string {
  return join(userDataPath(), 'settings.json')
}

function readSettings(): AppSettings {
  const path = settingsFile()
  if (!existsSync(path)) return {}
  try {
    const raw = readFileSync(path, 'utf-8')
    return JSON.parse(raw) as AppSettings
  } catch {
    return {}
  }
}

function writeSettings(patch: Partial<AppSettings>): void {
  const next = { ...readSettings(), ...patch }
  writeFileSync(settingsFile(), JSON.stringify(next, null, 2), 'utf-8')
}

function loadTodos(): TodoItem[] {
  const path = todosFile()
  if (!existsSync(path)) {
    return []
  }
  try {
    const raw = readFileSync(path, 'utf-8')
    const data = JSON.parse(raw) as unknown
    if (!Array.isArray(data)) return []
    const normalized = data
      .map(normalizeTodo)
      .filter((todo): todo is TodoItem => todo !== null)
    return normalized
  } catch {
    return []
  }
}

function isValidTodo(x: unknown): x is TodoItem {
  if (typeof x !== 'object' || x === null) return false
  const o = x as Record<string, unknown>
  return (
    typeof o.id === 'string' &&
    typeof o.content === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.completed === 'boolean' &&
    typeof o.pinned === 'boolean'
  )
}

function normalizeTodo(x: unknown): TodoItem | null {
  if (isValidTodo(x)) return x
  if (typeof x !== 'object' || x === null) return null
  const o = x as Record<string, unknown>
  if (
    typeof o.id === 'string' &&
    typeof o.content === 'string' &&
    typeof o.createdAt === 'string' &&
    typeof o.completed === 'boolean'
  ) {
    return {
      id: o.id,
      content: o.content,
      createdAt: o.createdAt,
      completed: o.completed,
      pinned: false
    }
  }
  return null
}

function saveTodos(todos: TodoItem[]): void {
  writeFileSync(todosFile(), JSON.stringify(todos, null, 2), 'utf-8')
}

function workAreaRightAndBounds(): {
  workArea: Electron.Rectangle
  screenRight: number
} {
  const { workArea } = screen.getPrimaryDisplay()
  return {
    workArea,
    screenRight: workArea.x + workArea.width
  }
}

function defaultBallPosition(): { x: number; y: number } {
  const { workArea, screenRight } = workAreaRightAndBounds()
  const x = screenRight - BALL_SIZE
  const y = workArea.y + Math.floor((workArea.height - BALL_SIZE) / 2)
  return { x, y }
}

function clampBallPos(x: number, y: number): { x: number; y: number } {
  const { workArea } = workAreaRightAndBounds()
  const maxX = workArea.x + workArea.width - BALL_SIZE
  const maxY = workArea.y + workArea.height - BALL_SIZE
  return {
    x: Math.max(workArea.x, Math.min(Math.round(x), maxX)),
    y: Math.max(workArea.y, Math.min(Math.round(y), maxY))
  }
}

function clampPanelY(y: number): number {
  const { workArea } = workAreaRightAndBounds()
  return Math.max(
    workArea.y,
    Math.min(y, workArea.y + workArea.height - PANEL_HEIGHT)
  )
}

function initialBallFromSettings(settings: AppSettings): { x: number; y: number } {
  const def = defaultBallPosition()
  if (typeof settings.ballX === 'number' && typeof settings.ballY === 'number') {
    return clampBallPos(settings.ballX, settings.ballY)
  }
  if (typeof settings.ballY === 'number') {
    return clampBallPos(def.x, settings.ballY)
  }
  return def
}

function applyPanelLayout(): void {
  if (!mainWindow) return
  const { screenRight } = workAreaRightAndBounds()
  const [w, h] = mainWindow.getSize()
  const centerY = mainWindow.getPosition()[1] + h / 2
  const newX = screenRight - PANEL_WIDTH
  let newY = Math.round(centerY - PANEL_HEIGHT / 2)
  newY = clampPanelY(newY)
  mainWindow.setBounds({
    x: newX,
    y: newY,
    width: PANEL_WIDTH,
    height: PANEL_HEIGHT
  })
}

/** Win11 + 透明无边框：避免 DWM 圆角/置顶组合在顶部画出浅色条带 */
function refreshWin32TransparentSurface(win: BrowserWindow | null): void {
  if (process.platform !== 'win32' || !win || win.isDestroyed()) return
  win.setBackgroundColor('#00000000')
}

function applyAlwaysOnTop(win: BrowserWindow, pinned: boolean): void {
  if (pinned) {
    win.setAlwaysOnTop(true)
  } else {
    win.setAlwaysOnTop(false)
  }
  refreshWin32TransparentSurface(win)
}

function setMode(mode: 'ball' | 'panel'): void {
  if (!mainWindow) return
  clearBlurCollapseTimer()
  ballDragState = null
  if (mode === 'panel' && windowMode === 'ball') {
    const [bx, by] = mainWindow.getPosition()
    storedBallPosition = clampBallPos(bx, by)
  }
  windowMode = mode
  if (mode === 'ball') {
    let pos: { x: number; y: number }
    if (storedBallPosition) {
      pos = clampBallPos(storedBallPosition.x, storedBallPosition.y)
    } else {
      pos = initialBallFromSettings(readSettings())
    }
    mainWindow.setBounds({
      x: pos.x,
      y: pos.y,
      width: BALL_SIZE,
      height: BALL_SIZE
    })
  } else {
    applyPanelLayout()
  }
  mainWindow.webContents.send('window-mode', mode)
}

function persistBallPosition(): void {
  if (!mainWindow || windowMode !== 'ball') return
  const [x, y] = mainWindow.getPosition()
  const c = clampBallPos(x, y)
  writeSettings({ ballX: c.x, ballY: c.y })
}

/** Vite 6 默认可能生成 `index.mjs`，开发模式常为 `index.js` */
function resolvePreloadPath(): string {
  const dir = join(__dirname, '../preload')
  for (const name of ['index.mjs', 'index.js', 'index.cjs'] as const) {
    const full = join(dir, name)
    if (existsSync(full)) {
      return full
    }
  }
  return join(dir, 'index.js')
}

function closePinnedTodoWindow(todoId: string): void {
  const win = pinnedTodoWindows.get(todoId)
  if (!win || win.isDestroyed()) {
    pinnedTodoWindows.delete(todoId)
    return
  }
  pinnedTodoWindows.delete(todoId)
  win.close()
}

function closeAllPinnedTodoWindows(): void {
  for (const todoId of [...pinnedTodoWindows.keys()]) {
    closePinnedTodoWindow(todoId)
  }
}

function findTodoById(todoId: string): TodoItem | null {
  return loadTodos().find((x) => x.id === todoId) ?? null
}

function ensurePinnedTodoWindow(todoId: string): void {
  const todo = findTodoById(todoId)
  if (!todo || todo.completed) {
    closePinnedTodoWindow(todoId)
    return
  }

  const existing = pinnedTodoWindows.get(todoId)
  if (existing && !existing.isDestroyed()) {
    existing.webContents.send('pinned-note-refresh', todo)
    return
  }

  const { workArea, screenRight } = workAreaRightAndBounds()
  const initW = noteWidthForTodo(todoId)
  const x = screenRight - NOTE_RIGHT_MARGIN - initW
  const y = workArea.y + NOTE_TOP_MARGIN

  const noteWin = new BrowserWindow({
    title: '',
    width: initW,
    height: NOTE_HEIGHT,
    minWidth: NOTE_MIN_WIDTH,
    maxWidth: NOTE_MAX_WIDTH,
    minHeight: NOTE_HEIGHT,
    maxHeight: NOTE_HEIGHT,
    x,
    y,
    frame: false,
    transparent: true,
    /**
     * 与主窗口一致：无边框透明 + Win11 圆角时，失焦后客户区外沿常出现杂色条。
     */
    ...(process.platform === 'win32'
      ? {
          thickFrame: false,
          backgroundColor: '#00000000',
          roundedCorners: false
        }
      : {}),
    alwaysOnTop: true,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: true,
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  noteWin.setAlwaysOnTop(true, 'floating')
  pinnedTodoWindows.set(todoId, noteWin)
  const noteSenderId = noteWin.webContents.id

  noteWin.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    noteWin.setTitle('')
  })
  noteWin.webContents.once('did-finish-load', () => {
    noteWin.setTitle('')
  })

  const refreshNoteWin32Transparent = (): void => {
    if (process.platform !== 'win32' || noteWin.isDestroyed()) return
    noteWin.setBackgroundColor('#00000000')
  }
  noteWin.on('blur', refreshNoteWin32Transparent)
  noteWin.on('focus', refreshNoteWin32Transparent)

  noteWin.on('closed', () => {
    pinnedNoteDragState.delete(noteSenderId)
    pinnedNoteWidths.delete(todoId)
    if (pinnedTodoWindows.get(todoId) === noteWin) {
      pinnedTodoWindows.delete(todoId)
    }
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void noteWin.loadURL(
      `${process.env['ELECTRON_RENDERER_URL']}/pinned.html?id=${encodeURIComponent(todoId)}`
    )
  } else {
    void noteWin.loadFile(join(__dirname, '../renderer/pinned.html'), {
      query: { id: todoId }
    })
  }

  noteWin.once('ready-to-show', () => {
    noteWin.show()
    noteWin.webContents.send('pinned-note-refresh', todo)
  })
}

function syncPinnedTodoWindows(): void {
  if (!notesPinEnabled) {
    closeAllPinnedTodoWindows()
    return
  }
  const todos = loadTodos()
  const pinnedIds = new Set(
    todos
      .filter((t) => !t.completed && !dismissedPinnedTodoIds.has(t.id))
      .map((t) => t.id)
  )
  for (const todo of todos) {
    if (!todo.completed && !dismissedPinnedTodoIds.has(todo.id)) {
      ensurePinnedTodoWindow(todo.id)
    }
  }
  for (const existingId of [...pinnedTodoWindows.keys()]) {
    if (!pinnedIds.has(existingId)) {
      closePinnedTodoWindow(existingId)
    }
  }

  const sorted = todos
    .filter((t) => !t.completed && !dismissedPinnedTodoIds.has(t.id))
    .sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    )
  const { workArea, screenRight } = workAreaRightAndBounds()
  const perColumn = Math.max(
    1,
    Math.floor((workArea.height - NOTE_TOP_MARGIN) / (NOTE_HEIGHT + NOTE_GAP_Y))
  )
  for (let i = 0; i < sorted.length; i += 1) {
    const todo = sorted[i]
    const win = pinnedTodoWindows.get(todo.id)
    if (!win || win.isDestroyed()) continue
    if (pinnedNoteDragState.has(win.webContents.id)) continue
    const col = Math.floor(i / perColumn)
    const row = i % perColumn
    const w = noteWidthForTodo(todo.id)
    const rightOff = noteColumnRightOffset(sorted, perColumn, col)
    const x = Math.max(workArea.x, screenRight - rightOff - w)
    const y = workArea.y + NOTE_TOP_MARGIN + row * (NOTE_HEIGHT + NOTE_GAP_Y)
    win.setBounds({ x, y, width: w, height: NOTE_HEIGHT })
  }
}

function createWindow(): void {
  migrateSettingsIfNeeded()
  const settings = readSettings()
  const ballPos = initialBallFromSettings(settings)
  /** 默认不置顶；仅当用户在设置中明确保存为 true 时才置顶 */
  alwaysOnTopPinned = settings.alwaysOnTopPinned === true
  notesPinEnabled = settings.notesPinEnabled === true

  mainWindow = new BrowserWindow({
    title: '',
    width: BALL_SIZE,
    height: BALL_SIZE,
    x: ballPos.x,
    y: ballPos.y,
    frame: false,
    transparent: true,
    /**
     * Windows：保留 DWM 粗边框时，失焦后常在透明窗口顶部画出浅色标题/非客户区条。
     * thickFrame: false 是透明无边框窗口的推荐组合，可避免该条带。
     */
    ...(process.platform === 'win32'
      ? {
          thickFrame: false,
          backgroundColor: '#00000000',
          roundedCorners: false
        }
      : {}),
    alwaysOnTop: alwaysOnTopPinned,
    skipTaskbar: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    fullscreenable: false,
    hasShadow: false,
    show: false,
    webPreferences: {
      preload: resolvePreloadPath(),
      contextIsolation: true,
      nodeIntegration: false
    }
  })

  applyAlwaysOnTop(mainWindow, alwaysOnTopPinned)

  /* Windows 无边框窗口会把 document.title 画在顶部细条上，需拦截同步 */
  mainWindow.webContents.on('page-title-updated', (event) => {
    event.preventDefault()
    mainWindow?.setTitle('')
  })
  mainWindow.webContents.once('did-finish-load', () => {
    mainWindow?.setTitle('')
  })

  /** 少数显卡/主题下失焦后 DWM 仍闪一条背景，强制刷新透明底 */
  const refreshWin32TransparentBg = (): void => {
    refreshWin32TransparentSurface(mainWindow)
  }

  mainWindow.on('blur', () => {
    refreshWin32TransparentBg()
    if (windowMode === 'panel' && !alwaysOnTopPinned) {
      scheduleCollapseOnBlurLoss()
    }
  })

  mainWindow.on('focus', () => {
    clearBlurCollapseTimer()
    refreshWin32TransparentBg()
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  mainWindow.on('close', () => {
    persistBallPosition()
  })

  if (process.env['ELECTRON_RENDERER_URL']) {
    void mainWindow.loadURL(process.env['ELECTRON_RENDERER_URL'])
  } else {
    void mainWindow.loadFile(join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
    mainWindow?.webContents.send('window-mode', windowMode)
    mainWindow?.webContents.send('always-on-top-pinned', alwaysOnTopPinned)
    mainWindow?.webContents.send('notes-pin-enabled', notesPinEnabled)
  })
}

app.whenReady().then(() => {
  createWindow()
  syncPinnedTodoWindows()

  ipcMain.handle('get-todos', () => loadTodos())

  ipcMain.handle('todo-add', (_, content: string) => {
    const text = typeof content === 'string' ? content.trim() : ''
    if (!text) return loadTodos()
    const item: TodoItem = {
      id: randomUUID(),
      content: text,
      createdAt: new Date().toISOString(),
      completed: false,
      pinned: false
    }
    const list = loadTodos()
    list.unshift(item)
    saveTodos(list)
    syncPinnedTodoWindows()
    return list
  })

  ipcMain.handle('todo-toggle', (_, id: string) => {
    if (typeof id !== 'string') return loadTodos()
    const list = loadTodos()
    const t = list.find((x) => x.id === id)
    if (t) {
      t.completed = !t.completed
      saveTodos(list)
      syncPinnedTodoWindows()
    }
    return list
  })

  ipcMain.handle('todo-delete', (_, id: string) => {
    if (typeof id !== 'string') return loadTodos()
    const list = loadTodos().filter((x) => x.id !== id)
    saveTodos(list)
    dismissedPinnedTodoIds.delete(id)
    syncPinnedTodoWindows()
    return list
  })

  ipcMain.handle('get-todo-by-id', (_, id: string) => {
    if (typeof id !== 'string') return null
    return findTodoById(id)
  })

  ipcMain.handle('dismiss-pinned-note', (_, id: string) => {
    if (typeof id !== 'string') return
    dismissedPinnedTodoIds.add(id)
    closePinnedTodoWindow(id)
  })

  ipcMain.handle('get-window-mode', () => windowMode)

  ipcMain.handle('set-window-mode', (_, mode: unknown) => {
    if (mode === 'ball' || mode === 'panel') {
      setMode(mode)
    }
  })

  ipcMain.handle(
    'ball-drag-start',
    (_, cursorScreenX: number, cursorScreenY: number) => {
      if (!mainWindow || windowMode !== 'ball') return
      if (
        typeof cursorScreenX !== 'number' ||
        typeof cursorScreenY !== 'number'
      ) {
        return
      }
      const [x, y] = mainWindow.getPosition()
      ballDragState = {
        startCursorScreenX: Math.round(cursorScreenX),
        startCursorScreenY: Math.round(cursorScreenY),
        startWindowX: x,
        startWindowY: y
      }
    }
  )

  ipcMain.handle(
    'ball-drag-move',
    (_, cursorScreenX: number, cursorScreenY: number) => {
      if (!mainWindow || windowMode !== 'ball' || !ballDragState) return
      if (
        typeof cursorScreenX !== 'number' ||
        typeof cursorScreenY !== 'number'
      ) {
        return
      }
      const dx = Math.round(cursorScreenX) - ballDragState.startCursorScreenX
      const dy = Math.round(cursorScreenY) - ballDragState.startCursorScreenY
      const c = clampBallPos(
        ballDragState.startWindowX + dx,
        ballDragState.startWindowY + dy
      )
      mainWindow.setPosition(c.x, c.y)
    }
  )

  ipcMain.handle('ball-drag-end', () => {
    if (!mainWindow || windowMode !== 'ball') return
    ballDragState = null
  })

  ipcMain.handle(
    'pinned-note-drag-start',
    (event, cursorScreenX: number, cursorScreenY: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      if (!win) return
      if (
        typeof cursorScreenX !== 'number' ||
        typeof cursorScreenY !== 'number'
      ) {
        return
      }
      const [x, y] = win.getPosition()
      const width = win.getBounds().width
      pinnedNoteDragState.set(event.sender.id, {
        startCursorScreenX: Math.round(cursorScreenX),
        startCursorScreenY: Math.round(cursorScreenY),
        startWindowX: x,
        startWindowY: y,
        startWindowWidth: width
      })
    }
  )

  ipcMain.handle(
    'pinned-note-drag-move',
    (event, cursorScreenX: number, cursorScreenY: number) => {
      const win = BrowserWindow.fromWebContents(event.sender)
      const state = pinnedNoteDragState.get(event.sender.id)
      if (!win || !state) return
      if (
        typeof cursorScreenX !== 'number' ||
        typeof cursorScreenY !== 'number'
      ) {
        return
      }
      const dx = Math.round(cursorScreenX) - state.startCursorScreenX
      const dy = Math.round(cursorScreenY) - state.startCursorScreenY
      const nextX = state.startWindowX + dx
      const nextY = state.startWindowY + dy
      const w = state.startWindowWidth
      const h = NOTE_HEIGHT
      const { workArea } = screen.getDisplayMatching(win.getBounds())
      const maxX = workArea.x + workArea.width - w
      const maxY = workArea.y + workArea.height - h
      const minY = workArea.y + NOTE_TOP_MARGIN
      const x = Math.max(workArea.x, Math.min(nextX, maxX))
      const y = Math.max(minY, Math.min(nextY, maxY))
      win.setBounds({ x, y, width: w, height: h })
    }
  )

  ipcMain.handle('pinned-note-drag-end', (event) => {
    pinnedNoteDragState.delete(event.sender.id)
  })

  ipcMain.handle('pinned-note-set-measured-width', (event, raw: unknown) => {
    if (typeof raw !== 'number' || !Number.isFinite(raw)) return
    if (pinnedNoteDragState.has(event.sender.id)) return
    const win = BrowserWindow.fromWebContents(event.sender)
    if (!win || win.isDestroyed()) return
    const tid = todoIdFromPinnedNoteWindow(win)
    if (!tid) return
    const clamped = Math.min(
      NOTE_MAX_WIDTH,
      Math.max(NOTE_MIN_WIDTH, Math.round(raw))
    )
    if (pinnedNoteWidths.get(tid) === clamped) return
    pinnedNoteWidths.set(tid, clamped)
    syncPinnedTodoWindows()
  })

  ipcMain.handle('persist-ball-position', () => {
    persistBallPosition()
  })

  ipcMain.handle('get-notes-pin-enabled', () => notesPinEnabled)

  ipcMain.handle('set-notes-pin-enabled', (_, enabled: unknown) => {
    if (typeof enabled !== 'boolean') return
    notesPinEnabled = enabled
    if (enabled) {
      dismissedPinnedTodoIds.clear()
    } else {
      closeAllPinnedTodoWindows()
    }
    writeSettings({ notesPinEnabled: enabled })
    syncPinnedTodoWindows()
    mainWindow?.webContents.send('notes-pin-enabled', enabled)
  })

  ipcMain.handle('get-always-on-top-pinned', () => alwaysOnTopPinned)

  ipcMain.handle('set-always-on-top-pinned', (_, pinned: unknown) => {
    if (typeof pinned !== 'boolean') return
    alwaysOnTopPinned = pinned
    if (pinned) {
      clearBlurCollapseTimer()
    }
    if (mainWindow) {
      applyAlwaysOnTop(mainWindow, pinned)
    }
    writeSettings({ alwaysOnTopPinned: pinned })
    mainWindow?.webContents.send('always-on-top-pinned', pinned)
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })

  screen.on('display-metrics-changed', () => {
    if (!mainWindow) return
    if (windowMode === 'ball') {
      const [x, y] = mainWindow.getPosition()
      const c = clampBallPos(x, y)
      mainWindow.setPosition(c.x, c.y)
    } else {
      applyPanelLayout()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
