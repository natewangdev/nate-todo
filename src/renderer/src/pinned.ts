import './pinned.css'
import type { TodoItem } from '../../shared/todo'

document.title = ''

const noteRoot = document.getElementById('note-root')!
const noteContent = document.getElementById('note-content')!

let todoId = ''
let dragActive = false
let measureRaf = 0

function intrinsicNoteWidthPx(): number {
  const rootStyle = getComputedStyle(noteRoot)
  const pad =
    parseFloat(rootStyle.paddingLeft) + parseFloat(rootStyle.paddingRight)
  const border =
    parseFloat(rootStyle.borderLeftWidth) +
    parseFloat(rootStyle.borderRightWidth)
  const text = noteContent.textContent ?? ''
  if (!text) return Math.ceil(pad + border)
  const cs = getComputedStyle(noteContent)
  const canvas = document.createElement('canvas')
  const ctx = canvas.getContext('2d')
  if (!ctx) return Math.ceil(pad + border)
  ctx.font = cs.font
  return Math.ceil(ctx.measureText(text).width + pad + border)
}

function scheduleReportWidth(): void {
  if (measureRaf) cancelAnimationFrame(measureRaf)
  measureRaf = requestAnimationFrame(() => {
    measureRaf = 0
    const w = intrinsicNoteWidthPx()
    if (w > 0) void window.nateTodo.pinnedNoteSetMeasuredWidth(w)
  })
}

function renderTodo(todo: TodoItem | null): void {
  if (!todo) {
    noteContent.textContent = '该代办已不存在'
    scheduleReportWidth()
    return
  }
  noteContent.textContent = todo.content
  scheduleReportWidth()
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

  const ro = new ResizeObserver(() => scheduleReportWidth())
  ro.observe(noteContent)
}

void bootstrap()
