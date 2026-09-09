import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { markdownToHtml } from '../lib/markdown'

const MD_BLOCK_HINT = /(^|\n)\s{0,3}(#{1,6}\s|[-*+]\s|\d+[.)]\s|>\s|```|\[[ xX]\]\s|\|.*\|)/
const MD_INLINE_HINT = /(\*\*|__|~~|`[^`]+`)/

/**
 * 粘贴纯文本时，如果内容看起来是 Markdown，就先转成富文本再插入。
 * 剪贴板里已经有 HTML（从网页/文档复制）时保持浏览器默认行为。
 */
export function markdownPasteHandler(view: EditorView, event: ClipboardEvent): boolean {
  const data = event.clipboardData
  if (!data) return false

  if (data.getData('text/html').trim()) return false

  const text = data.getData('text/plain')
  if (!text.trim()) return false
  if (!MD_BLOCK_HINT.test(text) && !MD_INLINE_HINT.test(text)) return false

  try {
    const doc = new window.DOMParser().parseFromString(markdownToHtml(text), 'text/html')
    const slice = PMDOMParser.fromSchema(view.state.schema).parseSlice(doc.body, {
      preserveWhitespace: false,
    })
    view.dispatch(view.state.tr.replaceSelection(slice).scrollIntoView())
    return true
  } catch {
    return false
  }
}
