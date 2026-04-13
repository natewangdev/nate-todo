import type { TodoItem } from '../../shared/todo'

declare global {
  interface Window {
    nateTodo: {
      getTodos: () => Promise<TodoItem[]>
      todoAdd: (content: string) => Promise<TodoItem[]>
      todoToggle: (id: string) => Promise<TodoItem[]>
      todoDelete: (id: string) => Promise<TodoItem[]>
      todoUpdateContent: (id: string, content: string) => Promise<TodoItem[]>
      getTodoById: (id: string) => Promise<TodoItem | null>
      dismissPinnedNote: (id: string) => Promise<void>
      getWindowMode: () => Promise<'ball' | 'panel'>
      setWindowMode: (mode: 'ball' | 'panel') => Promise<void>
      ballDragStart: (screenX: number, screenY: number) => Promise<void>
      ballDragMove: (screenX: number, screenY: number) => Promise<void>
      ballDragEnd: () => Promise<void>
      pinnedNoteDragStart: (screenX: number, screenY: number) => Promise<void>
      pinnedNoteDragMove: (screenX: number, screenY: number) => Promise<void>
      pinnedNoteDragEnd: () => Promise<void>
      pinnedNoteSetMeasuredWidth: (widthPx: number) => Promise<void>
      persistBallPosition: () => Promise<void>
      getNotesPinEnabled: () => Promise<boolean>
      setNotesPinEnabled: (enabled: boolean) => Promise<void>
      getLaunchAtLogin: () => Promise<boolean>
      setLaunchAtLogin: (enabled: boolean) => Promise<void>
      getAlwaysOnTopPinned: () => Promise<boolean>
      setAlwaysOnTopPinned: (pinned: boolean) => Promise<void>
      onWindowMode: (callback: (mode: 'ball' | 'panel') => void) => void
      onAlwaysOnTopPinned: (callback: (pinned: boolean) => void) => void
      onPinnedNoteRefresh: (callback: (todo: TodoItem) => void) => void
      onNotesPinEnabled: (callback: (enabled: boolean) => void) => void
      onLaunchAtLogin: (callback: (enabled: boolean) => void) => void
    }
  }
}

export {}
