import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'
import { htmlToMarkdown } from './convert'
import { safeFileName, type DocRecord } from './storage'

export interface ImportedMarkdown {
  /** 去掉扩展名的文件名，用作文档标题 */
  name: string
  text: string
}

const TEXT_EXT = /\.(md|markdown|mdown|mkd|txt)$/i

/** 同名的加序号，避免 ZIP 里互相覆盖 */
function dedupe(names: string[]): string[] {
  const used = new Set<string>()
  return names.map((raw) => {
    if (!used.has(raw)) {
      used.add(raw)
      return raw
    }
    const dot = raw.lastIndexOf('.')
    const stem = dot > 0 ? raw.slice(0, dot) : raw
    const ext = dot > 0 ? raw.slice(dot) : ''
    let i = 2
    let candidate = `${stem}-${i}${ext}`
    while (used.has(candidate)) {
      i += 1
      candidate = `${stem}-${i}${ext}`
    }
    used.add(candidate)
    return candidate
  })
}

function safeZipPath(path: string): string {
  return path
    .replace(/\\/g, '/')
    .split('/')
    .filter((part) => part && part !== '.' && part !== '..')
    .map(safeFileName)
    .join('/')
}

/** 每篇文档一个 .md，打包成 ZIP 返回 Blob；可传入路径生成器以保留目录层级。 */
export function docsToZipBlob(docs: DocRecord[], entryName?: (doc: DocRecord) => string): Blob {
  const names = dedupe(
    docs.map((doc) => safeZipPath(entryName?.(doc) || `${safeFileName(doc.title || '未命名文档')}.md`)),
  )
  const entries: Record<string, Uint8Array> = {}

  docs.forEach((doc, i) => {
    let md = ''
    try {
      md = htmlToMarkdown(doc.html)
    } catch {
      md = ''
    }
    entries[names[i]] = strToU8(md)
  })

  // 加一个清单，方便人工核对导出了哪些文件
  const index = ['# Markdown 文档导出清单', '']
  docs.forEach((doc, i) => {
    index.push(`- ${doc.title || '未命名文档'} → \`${names[i]}\``)
  })
  entries['_index.md'] = strToU8(index.join('\n'))

  const zipped = zipSync(entries, { level: 6 })
  // TS 5.9 起 Uint8Array<ArrayBufferLike> 不能直接当 BlobPart，复制到独立的 ArrayBuffer
  const bytes = new Uint8Array(zipped.length)
  bytes.set(zipped)
  return new Blob([bytes.buffer], { type: 'application/zip' })
}

/** 从 ZIP 里读出所有 Markdown 文本 */
export async function readZip(file: File): Promise<ImportedMarkdown[]> {
  const buf = new Uint8Array(await file.arrayBuffer())
  const files = unzipSync(buf)
  const out: ImportedMarkdown[] = []

  for (const [path, data] of Object.entries(files)) {
    // 跳过目录与 macOS 的 __MACOSX 元数据
    if (path.endsWith('/') || path.startsWith('__MACOSX/')) continue
    const base = path.slice(path.lastIndexOf('/') + 1)
    if (!TEXT_EXT.test(base)) continue
    const text = strFromU8(data)
    out.push({ name: base.replace(TEXT_EXT, '') || '未命名文档', text })
  }

  return out.sort((a, b) => a.name.localeCompare(b.name, 'zh-Hans-CN'))
}

export async function readTextFiles(files: readonly File[]): Promise<ImportedMarkdown[]> {
  const list = Array.from(files)
  const out: ImportedMarkdown[] = []
  for (const file of list) {
    if (!TEXT_EXT.test(file.name) && !/\.(zip)$/i.test(file.name)) continue
    if (/\.zip$/i.test(file.name)) {
      out.push(...(await readZip(file)))
      continue
    }
    out.push({
      name: file.name.replace(TEXT_EXT, '') || '未命名文档',
      text: await file.text(),
    })
  }
  return out
}
