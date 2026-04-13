import { contextBridge, ipcRenderer } from 'electron'
import type { TodoItem } from '../shared/todo'

contextBridge.exposeInMainWorld('nateTodo', {
  getTodos: (): Promise<TodoItem[]> => ipcRenderer.invoke('get-todos'),
  todoAdd: (content: string): Promise<TodoItem[]> =>
    ipcRenderer.invoke('todo-add', content),
  todoToggle: (id: string): Promise<TodoItem[]> =>
    ipcRenderer.invoke('todo-toggle', id),
  todoDelete: (id: string): Promise<TodoItem[]> =>
    ipcRenderer.invoke('todo-delete', id),
  getTodoById: (id: string): Promise<TodoItem | null> =>
    ipcRenderer.invoke('get-todo-by-id', id),
  dismissPinnedNote: (id: string): Promise<void> =>
    ipcRenderer.invoke('dismiss-pinned-note', id),
  getWindowMode: (): Promise<'ball' | 'panel'> =>
    ipcRenderer.invoke('get-window-mode'),
  setWindowMode: (mode: 'ball' | 'panel'): Promise<void> =>
    ipcRenderer.invoke('set-window-mode', mode),
  ballDragStart: (screenX: number, screenY: number): Promise<void> =>
    ipcRenderer.invoke('ball-drag-start', screenX, screenY),
  ballDragMove: (screenX: number, screenY: number): Promise<void> =>
    ipcRenderer.invoke('ball-drag-move', screenX, screenY),
  ballDragEnd: (): Promise<void> => ipcRenderer.invoke('ball-drag-end'),
  pinnedNoteDragStart: (screenX: number, screenY: number): Promise<void> =>
    ipcRenderer.invoke('pinned-note-drag-start', screenX, screenY),
  pinnedNoteDragMove: (screenX: number, screenY: number): Promise<void> =>
    ipcRenderer.invoke('pinned-note-drag-move', screenX, screenY),
  pinnedNoteDragEnd: (): Promise<void> => ipcRenderer.invoke('pinned-note-drag-end'),
  pinnedNoteSetMeasuredWidth: (widthPx: number): Promise<void> =>
    ipcRenderer.invoke('pinned-note-set-measured-width', widthPx),
  persistBallPosition: (): Promise<void> =>
    ipcRenderer.invoke('persist-ball-position'),
  getNotesPinEnabled: (): Promise<boolean> =>
    ipcRenderer.invoke('get-notes-pin-enabled'),
  setNotesPinEnabled: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('set-notes-pin-enabled', enabled),
  getLaunchAtLogin: (): Promise<boolean> =>
    ipcRenderer.invoke('get-launch-at-login'),
  setLaunchAtLogin: (enabled: boolean): Promise<void> =>
    ipcRenderer.invoke('set-launch-at-login', enabled),
  getAlwaysOnTopPinned: (): Promise<boolean> =>
    ipcRenderer.invoke('get-always-on-top-pinned'),
  setAlwaysOnTopPinned: (pinned: boolean): Promise<void> =>
    ipcRenderer.invoke('set-always-on-top-pinned', pinned),
  onWindowMode: (callback: (mode: 'ball' | 'panel') => void): void => {
    ipcRenderer.on('window-mode', (_event, mode: 'ball' | 'panel') => {
      callback(mode)
    })
  },
  onAlwaysOnTopPinned: (callback: (pinned: boolean) => void): void => {
    ipcRenderer.on(
      'always-on-top-pinned',
      (_event, pinned: boolean) => {
        callback(pinned)
      }
    )
  },
  onPinnedNoteRefresh: (callback: (todo: TodoItem) => void): void => {
    ipcRenderer.on('pinned-note-refresh', (_event, todo: TodoItem) => {
      callback(todo)
    })
  },
  onNotesPinEnabled: (callback: (enabled: boolean) => void): void => {
    ipcRenderer.on('notes-pin-enabled', (_event, enabled: boolean) => {
      callback(enabled)
    })
  },
  onLaunchAtLogin: (callback: (enabled: boolean) => void): void => {
    ipcRenderer.on('launch-at-login', (_event, enabled: boolean) => {
      callback(enabled)
    })
  }
})
