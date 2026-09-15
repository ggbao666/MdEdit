import type { DocFileMeta, DraftFileMeta, FolderMeta, WorkspaceInfo, WorkspaceState } from '../types/electron'

export type { DocFileMeta, DraftFileMeta, FolderMeta, WorkspaceInfo, WorkspaceState }

/**
 * 工作区抽象层（桌面版专用）。
 *
 * 可以同时挂载多个目录：文档就是各目录里的 .md 文件，
 * 图片写进同级资源目录，Markdown 里用相对路径引用。
 * 渲染进程全程只拿到「相对所属目录」的路径，绝对路径只在主进程里拼接。
 */

let state: WorkspaceState = { roots: [], last: [] }
/** 当前活跃目录，图片地址里的 r 参数取它 */
let activeRoot: string | null = null

export function getRoots(): WorkspaceInfo[] {
  return state.roots
}

export function getLastRoots(): WorkspaceInfo[] {
  return state.last
}

export function hasWorkspace(): boolean {
  return state.roots.length > 0
}

/** 切换文档时同步，保证图片能解析到正确的目录 */
export function setActiveRoot(root: string | null): void {
  activeRoot = root
}

export function getActiveRoot(): string | null {
  return activeRoot
}

/** 新建文档默认落在哪个目录：当前活跃的，否则第一个 */
export function defaultRoot(): string | null {
  if (activeRoot && state.roots.some((r) => r.root === activeRoot)) return activeRoot
  return state.roots[0]?.root ?? null
}

function ws() {
  return window.tiptora?.workspace ?? null
}

/* ============================================================
   资源地址
   ============================================================ */

const ABSOLUTE_SRC = /^(?:data|blob|https?|file|tiptora):/i

/**
 * 把 Markdown 里存的相对引用换成编辑器能显示的地址。
 * 已经是绝对协议（data: / http: / 内联）的原样返回。
 */
export function assetUrl(rel: string | null | undefined, root?: string | null): string {
  const value = String(rel ?? '').trim()
  if (!value) return ''
  if (/^file:/i.test(value)) return `tiptora://external?u=${encodeURIComponent(value)}`
  if (ABSOLUTE_SRC.test(value)) return value
  const dir = root ?? activeRoot
  if (dir) return `tiptora://asset?r=${encodeURIComponent(dir)}&p=${encodeURIComponent(value)}`
  // 没有挂载目录又不是内联数据，加载不到，只能原样返回
  return value
}

/* ============================================================
   工作区操作
   ============================================================ */

/** 同步本地状态；返回是否发生了变化 */
function apply(next: WorkspaceState | null): WorkspaceState | null {
  if (!next) return null
  state = next
  if (activeRoot && !next.roots.some((r) => r.root === activeRoot)) {
    activeRoot = next.roots[0]?.root ?? null
  }
  if (!activeRoot) activeRoot = next.roots[0]?.root ?? null
  return next
}

export async function fetchState(): Promise<WorkspaceState> {
  const api = ws()
  if (!api) return { roots: [], last: [] }
  try {
    return apply(await api.state()) ?? { roots: [], last: [] }
  } catch {
    return { roots: [], last: [] }
  }
}

/** 弹出系统目录选择框并挂载 */
export async function openWorkspace(): Promise<WorkspaceState | null> {
  const api = ws()
  if (!api) return null
  try {
    return apply(await api.open())
  } catch {
    return null
  }
}

/** 打开单个 Markdown 文件，同时把其所在目录纳入工作区。 */
export async function openDocFile(): Promise<{ state: WorkspaceState; file: DocFileMeta } | null> {
  const api = ws()
  if (!api) return null
  try {
    const opened = await api.openFile()
    if (!opened) return null
    apply(opened.state)
    activeRoot = opened.file.root
    return opened
  } catch {
    return null
  }
}

export async function openDroppedDocFile(file: File): Promise<{ state: WorkspaceState; file: DocFileMeta } | null> {
  const api = ws()
  if (!api) return null
  try {
    const opened = await api.openDroppedFile(file)
    if (!opened) return null
    apply(opened.state)
    activeRoot = opened.file.root
    return opened
  } catch {
    return null
  }
}

export async function saveDocAs(
  suggestedName: string,
  content: string,
): Promise<{ state: WorkspaceState; file: DocFileMeta } | null> {
  const api = ws()
  if (!api) return null
  try {
    const saved = await api.saveAs(suggestedName, content)
    if (!saved) return null
    apply(saved.state)
    activeRoot = saved.file.root
    return saved
  } catch {
    return null
  }
}

