import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react'
import { markdown } from '@codemirror/lang-markdown'
import { EditorState, Prec } from '@codemirror/state'
import { EditorView, keymap } from '@codemirror/view'
import { basicSetup } from 'codemirror'

export interface SourceEditorHandle {
  focus: () => void
  focusAt: (position: number) => void
  insertText: (text: string) => void
}

interface SourceEditorProps {
  value: string
  onChange: (value: string) => void
  onSelectionChange: (position: number) => void
  onImages: (files: File[]) => void
  onToggleMode: () => void
}

const sourceTheme = EditorView.theme({
  '&': {
    height: '100%',
    color: 'var(--text)',
    backgroundColor: 'transparent',
    fontSize: 'var(--editor-font-size, 16.5px)',
  },
  '.cm-content': {
    minHeight: 'calc(100vh - var(--topbar-h) - var(--toolbar-h) - var(--status-h) - 120px)',
    padding: '0',
    fontFamily: 'var(--font-mono)',
    lineHeight: '1.75',
  },
  '.cm-line': { padding: '0 4px' },
  '.cm-gutters': {
    color: 'var(--text-3)',
    backgroundColor: 'transparent',
    border: 'none',
    paddingRight: '10px',
  },
  '.cm-activeLine, .cm-activeLineGutter': { backgroundColor: 'var(--accent-soft)' },
  '.cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection': {
    backgroundColor: 'var(--accent-ring) !important',
  },
  '&.cm-focused': { outline: 'none' },
})

function imageFiles(list: FileList | null): File[] {
  if (!list) return []
  return Array.from(list).filter(
    (file) => file.type.startsWith('image/') || /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(file.name),
  )
}

const SourceEditor = forwardRef<SourceEditorHandle, SourceEditorProps>(function SourceEditor(
  { value, onChange, onSelectionChange, onImages, onToggleMode },
  ref,
) {
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const applyingExternalValue = useRef(false)
  const callbacksRef = useRef({ onChange, onSelectionChange, onImages, onToggleMode })
  callbacksRef.current = { onChange, onSelectionChange, onImages, onToggleMode }

  useImperativeHandle(ref, () => ({
    focus: () => viewRef.current?.focus(),
    focusAt: (position) => {
      const view = viewRef.current
      if (!view) return
      const anchor = Math.min(Math.max(0, position), view.state.doc.length)
      view.dispatch({ selection: { anchor }, scrollIntoView: true })
      view.focus()
    },
    insertText: (text) => {
      const view = viewRef.current
      if (!view) return
      const { from, to } = view.state.selection.main
      view.dispatch({
        changes: { from, to, insert: text },
        selection: { anchor: from + text.length },
        scrollIntoView: true,
      })
      view.focus()
    },
  }), [])

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: value,
        extensions: [
          // 覆盖 basicSetup 的 Markdown 注释快捷键，在源码编辑器内直接完成模式切换。
          Prec.highest(keymap.of([{
            key: 'Mod-/',
            preventDefault: true,
            stopPropagation: true,
            run: () => {
              callbacksRef.current.onToggleMode()
              return true
            },
          }])),
          basicSetup,
          markdown(),
          EditorView.lineWrapping,
          sourceTheme,
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingExternalValue.current) {
              callbacksRef.current.onChange(update.state.doc.toString())
            }
            if (update.selectionSet || update.docChanged) {
              callbacksRef.current.onSelectionChange(update.state.selection.main.head)
            }
          }),
          EditorView.domEventHandlers({
            paste: (event) => {
              const files = imageFiles(event.clipboardData?.files ?? null)
              if (files.length === 0) return false
              event.preventDefault()
              callbacksRef.current.onImages(files)
              return true
            },
            drop: (event) => {
              const files = imageFiles(event.dataTransfer?.files ?? null)
              if (files.length === 0) return false
              event.preventDefault()
              callbacksRef.current.onImages(files)
              return true
            },
          }),
        ],
      }),
    })
    viewRef.current = view
    callbacksRef.current.onSelectionChange(view.state.selection.main.head)
    requestAnimationFrame(() => requestAnimationFrame(() => view.focus()))
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // EditorView 的生命周期只绑定宿主节点；内容在下面单独同步。
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    applyingExternalValue.current = true
    try {
      view.dispatch({ changes: { from: 0, to: current.length, insert: value } })
    } finally {
      applyingExternalValue.current = false
    }
  }, [value])

  return <div className="source-editor" ref={hostRef} />
})

export default SourceEditor
