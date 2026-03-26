import './pinned.css'
import type { TodoItem } from '../../shared/todo'

document.title = ''

const noteRoot = document.getElementById('note-root')!
const noteContent = document.getElementById('note-content')!

let todoId = ''
let dragActive = false

function renderTodo(todo: TodoItem | null): void {
  if (!todo) {
    noteContent.textContent = '该代办已不存在'
    return
  }
  noteContent.textContent = todo.content
}

function wireInteractions(): void {
  noteRoot.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return
    dragActive = true
    noteRoot.classList.add('is-dragging')
    void window.nateTodo.pinnedNoteDragStart(e.screenX, e.screenY)
    noteRoot.setPointerCapture(e.pointerId)
  })

  noteRoot.addEventListener('pointermove', (e) => {
    if (!dragActive) return
    void window.nateTodo.pinnedNoteDragMove(e.screenX, e.screenY)
  })

  const stopDrag = (e: PointerEvent): void => {
    if (!dragActive) return
    dragActive = false
    noteRoot.classList.remove('is-dragging')
    void window.nateTodo.pinnedNoteDragEnd()
    try {
      noteRoot.releasePointerCapture(e.pointerId)
    } catch {
      /* ignore */
    }
  }

  noteRoot.addEventListener('pointerup', stopDrag)
  noteRoot.addEventListener('pointercancel', stopDrag)

  noteRoot.addEventListener('dblclick', (e) => {
    e.preventDefault()
    if (!todoId) return
    void window.nateTodo.dismissPinnedNote(todoId)
  })
}

async function bootstrap(): Promise<void> {
  const params = new URLSearchParams(window.location.search)
  todoId = params.get('id') ?? ''
  if (!todoId) {
    renderTodo(null)
    return
  }
  wireInteractions()
  renderTodo(await window.nateTodo.getTodoById(todoId))
  window.nateTodo.onPinnedNoteRefresh((todo) => {
    if (todo.id === todoId) {
      renderTodo(todo)
    }
  })
}

void bootstrap()
