import './style.css'
import type { TodoItem } from '../../shared/todo'

document.title = ''

/** 小于该移动距离视为单击展开，略小以便拖动更易触发 */
const DRAG_PX = 4
const PAGE_SIZE = 5

const ballRoot = document.getElementById('app-ball')!
const panelRoot = document.getElementById('app-panel')!
const ballBadge = document.getElementById('ball-badge')!
const todoListEl = document.getElementById('todo-list')!
const todoPager = document.getElementById('todo-pager')!
const btnPagePrev = document.getElementById('btn-page-prev')!
const btnPageNext = document.getElementById('btn-page-next')!
const todoPageInfo = document.getElementById('todo-page-info')!
const inputNew = document.getElementById('input-new') as HTMLInputElement
const btnAdd = document.getElementById('btn-add')!
const btnPin = document.getElementById('btn-pin')!
const btnCollapse = document.getElementById('btn-collapse')!
const chkLaunchAtLogin = document.getElementById(
  'chk-launch-at-login'
) as HTMLInputElement
const btnSettings = document.getElementById('btn-settings')!
const settingsMenu = document.getElementById('settings-menu')!
const settingsAnchor = document.getElementById('settings-anchor')!

function setSettingsOpen(open: boolean): void {
  settingsMenu.classList.toggle('hidden', !open)
  btnSettings.setAttribute('aria-expanded', String(open))
  btnSettings.classList.toggle('is-open', open)
}

let todos: TodoItem[] = []
let currentPage = 1
/** 正在行内编辑的待办 id；null 表示未在编辑 */
let editingTodoId: string | null = null
/** 避免 Escape / Enter 触发的 blur 与提交逻辑打架 */
let skipEditBlur = false
let ballDrag = false
let ballStartClientX = 0
let ballStartClientY = 0
let ballStartScreenX = 0
let ballStartScreenY = 0
let ballHasDragged = false

function incompleteCount(list: TodoItem[]): number {
  return list.filter((t) => !t.completed).length
}

function sortTodos(list: TodoItem[]): TodoItem[] {
  return [...list].sort((a, b) => {
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1
    }
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  })
}

function formatCreated(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  })
}

function commitTodoEdit(id: string, raw: string): void {
  const text = raw.trim()
  if (!text) {
    editingTodoId = null
    renderList()
    return
  }
  const prev = todos.find((t) => t.id === id)?.content
  if (prev === text) {
    editingTodoId = null
    renderList()
    return
  }
  void window.nateTodo.todoUpdateContent(id, text).then((list) => {
    todos = list
    editingTodoId = null
    updateBadge()
    renderList()
  })
}

function updateBadge(): void {
  const n = incompleteCount(todos)
  if (n > 0) {
    ballBadge.textContent = String(n)
    ballBadge.classList.remove('hidden')
  } else {
    ballBadge.classList.add('hidden')
  }
}

function applyMode(mode: 'ball' | 'panel'): void {
  if (mode === 'ball') {
    setSettingsOpen(false)
    ballRoot.classList.remove('hidden')
    panelRoot.classList.add('hidden')
  } else {
    ballRoot.classList.add('hidden')
    panelRoot.classList.remove('hidden')
    inputNew.focus()
  }
}

function renderList(): void {
  todoListEl.replaceChildren()
  const sorted = sortTodos(todos)
  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE))
  currentPage = Math.min(Math.max(1, currentPage), totalPages)
  const pageStart = (currentPage - 1) * PAGE_SIZE
  const pageItems = sorted.slice(pageStart, pageStart + PAGE_SIZE)

  for (const item of pageItems) {
    const li = document.createElement('li')
    li.className = 'todo-item' + (item.completed ? ' todo-done' : '')

    const row = document.createElement('div')
    row.className = 'todo-row'

    const check = document.createElement('input')
    check.type = 'checkbox'
    check.checked = item.completed
    check.title = item.completed ? '标为未完成' : '完成'
    check.addEventListener('change', () => {
      void window.nateTodo.todoToggle(item.id).then((list) => {
        todos = list
        updateBadge()
        renderList()
      })
    })

    const body = document.createElement('div')
    body.className = 'todo-body'

    if (item.id === editingTodoId) {
      const input = document.createElement('input')
      input.type = 'text'
      input.className = 'todo-text todo-text-input'
      input.value = item.content
      input.maxLength = 500
      input.setAttribute('aria-label', '编辑待办内容，回车保存')
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault()
          skipEditBlur = true
          commitTodoEdit(item.id, input.value)
        } else if (e.key === 'Escape') {
          e.preventDefault()
          skipEditBlur = true
          editingTodoId = null
          renderList()
        }
      })
      input.addEventListener('blur', () => {
        setTimeout(() => {
          if (skipEditBlur) {
            skipEditBlur = false
            return
          }
          if (editingTodoId !== item.id) return
          commitTodoEdit(item.id, input.value)
        }, 0)
      })
      requestAnimationFrame(() => {
        input.focus()
        input.select()
      })
      const meta = document.createElement('div')
      meta.className = 'todo-meta'
      meta.textContent = formatCreated(item.createdAt)
      body.append(input, meta)
    } else {
      const text = document.createElement('div')
      text.className = 'todo-text'
      text.textContent = item.content
      text.title = '双击修改'
      text.addEventListener('dblclick', () => {
        editingTodoId = item.id
        renderList()
      })

      const meta = document.createElement('div')
      meta.className = 'todo-meta'
      meta.textContent = formatCreated(item.createdAt)

      body.append(text, meta)
    }

    const del = document.createElement('button')
    del.type = 'button'
    del.className = 'btn-delete'
    del.title = '删除'
    del.textContent = '×'
    del.addEventListener('click', () => {
      void window.nateTodo.todoDelete(item.id).then((list) => {
        todos = list
        updateBadge()
        renderList()
      })
    })

    row.append(check, body, del)
    li.append(row)
    todoListEl.append(li)
  }
  const needPager = sorted.length > PAGE_SIZE
  todoPager.classList.toggle('hidden', !needPager)
  todoPageInfo.textContent = `${currentPage} / ${totalPages}`
  ;(btnPagePrev as HTMLButtonElement).disabled = currentPage <= 1
  ;(btnPageNext as HTMLButtonElement).disabled = currentPage >= totalPages
  updateBadge()
}

