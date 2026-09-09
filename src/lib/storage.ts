import { DEFAULT_DARK_THEME, DEFAULT_LIGHT_THEME, isTheme, type Theme } from '../config/themes'

export type SaveState = 'idle' | 'dirty' | 'saving' | 'saved'

export interface DocRecord {
  /** 磁盘文档是 `${root}|${path}`，内存文档是 `mem:<序号>` */
  id: string
  title: string
  html: string
  /** 列表页展示的纯文本摘要，保存时算好，避免渲染时反复解析 HTML */
  excerpt: string
  /** 所属目录的绝对路径；为空表示还没落盘的内存文档 */
  root: string
  /** 相对 root 的路径，如 `笔记.md`；为空表示内存文档 */
  path: string
  createdAt: number
  updatedAt: number
}

/* ============================================================
   工具
   ============================================================ */

/** 用 DOMParser 取纯文本，绝不拼接进 innerHTML（避免 XSS） */
export function htmlToText(html: string): string {
  try {
    const parsed = new DOMParser().parseFromString(html, 'text/html')
    return (parsed.body.textContent ?? '').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

export function htmlToExcerpt(html: string, max = 60): string {
  const text = htmlToText(html)
  return text.length > max ? text.slice(0, max) + '…' : text
}

/** 相对时间：今天显示时刻，昨天/本年/更早分级显示 */
export function formatTime(ts: number): string {
  const date = new Date(ts)
  const now = new Date()
  const sameDay = (a: Date, b: Date) =>
    a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate()

  const hm = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

  if (sameDay(date, now)) return hm

  const yesterday = new Date(now)
  yesterday.setDate(now.getDate() - 1)
  if (sameDay(date, yesterday)) return `昨天 ${hm}`

  if (date.getFullYear() === now.getFullYear()) return `${date.getMonth() + 1}月${date.getDate()}日`
  return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`
}

let memSeq = 0

/** 内存文档：还没有落盘，只在当前会话里存在 */
export function createMemoryDoc(title = '未命名文档', html = ''): DocRecord {
  memSeq += 1
  const now = Date.now()
  return {
    id: `mem:${memSeq}`,
    title,
    html,
    excerpt: htmlToExcerpt(html),
    root: '',
    path: '',
    createdAt: now,
    updatedAt: now,
  }
}

export function createDoc(title = '未命名文档', html = '', root = '', path = ''): DocRecord {
  const now = Date.now()
  return {
    id: root || path ? `${root}|${path}` : `doc:${now}`,
    title,
    html,
    excerpt: htmlToExcerpt(html),
    root,
    path,
    createdAt: now,
    updatedAt: now,
  }
}

/** 判断一篇文档是否已经落盘（有目录和路径） */
export function isOnDisk(doc: DocRecord): boolean {
  return Boolean(doc.root && doc.path)
}

/** 判断内容是否实质为空（空白文档没必要落成文件） */
export function isBlank(html: string): boolean {
  const text = htmlToText(html)
  return text.length === 0
}

/** 把 HTML 同步进记录并刷新摘要与时间戳 */
export function touchDoc(doc: DocRecord, patch: Partial<Pick<DocRecord, 'title' | 'html'>>): DocRecord {
  const next = { ...doc, ...patch }
  if (patch.html !== undefined) next.excerpt = htmlToExcerpt(patch.html)
  next.updatedAt = Date.now()
  return next
}

export function safeFileName(name: string): string {
  const base = name.trim().replace(/[\\/:*?"<>|\n\r\t]/g, '').slice(0, 80)
  return base || '未命名文档'
}

/* ============================================================
   偏好 / 主题（只存界面设置，文档一律在磁盘上）
   ============================================================ */

const KEY_THEME = 'tiptora:theme'
const KEY_PREFS = 'tiptora:prefs'
const KEY_ORDER = 'tiptora:order'

export interface Prefs {
  sidebar: boolean
  /** 侧栏宽度（像素），可拖拽调整 */
  sidebarWidth: number
  focus: boolean
  typewriter: boolean
  /** 只读模式：锁定正文、标题和格式工具 */
  readOnly: boolean
  /** 侧栏当前视图：文档列表 or 大纲 */
  panel: 'docs' | 'outline'
  /**
   * 图片怎么存：
   * - file：原图写进资源目录，Markdown 里用相对路径引用
   * - inline：原图转 base64 内联进文档，单文件自包含
   */
  imageMode: 'file' | 'inline'
  /** 是否在停止输入后自动写回 Markdown 文件 */
  autoSave: boolean
  /** 自动保存防抖延迟（毫秒） */
  autoSaveDelay: number
  /**
   * 资源目录命名模板，位于工作区根目录下、与 .md 同级。
   * 支持 {name} 占位符（文档名），默认 `{name}.assets`。
   */
  assetDir: string
}

const DEFAULT_PREFS: Prefs = {
  sidebar: true,
  sidebarWidth: 248,
  focus: false,
  typewriter: false,
  readOnly: false,
  panel: 'docs',
  imageMode: 'file',
  autoSave: true,
  autoSaveDelay: 700,
  assetDir: '{name}.assets',
}

export function loadPrefs(): Prefs {
  try {
    const raw = localStorage.getItem(KEY_PREFS)
    if (!raw) return DEFAULT_PREFS
    const parsed = JSON.parse(raw) as Partial<Prefs>
    const panel = parsed.panel === 'docs' || parsed.panel === 'outline' ? parsed.panel : DEFAULT_PREFS.panel
    const imageMode = parsed.imageMode === 'inline' ? 'inline' : 'file'
    const autoSave = typeof parsed.autoSave === 'boolean' ? parsed.autoSave : DEFAULT_PREFS.autoSave
    const sidebarWidth =
      typeof parsed.sidebarWidth === 'number' && Number.isFinite(parsed.sidebarWidth)
        ? Math.min(480, Math.max(180, Math.round(parsed.sidebarWidth)))
        : DEFAULT_PREFS.sidebarWidth
    const readOnly = typeof parsed.readOnly === 'boolean' ? parsed.readOnly : DEFAULT_PREFS.readOnly
    const autoSaveDelay =
      typeof parsed.autoSaveDelay === 'number' && Number.isFinite(parsed.autoSaveDelay)
        ? Math.min(60_000, Math.max(100, Math.round(parsed.autoSaveDelay)))
        : DEFAULT_PREFS.autoSaveDelay
    const assetDir = typeof parsed.assetDir === 'string' && parsed.assetDir.trim() ? parsed.assetDir : DEFAULT_PREFS.assetDir
    return { ...DEFAULT_PREFS, ...parsed, panel, imageMode, autoSave, autoSaveDelay, assetDir, sidebarWidth, readOnly }
  } catch {
    return DEFAULT_PREFS
  }
}

export function savePrefs(prefs: Prefs): void {
  try {
    localStorage.setItem(KEY_PREFS, JSON.stringify(prefs))
  } catch {
    /* ignore */
  }
}

export function loadTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY_THEME)
    if (isTheme(saved)) return saved
  } catch {
    /* ignore */
  }
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? DEFAULT_DARK_THEME : DEFAULT_LIGHT_THEME
}

export function saveTheme(theme: Theme): void {
  try {
    localStorage.setItem(KEY_THEME, theme)
  } catch {
    /* ignore */
  }
}

/* ============================================================
   文档排序
   ============================================================ */

/**
 * 磁盘上的文件没有顺序，手动拖出来的顺序按工作区根目录单独存一份。
 * 只是显示偏好，丢了大不了回到按名称排序，不值得为了它去污染工作区目录。
 */
export function loadDocOrder(root: string): string[] {
  try {
    const raw = localStorage.getItem(`${KEY_ORDER}:${root}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

export function saveDocOrder(root: string, paths: string[]): void {
  try {
    localStorage.setItem(`${KEY_ORDER}:${root}`, JSON.stringify(paths))
  } catch {
    /* 忽略配额异常 */
  }
}
