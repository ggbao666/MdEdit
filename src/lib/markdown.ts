import { marked } from 'marked'
import type { JSONContent } from '@tiptap/core'

marked.setOptions({ gfm: true, breaks: false })

/* ============================================================
   Markdown → HTML（导入）
   ============================================================ */

/**
 * 把 marked 产出的标准 HTML 规整成 Tiptap 能识别的结构。
 * 主要是任务列表：marked 输出 <li><input type=checkbox> … </li>，
 * 而 Tiptap 的 TaskList / TaskItem 依赖 data-type 属性解析。
 */
function normalizeForTiptap(html: string): string {
  const host = document.createElement('div')
  host.innerHTML = html

  host.querySelectorAll('li').forEach((li) => {
    const first = li.firstElementChild as HTMLInputElement | null
    if (!first) return
    if (first.tagName !== 'INPUT' || first.type !== 'checkbox') return

    li.setAttribute('data-type', 'taskItem')
    li.setAttribute('data-checked', first.hasAttribute('checked') ? 'true' : 'false')
    first.remove()

    const parent = li.parentElement
    if (parent && parent.tagName === 'UL') {
      parent.setAttribute('data-type', 'taskList')
    }
  })

  return host.innerHTML
}

export function markdownToHtml(md: string): string {
  const raw = marked.parse(md, { async: false, gfm: true }) as string
  return normalizeForTiptap(raw)
}

/* ============================================================
   Doc → Markdown（导出）
   ============================================================ */

const INLINE_ESCAPE = /([\\`*[\]])/g

function escapeText(text: string): string {
  return text.replace(INLINE_ESCAPE, '\\$1')
}

function inlineChildren(node: JSONContent): string {
  return (node.content ?? []).map(inlineNode).join('')
}

function markOf(node: JSONContent, type: string) {
  return (node.marks ?? []).find((m) => m.type === type)
}

function inlineNode(node: JSONContent): string {
  if (node.type === 'hardBreak') return '  \n'
  if (node.type !== 'text') return ''

  const raw = node.text ?? ''
  if (!raw) return ''

  if (markOf(node, 'code')) {
    const tick = '`'
    return raw.includes(tick)
      ? ` ${tick}${tick} ${raw} ${tick}${tick} `
      : `${tick}${raw}${tick}`
  }

  let text = escapeText(raw)
  if (markOf(node, 'bold')) text = `**${text}**`
  if (markOf(node, 'italic')) text = `*${text}*`
  if (markOf(node, 'strike')) text = `~~${text}~~`
  if (markOf(node, 'underline')) text = `<u>${text}</u>`
  if (markOf(node, 'highlight')) text = `==${text}==`

  const link = markOf(node, 'link')
  if (link) text = `[${text}](${String(link.attrs?.href ?? '')})`

  return text
}

function fenceFor(code: string): string {
  const runs = code.match(/`+/g) ?? []
  const longest = runs.reduce((max, r) => Math.max(max, r.length), 0)
  return '`'.repeat(Math.max(3, longest + 1))
}

function tableToMd(node: JSONContent): string {
  const rows = (node.content ?? []).map((row) =>
    (row.content ?? []).map((cell) => serializeBlocks(cell.content ?? []).replace(/\n+/g, ' ').trim()),
  )
  if (rows.length === 0) return ''

  const cols = rows.reduce((max, r) => Math.max(max, r.length), 0)
  const padded = rows.map((r) => [...r, ...Array(Math.max(0, cols - r.length)).fill('')])
  const [head, ...body] = padded
  const sep = '| ' + Array(cols).fill('---').join(' | ') + ' |'

  return ['| ' + head.join(' | ') + ' |', sep, ...body.map((r) => '| ' + r.join(' | ') + ' |')].join('\n')
}

/**
 * 图片：写进 Markdown 的永远是节点上的相对引用 rel，
 * 而不是渲染用的 tiptora:// 协议地址或 data URI（接口上根本没存 src）。
 */
function imageToMd(node: JSONContent): string {
  const rel = String(node.attrs?.rel ?? '').trim()
  if (!rel) return ''

  const alt = String(node.attrs?.alt ?? '').replace(/[[\]]/g, '\\$&')
  const title = String(node.attrs?.title ?? '').replace(/"/g, "'")
  // 路径里有空格或括号时用 <> 包起来，避免 Markdown 解析断掉
  const target = /[\s()<>]/.test(rel) ? `<${rel}>` : rel
  return `![${alt}](${target}${title ? ` "${title}"` : ''})`
}

const LIST_LIKE = new Set(['bulletList', 'orderedList', 'taskList'])

/** 渲染列表项主体；嵌套列表自身带缩进，不再叠加父级缩进 */
function listItemBody(li: JSONContent, depth: number, marker: string): string {
  const pad = '  '.repeat(depth)
  const out: string[] = []
  let isFirst = true

  for (const child of li.content ?? []) {
    const text = serializeBlock(child, depth + 1)
    if (!text) continue
    const lines = text.split('\n')

    if (isFirst) {
      out.push(pad + marker + ' ' + lines[0])
      out.push(...lines.slice(1).map((l) => (l ? pad + '  ' + l : '')))
      isFirst = false
    } else if (LIST_LIKE.has(child.type ?? '')) {
      out.push(...lines)
    } else {
      out.push(...lines.map((l) => (l ? pad + '  ' + l : '')))
    }
  }

  return out.length ? out.join('\n') : pad + marker
}

function listItemToMd(li: JSONContent, depth: number, marker: string): string {
  return listItemBody(li, depth, marker)
}

function taskItemToMd(li: JSONContent, depth: number): string {
  const checked = li.attrs?.checked === true
  return listItemBody(li, depth, `- [${checked ? 'x' : ' '}]`).trimEnd()
}

function serializeBlock(node: JSONContent, depth: number): string {
  switch (node.type) {
    case 'heading': {
      const level = Math.min(6, Math.max(1, Number(node.attrs?.level ?? 1)))
      return '#'.repeat(level) + ' ' + inlineChildren(node)
    }
    case 'paragraph':
      return inlineChildren(node)
    case 'blockquote': {
      const inner = serializeBlocks(node.content ?? [], depth)
      return inner
        .split('\n')
        .map((line) => (line ? '> ' + line : '>'))
        .join('\n')
    }
    case 'codeBlock': {
      const lang = String(node.attrs?.language ?? '')
      const code = (node.content ?? []).map((n) => n.text ?? '').join('')
      const fence = fenceFor(code)
      return `${fence}${lang}\n${code}\n${fence}`
    }
    case 'bulletList':
      return (node.content ?? []).map((li) => listItemToMd(li, depth, '-')).join('\n')
    case 'orderedList': {
      const start = Number(node.attrs?.start ?? 1)
      return (node.content ?? []).map((li, i) => listItemToMd(li, depth, `${start + i}.`)).join('\n')
    }
    case 'taskList':
      return (node.content ?? []).map((li) => taskItemToMd(li, depth)).join('\n')
    case 'horizontalRule':
      return '---'
    case 'table':
      return tableToMd(node)
    case 'image':
      return imageToMd(node)
    default:
      return serializeBlocks(node.content ?? [], depth)
  }
}

function serializeBlocks(nodes: JSONContent[], depth = 0): string {
  return nodes
    .map((n) => serializeBlock(n, depth))
    .filter((s) => s.length > 0)
    .join('\n\n')
}

export function docToMarkdown(doc: JSONContent): string {
  const md = serializeBlocks(doc.content ?? [])
  return md.replace(/\n{3,}/g, '\n\n').replace(/[ \t]+$/gm, '').trim() + '\n'
}
