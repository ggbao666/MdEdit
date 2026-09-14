import { contextBridge, ipcRenderer, webUtils } from 'electron'

interface WorkspaceInfo {
  root: string
  name: string
}

interface DocFileMeta {
  root: string
  path: string
  title: string
  mtime: number
  size: number
}

interface FolderMeta {
  root: string
  path: string
  name: string
}

type RemoveFolderResult = 'removed' | 'has-subfolders' | 'has-other-files' | 'invalid' | 'failed'

interface DraftFileMeta {
  id: string
  title: string
  content: string
  mtime: number
}

/**
 * 工作区文件读写。
 * 支持同时挂载多个目录，所以每个操作都要带上目录；
 * 文件路径仍然是「相对该目录」的，主进程负责拼接。
 */
const workspace = {
  state: (): Promise<{ roots: WorkspaceInfo[]; last: WorkspaceInfo[] }> => ipcRenderer.invoke('ws:state'),

  open: (): Promise<{ roots: WorkspaceInfo[]; last: WorkspaceInfo[] } | null> => ipcRenderer.invoke('ws:open'),

  openFile: (): Promise<{
    state: { roots: WorkspaceInfo[]; last: WorkspaceInfo[] }
    file: DocFileMeta
  } | null> => ipcRenderer.invoke('ws:openFile'),

  openDroppedFile: (file: File): Promise<{
    state: { roots: WorkspaceInfo[]; last: WorkspaceInfo[] }
    file: DocFileMeta
  } | null> => ipcRenderer.invoke('ws:openDroppedFile', webUtils.getPathForFile(file)),

  saveAs: (suggestedName: string, content: string): Promise<{
    state: { roots: WorkspaceInfo[]; last: WorkspaceInfo[] }
    file: DocFileMeta
  } | null> => ipcRenderer.invoke('ws:saveAs', suggestedName, content),

  attach: (root: string): Promise<{ roots: WorkspaceInfo[]; last: WorkspaceInfo[] }> =>
    ipcRenderer.invoke('ws:attach', root),

  detach: (root: string): Promise<{ roots: WorkspaceInfo[]; last: WorkspaceInfo[] }> =>
    ipcRenderer.invoke('ws:detach', root),

  list: (): Promise<DocFileMeta[]> => ipcRenderer.invoke('ws:list'),

  folders: (): Promise<FolderMeta[]> => ipcRenderer.invoke('ws:folders'),

  read: (root: string, path: string): Promise<string> => ipcRenderer.invoke('ws:read', root, path),

  write: (root: string, path: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('ws:write', root, path, content),

  create: (root: string, title: string, dir = ''): Promise<DocFileMeta | null> =>
    ipcRenderer.invoke('ws:create', root, title, dir),

  createFolder: (root: string, parent: string, name: string): Promise<FolderMeta | null> =>
    ipcRenderer.invoke('ws:createFolder', root, parent, name),

  renameFolder: (root: string, from: string, name: string): Promise<FolderMeta | null> =>
    ipcRenderer.invoke('ws:renameFolder', root, from, name),

  removeFolder: (root: string, path: string): Promise<RemoveFolderResult> =>
    ipcRenderer.invoke('ws:removeFolder', root, path),

  rename: (root: string, from: string, to: string): Promise<DocFileMeta | null> =>
    ipcRenderer.invoke('ws:rename', root, from, to),

  remove: (root: string, path: string): Promise<boolean> => ipcRenderer.invoke('ws:remove', root, path),

  writeAsset: (root: string, path: string, bytes: Uint8Array): Promise<string | null> =>
    ipcRenderer.invoke('ws:writeAsset', root, path, bytes),

  readAsset: (root: string, path: string): Promise<Uint8Array | null> =>
    ipcRenderer.invoke('ws:readAsset', root, path),

  reveal: (root: string, path: string): void => ipcRenderer.send('ws:reveal', root, path),

  revealFolder: (root: string, path: string): void => ipcRenderer.send('ws:revealFolder', root, path),

  listDrafts: (): Promise<DraftFileMeta[]> => ipcRenderer.invoke('draft:list'),

  writeDraft: (id: string, title: string, content: string): Promise<string | null> =>
    ipcRenderer.invoke('draft:write', id, title, content),

  removeDraft: (id: string): Promise<boolean> => ipcRenderer.invoke('draft:remove', id),

  revealDraft: (id: string): void => ipcRenderer.send('draft:reveal', id),
}

/** 暴露给渲染进程的极简 API（保持 contextIsolation 开启） */
const api = {
  /** 原生保存对话框；返回是否真的写入了 */
  saveText: (suggestedName: string, content: string): Promise<boolean> =>
    ipcRenderer.invoke('save-file', { suggestedName, content }),

  saveBytes: async (suggestedName: string, bytes: Uint8Array): Promise<boolean> =>
    ipcRenderer.invoke('save-file', { suggestedName, bytes: Array.from(bytes) }),

  /** 订阅原生菜单动作 */
  onMenu: (action: string, handler: () => void): (() => void) => {
    const channel = `menu:${action}`
    const listener = () => handler()
    ipcRenderer.on(channel, listener)
    return () => ipcRenderer.removeListener(channel, listener)
  },

  workspace,
}

contextBridge.exposeInMainWorld('tiptora', api)

export type TiptoraApi = typeof api
