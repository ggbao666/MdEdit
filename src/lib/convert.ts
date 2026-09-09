import { getSchema } from '@tiptap/core'
import type { JSONContent } from '@tiptap/core'
import { DOMParser as PMDOMParser } from '@tiptap/pm/model'
import type { Schema } from '@tiptap/pm/model'
import { createExtensions } from '../editor/extensions'
import { docToMarkdown } from './markdown'

let cachedSchema: Schema | null = null

/** 复用编辑器的扩展装配来造 schema，保证离线解析结果与编辑器一致 */
function schema(): Schema {
  if (!cachedSchema) cachedSchema = getSchema(createExtensions())
  return cachedSchema
}

/**
 * 把存储的 HTML 还原成 Tiptap 文档 JSON。
 * 批量导出时要给「非当前文档」生成 Markdown，但只有 HTML 落盘，
 * 所以不能依赖 editor.getJSON() —— 这里用 ProseMirror 的 DOMParser 离线解析。
 */
export function htmlToDocJson(html: string): JSONContent {
  const dom = new window.DOMParser().parseFromString(html || '<p></p>', 'text/html')
  return PMDOMParser.fromSchema(schema()).parse(dom.body).toJSON()
}

export function htmlToMarkdown(html: string): string {
  return docToMarkdown(htmlToDocJson(html))
}
