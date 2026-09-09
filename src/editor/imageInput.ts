import { TextSelection } from '@tiptap/pm/state'
import type { EditorView } from '@tiptap/pm/view'
import { pickImageFiles } from '../lib/assets'
import { markdownPasteHandler } from './paste'

/**
 * 粘贴：剪贴板里是图片就交给上层写资源文件，否则退回 Markdown 文本粘贴。
 */
export function createPasteHandler(onFiles: (files: File[]) => void) {
  return (view: EditorView, event: ClipboardEvent): boolean => {
    const files = pickImageFiles(event.clipboardData?.files)
    if (files.length === 0) return markdownPasteHandler(view, event)

    event.preventDefault()
    onFiles(files)
    return true
  }
}

/**
 * 拖入：图片文件直接插入到落点位置；编辑器内部的节点拖动（moved）不拦。
 */
export function createDropHandler(onFiles: (files: File[]) => void) {
  return (view: EditorView, event: DragEvent, _slice: unknown, moved: boolean): boolean => {
    if (moved) return false
    const files = pickImageFiles(event.dataTransfer?.files)
    if (files.length === 0) return false

    event.preventDefault()

    const coords = view.posAtCoords({ left: event.clientX, top: event.clientY })
    if (coords) {
      const { doc } = view.state
      const pos = Math.min(Math.max(coords.pos, 0), doc.content.size)
      view.dispatch(view.state.tr.setSelection(TextSelection.create(doc, pos)))
    }

    onFiles(files)
    return true
  }
}