async function refreshTodos(): Promise<void> {
  todos = await window.nateTodo.getTodos()
  updateBadge()
  renderList()
}

function wireBallPointer(): void {
  ballRoot.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    ballDrag = true
    ballHasDragged = false
    ballRoot.classList.add('is-dragging')
    ballStartClientX = e.clientX
    ballStartClientY = e.clientY
    ballStartScreenX = e.screenX
    ballStartScreenY = e.screenY
    void window.nateTodo.ballDragStart(e.screenX, e.screenY)
    ballRoot.setPointerCapture(e.pointerId)
  })

  ballRoot.addEventListener('pointermove', (e) => {
    if (!ballDrag) return
    const movedScreen = Math.hypot(
      e.screenX - ballStartScreenX,
      e.screenY - ballStartScreenY
    )
    if (movedScreen >= DRAG_PX) {
      ballHasDragged = true
    }
    void window.nateTodo.ballDragMove(e.screenX, e.screenY)
  })

  const finishBallPointer = (e: PointerEvent): void => {
    if (!ballDrag) return
    ballDrag = false
    ballRoot.classList.remove('is-dragging')
    void window.nateTodo.ballDragEnd()
    try {
      ballRoot.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
    const moved = Math.hypot(
      e.clientX - ballStartClientX,
      e.clientY - ballStartClientY
    )
    const movedScreen = Math.hypot(
      e.screenX - ballStartScreenX,
      e.screenY - ballStartScreenY
    )
    if (!ballHasDragged && moved < DRAG_PX && movedScreen < DRAG_PX) {
      void window.nateTodo.setWindowMode('panel')
    } else {
      void window.nateTodo.persistBallPosition()
    }
  }

  ballRoot.addEventListener('pointerup', finishBallPointer)
  ballRoot.addEventListener('pointercancel', finishBallPointer)
}

function syncPinButton(pinned: boolean): void {
  btnPin.setAttribute('aria-pressed', String(pinned))
  btnPin.title = pinned
    ? '点击后关闭右上角便签'
    : '点击后将所有未完成代办置顶为便签'
  btnPin.setAttribute(
    'aria-label',
    pinned
      ? '便签置顶已开启，点击关闭'
      : '便签置顶已关闭，点击开启'
  )
  btnPin.classList.toggle('is-active', pinned)
  btnPin.querySelector('.pin-on')?.classList.toggle('hidden', !pinned)
  btnPin.querySelector('.pin-off')?.classList.toggle('hidden', pinned)
}

function wirePanel(): void {
  btnPin.addEventListener('click', () => {
    const enabled = btnPin.getAttribute('aria-pressed') === 'true'
    void window.nateTodo.setNotesPinEnabled(!enabled)
  })

  btnCollapse.addEventListener('click', () => {
    void window.nateTodo.setWindowMode('ball')
  })

  btnPagePrev.addEventListener('click', () => {
    if (currentPage <= 1) return
    currentPage -= 1
    renderList()
  })

  btnPageNext.addEventListener('click', () => {
    const totalPages = Math.max(1, Math.ceil(todos.length / PAGE_SIZE))
    if (currentPage >= totalPages) return
    currentPage += 1
    renderList()
  })

  const submitNew = (): void => {
    const text = inputNew.value
    inputNew.value = ''
    void window.nateTodo.todoAdd(text).then((list) => {
      todos = list
      currentPage = 1
      updateBadge()
      renderList()
    })
  }

  btnAdd.addEventListener('click', () => {
    submitNew()
  })

  inputNew.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitNew()
    }
  })

  chkLaunchAtLogin.addEventListener('change', () => {
    void window.nateTodo.setLaunchAtLogin(chkLaunchAtLogin.checked)
  })

  btnSettings.addEventListener('click', (e) => {
    e.stopPropagation()
    setSettingsOpen(settingsMenu.classList.contains('hidden'))
  })

  document.addEventListener(
    'pointerdown',
    (e) => {
      if (settingsMenu.classList.contains('hidden')) return
      const t = e.target as Node
      if (settingsAnchor.contains(t)) return
      setSettingsOpen(false)
    },
    true
  )

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return
    if (!settingsMenu.classList.contains('hidden')) setSettingsOpen(false)
  })
}

async function bootstrap(): Promise<void> {
  wireBallPointer()
  wirePanel()

  window.nateTodo.onWindowMode((mode) => {
    applyMode(mode)
    if (mode === 'panel') {
      void refreshTodos()
    }
  })

  window.nateTodo.onNotesPinEnabled((enabled) => {
    syncPinButton(enabled)
  })

  window.nateTodo.onLaunchAtLogin((enabled) => {
    chkLaunchAtLogin.checked = enabled
  })

  const mode = await window.nateTodo.getWindowMode()
  applyMode(mode)
  syncPinButton(await window.nateTodo.getNotesPinEnabled())
  chkLaunchAtLogin.checked = await window.nateTodo.getLaunchAtLogin()
  await refreshTodos()
}

void bootstrap()
