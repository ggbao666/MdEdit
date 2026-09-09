/** Electron 通过 preload 注入的 API；只有桌面版才有 */

interface WorkspaceInfo {
  /** 目录的绝对路径 */
  root: string
  /** 目录名，用于界面展示 */
  name: string
}

/** 同时挂载多个目录，每个目录各自维护一份文档列表 */
interface WorkspaceState {
  /** 当前已挂载的目录 */
  roots: WorkspaceInfo[]
  /** 上次会话挂载过的目录，用于启动时的「打开上次」 */
  last: WorkspaceInfo[]
}

/** 工作区里的一篇 Markdown 文档（path 为相对所属目录的路径） */
interface DocFileMeta {
  /** 所属目录的绝对路径 */
  root: string
  path: string
  title: string
  mtime: number
  size: number
}

interface FolderMeta {
  root: string
  /** 相对工作区根目录的路径；根目录本身不在列表中 */
  path: string
  name: string
}

interface DraftFileMeta {
  id: string
  title: string
  content: string
  mtime: number
}

interface TiptoraWorkspaceApi {
  state: () => Promise<WorkspaceState>
  /** 弹出系统目录选择框并挂载 */
  open: () => Promise<WorkspaceState | null>
  /** 打开一个现有 Markdown 文件，并挂载它所在的目录 */
  openFile: () => Promise<{ state: WorkspaceState; file: DocFileMeta } | null>
  /** 让用户选择位置，把临时文档保存为正式 Markdown 文件 */
  saveAs: (suggestedName: string, content: string) => Promise<{ state: WorkspaceState; file: DocFileMeta } | null>
  /** 挂载一个已知目录（用于「打开上次的」） */
  attach: (root: string) => Promise<WorkspaceState>
  /** 把目录从侧栏移除，不碰磁盘上的文件 */
  detach: (root: string) => Promise<WorkspaceState>
  /** 递归列出所有已挂载目录下的 .md / .markdown */
  list: () => Promise<DocFileMeta[]>
  /** 递归列出工作区中的子目录 */
  folders: () => Promise<FolderMeta[]>
  read: (root: string, path: string) => Promise<string>
  write: (root: string, path: string, content: string) => Promise<boolean>
  /** 新建文档，自动处理重名；返回实际创建的文件 */
  create: (root: string, title: string, dir?: string) => Promise<DocFileMeta | null>
  createFolder: (root: string, parent: string, name: string) => Promise<FolderMeta | null>
  rename: (root: string, from: string, to: string) => Promise<DocFileMeta | null>
  remove: (root: string, path: string) => Promise<boolean>
  /** 写入二进制资源（图片），自动建目录 + 重名避让；返回最终相对路径 */
  writeAsset: (root: string, path: string, bytes: Uint8Array) => Promise<string | null>
  readAsset: (root: string, path: string) => Promise<Uint8Array | null>
  /** 在系统文件管理器中选中文档 */
  reveal: (root: string, path: string) => void
  revealFolder: (root: string, path: string) => void
  /** 临时文档存放在系统临时目录，不属于任何已挂载工作区 */
  listDrafts: () => Promise<DraftFileMeta[]>
  writeDraft: (id: string, title: string, content: string) => Promise<string | null>
  removeDraft: (id: string) => Promise<boolean>
  revealDraft: (id: string) => void
}

interface TiptoraApi {
  saveText: (suggestedName: string, content: string) => Promise<boolean>
  saveBytes: (suggestedName: string, bytes: Uint8Array) => Promise<boolean>
  onMenu: (action: string, handler: () => void) => () => void
  workspace: TiptoraWorkspaceApi
}

declare global {
  interface Window {
    tiptora?: TiptoraApi
  }
}

export type { WorkspaceInfo, WorkspaceState, DocFileMeta, FolderMeta, DraftFileMeta }
