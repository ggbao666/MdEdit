/**
 * 图片资源的路径与读写工具。
 *
 * 约定：资源目录位于工作区根目录下，与 .md 同级（文档本身也在根目录），
 * 所以「相对工作区根的路径」==「相对文档的路径」，Markdown 里直接写它即可。
 * 例：文档 `笔记.md` + 模板 `{name}.assets` → `![图](笔记.assets/图.png)`
 */

/** 资源目录命名模板里可用的占位符 */
export const ASSET_DIR_PRESETS = [
  { value: '{name}.assets', hint: '每篇文档一个专属资源目录' },
  { value: 'assets', hint: '所有文档共用一个资源目录' },
  { value: 'assets/{name}', hint: '统一目录下的按文档分子目录' },
] as const

export const DEFAULT_ASSET_DIR = '{name}.assets'

const INVALID = /[\\/:*?"<>|\n\r\t]/g

/** 清掉文件名里的非法字符，并去掉首尾空白 */
export function safeSegment(name: string, fallback = 'assets'): string {
  const cleaned = name
    .split('/')
    .map((part) => part.replace(INVALID, '').trim())
    .filter(Boolean)
    .join('/')
  return cleaned || fallback
}

/** 把模板里的 {name} 替换成文档标题 */
export function resolveAssetDir(template: string, docTitle: string): string {
  const name = safeSegment(docTitle || '未命名文档', '未命名文档')
  const filled = (template || DEFAULT_ASSET_DIR).replace(/\{name\}/g, name)
  return safeSegment(filled)
}

/** 资源在工作区里的完整相对路径，如 `笔记.assets/截图.png` */
export function assetRelPath(dir: string, fileName: string): string {
  const cleanDir = safeSegment(dir)
  const cleanFile = safeSegment(fileName, 'image.png')
  return cleanDir ? `${cleanDir}/${cleanFile}` : cleanFile
}

let lastImageTimestamp = 0

function imageTimestamp(): string {
  // 同一毫秒批量插入多张图片时顺延 1ms，确保文件名仍保持纯时间戳格式且不重名。
  const now = Date.now()
  lastImageTimestamp = Math.max(now, lastImageTimestamp + 1)
  const date = new Date(lastImageTimestamp)
  const pad = (value: number, length = 2) => String(value).padStart(length, '0')
  return [
    pad(date.getFullYear(), 4),
    pad(date.getMonth() + 1),
    pad(date.getDate()),
    pad(date.getHours()),
    pad(date.getMinutes()),
    pad(date.getSeconds()),
    pad(date.getMilliseconds(), 3),
  ].join('')
}

/** 图片统一命名为 imageyyyyMMddHHmmssSSS，并保留原扩展名。 */
export function assetFileName(rawName: string, mime: string): string {
  const withoutDir = rawName.split(/[\\/]/).pop() ?? ''
  const extension = withoutDir.match(/\.[a-z0-9]{2,5}$/i)?.[0] ?? extFromMime(mime)
  return `image${imageTimestamp()}${extension.toLowerCase()}`
}

export function extFromMime(mime: string): string {
  const map: Record<string, string> = {
    'image/png': '.png',
    'image/jpeg': '.jpg',
    'image/gif': '.gif',
    'image/webp': '.webp',
    'image/avif': '.avif',
    'image/svg+xml': '.svg',
    'image/bmp': '.bmp',
    'image/x-icon': '.ico',
  }
  return map[mime.toLowerCase()] ?? '.png'
}

export function isImageFile(file: File): boolean {
  return file.type.startsWith('image/')
}

export function fileToBytes(file: File): Promise<Uint8Array> {
  return file.arrayBuffer().then((buf) => new Uint8Array(buf))
}

/** 本地模式没有目录可写，只能把原图内联进文档 */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(new Error('读取图片失败'))
    reader.readAsDataURL(file)
  })
}

/**
 * 从粘贴板 / 拖拽里挑出图片文件。
 * 截图粘贴时剪贴板项通常是 `image.png` 这种没有真实路径的文件。
 */
export function pickImageFiles(list: FileList | File[] | null | undefined): File[] {
  if (!list) return []
  return Array.from(list).filter((file) => isImageFile(file) || /\.(png|jpe?g|gif|webp|avif|svg|bmp)$/i.test(file.name))
}
