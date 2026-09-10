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
    if (files.length === 0) {
      const { selection } = view.state
      const text = event.clipboardData?.getData('text/plain')

      // A code block is a single text node whose line breaks are significant. Letting the
      // browser paste rich HTML here can turn every copied line into a separate paragraph,
      // which moves all but the first line outside the code block.
      if (
        text &&
        selection.$from.parent === selection.$to.parent &&
        selection.$from.parent.type.name === 'codeBlock'
      ) {
        event.preventDefault()
        view.dispatch(view.state.tr.insertText(text.replace(/\r\n?/g, '\n')).scrollIntoView())
        return true
      }

      return markdownPasteHandler(view, event)
    }

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