/** 挂载一个已知目录 */
export async function attachWorkspace(root: string): Promise<WorkspaceState | null> {
  const api = ws()
  if (!api) return null
  try {
    const next = apply(await api.attach(root))
    if (next) activeRoot = root
    return next
  } catch {
    return null
  }
}

/** 把目录从侧栏移除（不动磁盘上的文件） */
export async function detachWorkspace(root: string): Promise<WorkspaceState | null> {
  const api = ws()
  if (!api) return null
  try {
    return apply(await api.detach(root))
  } catch {
    return null
  }
}

export async function listDocFiles(): Promise<DocFileMeta[]> {
  const api = ws()
  if (!api || state.roots.length === 0) return []
  try {
    return await api.list()
  } catch {
    return []
  }
}

export async function listFolders(): Promise<FolderMeta[]> {
  const api = ws()
  if (!api || state.roots.length === 0) return []
  try {
    return await api.folders()
  } catch {
    return []
  }
}

export async function readDocFile(root: string, rel: string): Promise<string> {
  const api = ws()
  if (!api) return ''
  try {
    return await api.read(root, rel)
  } catch {
    return ''
  }
}

export async function writeDocFile(root: string, rel: string, content: string): Promise<boolean> {
  const api = ws()
  if (!api) return false
  try {
    return await api.write(root, rel, content)
  } catch {
    return false
  }
}

export async function createDocFile(root: string, title: string, dir = ''): Promise<DocFileMeta | null> {
  const api = ws()
  if (!api) return null
  try {
    const meta = await api.create(root, title, dir)
    if (meta) activeRoot = root
    return meta
  } catch {
    return null
  }
}

export async function createFolder(root: string, parent: string, name: string): Promise<FolderMeta | null> {
  const api = ws()
  if (!api) return null
  try {
    return await api.createFolder(root, parent, name)
  } catch {
    return null
  }
}

export async function renameFolder(root: string, from: string, name: string): Promise<FolderMeta | null> {
  const api = ws()
  if (!api) return null
  try {
    return await api.renameFolder(root, from, name)
  } catch {
    return null
  }
}

export type RemoveFolderResult = 'removed' | 'has-subfolders' | 'has-other-files' | 'invalid' | 'failed'

export async function removeFolder(root: string, path: string): Promise<RemoveFolderResult> {
  const api = ws()
  if (!api) return 'failed'
  try {
    return await api.removeFolder(root, path)
  } catch {
    return 'failed'
  }
}

export async function renameDocFile(root: string, from: string, to: string): Promise<DocFileMeta | null> {
  const api = ws()
  if (!api) return null
  try {
    const meta = await api.rename(root, from, to)
    if (meta) activeRoot = root
    return meta
  } catch {
    return null
  }
}

export async function removeDocFile(root: string, rel: string): Promise<boolean> {
  const api = ws()
  if (!api) return false
  try {
    return await api.remove(root, rel)
  } catch {
    return false
  }
}

export function revealDocFile(root: string, rel: string): void {
  if (!root || !rel) return
  ws()?.reveal(root, rel)
}

export function revealFolder(root: string, rel = ''): void {
  if (!root) return
  ws()?.revealFolder(root, rel)
}

export async function writeDraftFile(id: string, title: string, content: string): Promise<string | null> {
  try {
    return (await ws()?.writeDraft(id, title, content)) ?? null
  } catch {
    return null
  }
}

export async function listDraftFiles(): Promise<DraftFileMeta[]> {
  try {
    return (await ws()?.listDrafts()) ?? []
  } catch {
    return []
  }
}

export async function removeDraftFile(id: string): Promise<boolean> {
  try {
    return (await ws()?.removeDraft(id)) ?? false
  } catch {
    return false
  }
}

export function revealDraftFile(id: string): void {
  if (!id) return
  ws()?.revealDraft(id)
}

export async function writeAssetFile(root: string, rel: string, bytes: Uint8Array): Promise<string | null> {
  const api = ws()
  if (!api) return null
  try {
    return await api.writeAsset(root, rel, bytes)
  } catch {
    return null
  }
}

/** 让用户通过系统对话框选择并授权一个本机图片目录。 */
export async function pickAssetDirectory(): Promise<string | null> {
  const api = ws()
  if (!api) return null
  try {
    return await api.pickAssetDirectory()
  } catch {
    return null
  }
}

/** 向用户已授权的本机目录写入图片，返回可存进 Markdown 的 file URL。 */
export async function writeExternalAssetFile(
  directory: string,
  fileName: string,
  bytes: Uint8Array,
): Promise<string | null> {
  const api = ws()
  if (!api) return null
  try {
    return await api.writeExternalAsset(directory, fileName, bytes)
  } catch {
    return null
  }
}
