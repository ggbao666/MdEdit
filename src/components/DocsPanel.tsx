import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  ChevronRight,
  Copy,
  FileArchive,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  GripVertical,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from 'lucide-react'
import type { DocRecord } from '../lib/storage'
import type { FolderMeta, WorkspaceInfo } from '../lib/workspace'
import { revealDocFile, revealDraftFile, revealFolder } from '../lib/workspace'

export type DropPosition = 'before' | 'after'

interface Props {
  docs: DocRecord[]
  /** 已挂载的目录，决定分组 */
  roots: WorkspaceInfo[]
  folders: FolderMeta[]
  activeId: string
  onSelect: (id: string) => void
  /** 在指定目录新建；root 为空表示建一篇还没落盘的内存文档 */
  onCreate: (root: string | null, dir?: string) => void
  onCreateFolder: (root: string, parent: string, name: string) => void
  onDeleteFolder: (root: string, path: string) => void
  onExportFolder: (root: string, path: string) => void
  onRename: (id: string, title: string) => void
  onDelete: (id: string) => void
  onDuplicate: (id: string) => void
  /** 拖拽排序：把 dragId 放到 targetId 的前面或后面（只在同一目录内有效） */
  onReorder: (dragId: string, targetId: string, position: DropPosition) => void
  onImportFiles: (files: readonly File[], root: string, dir: string) => void
  /** 把目录从侧栏移除，不动磁盘文件 */
  onDetachRoot: (root: string) => void
}

interface DropTarget {
  id: string
  position: DropPosition
}

type DocContextMenu =
  | { kind: 'doc'; doc: DocRecord; x: number; y: number }
  | { kind: 'folder'; root: string; path: string; name: string; x: number; y: number }

interface FolderDialog {
  root: string
  parent: string
  parentName: string
  name: string
}

type DeleteDialog =
  | { kind: 'doc'; doc: DocRecord }
  | { kind: 'folder'; root: string; path: string; name: string; docCount: number }

interface FolderNode {
  path: string
  name: string
  docs: DocRecord[]
  children: FolderNode[]
}

interface Group {
  key: string
  name: string
  root: string
  docs: DocRecord[]
  folders: FolderNode[]
}

function parentPath(path: string): string {
  const slash = path.lastIndexOf('/')
  return slash < 0 ? '' : path.slice(0, slash)
}

function folderDocCount(node: FolderNode): number {
  return node.docs.length + node.children.reduce((sum, child) => sum + folderDocCount(child), 0)
}

function menuPosition(clientX: number, clientY: number): { x: number; y: number } {
  return {
    x: Math.max(8, Math.min(clientX, window.innerWidth - 212)),
    y: Math.max(8, Math.min(clientY, window.innerHeight - 260)),
  }
}

export default function DocsPanel({
  docs,
  roots,
  folders,
  activeId,
  onSelect,
  onCreate,
  onCreateFolder,
  onDeleteFolder,
  onExportFolder,
  onRename,
  onDelete,
  onDuplicate,
  onReorder,
  onImportFiles,
  onDetachRoot,
}: Props) {
  const [query, setQuery] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [deleteDialog, setDeleteDialog] = useState<DeleteDialog | null>(null)
  const [dragId, setDragId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<DropTarget | null>(null)
  const [contextMenu, setContextMenu] = useState<DocContextMenu | null>(null)
  const [folderDialog, setFolderDialog] = useState<FolderDialog | null>(null)
  const [collapsed, setCollapsed] = useState<string[]>([])
  /**
   * 逻辑判断用 ref 而不是 state：dragstart 之后 React 还没提交 state，
   * 紧随其后的 dragover 就读不到 dragId 了。state 只负责渲染样式。
   */
  const dragIdRef = useRef<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const importFileRef = useRef<HTMLInputElement>(null)
  const importZipRef = useRef<HTMLInputElement>(null)
  const importTargetRef = useRef<{ root: string; dir: string } | null>(null)
  const contextMenuRef = useRef<HTMLDivElement>(null)
  const folderInputRef = useRef<HTMLInputElement>(null)
  const deleteConfirmRef = useRef<HTMLButtonElement>(null)

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return docs
    return docs.filter(
      (doc) => doc.title.toLowerCase().includes(q) || doc.excerpt.toLowerCase().includes(q),
    )
  }, [docs, query])

  /** 按目录分组；没有 root 的就是还没落盘的内存文档，单独归到「未保存」 */
  const groups = useMemo<Group[]>(() => {
    const list: Group[] = roots.map((r) => ({ key: r.root, name: r.name, root: r.root, docs: [], folders: [] }))
    const orphans: DocRecord[] = []

    for (const group of list) {
      const nodes = new Map<string, FolderNode>()
      const mine = folders
        .filter((folder) => folder.root === group.root)
        .sort(
          (a, b) =>
            a.path.split('/').length - b.path.split('/').length || a.name.localeCompare(b.name, 'zh-Hans-CN'),
        )
      for (const folder of mine) {
        const node: FolderNode = { path: folder.path, name: folder.name, docs: [], children: [] }
        nodes.set(node.path, node)
        const parent = nodes.get(parentPath(node.path))
        if (parent) parent.children.push(node)
        else group.folders.push(node)
      }
      for (const doc of visible.filter((item) => item.root === group.root)) {
        const parent = nodes.get(parentPath(doc.path))
        if (parent) parent.docs.push(doc)
        else group.docs.push(doc)
      }
    }

    for (const doc of visible) if (!doc.root) orphans.push(doc)
    if (orphans.length > 0) list.push({ key: 'mem', name: '未保存', root: '', docs: orphans, folders: [] })
    return list
  }, [folders, roots, visible])

  /** 搜索时顺序是过滤出来的子集，拖拽会把顺序写乱，直接禁用 */
  const draggable = !query.trim() && !editingId

  useEffect(() => {
    if (!editingId) return
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [editingId])

  useEffect(() => {
    if (!folderDialog) return
    requestAnimationFrame(() => {
      folderInputRef.current?.focus()
      folderInputRef.current?.select()
    })
  }, [folderDialog])

  useEffect(() => {
    if (!deleteDialog) return
    requestAnimationFrame(() => deleteConfirmRef.current?.focus())
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setDeleteDialog(null)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [deleteDialog])

  useEffect(() => {
    if (!contextMenu) return
    const close = (event: Event) => {
      if (contextMenuRef.current?.contains(event.target as Node)) return
      setContextMenu(null)
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setContextMenu(null)
    }
    document.addEventListener('pointerdown', close)
    document.addEventListener('scroll', close, true)
    window.addEventListener('blur', close)
    window.addEventListener('resize', close)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('pointerdown', close)
      document.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
      window.removeEventListener('resize', close)
      document.removeEventListener('keydown', onKey)
    }
  }, [contextMenu])

  const toggleGroup = (key: string) => {
    setCollapsed((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  const hasNestedFolder = (root: string, path: string) =>
    folders.some((folder) => folder.root === root && folder.path.startsWith(`${path}/`))

  const startEdit = (doc: DocRecord) => {
    setEditingId(doc.id)
    setDraft(doc.title)
  }

  const commitEdit = () => {
    if (!editingId) return
    const next = draft.trim()
    if (next) onRename(editingId, next)
    setEditingId(null)
  }

  const cancelEdit = () => {
    setEditingId(null)
    setDraft('')
  }

  const endDrag = () => {
    dragIdRef.current = null
    setDragId(null)
    setDropTarget(null)
  }

  /** 拖到列表上下边缘时自动滚动 */
  const autoScroll = (clientY: number) => {
    const el = listRef.current
    if (!el) return
    const box = el.getBoundingClientRect()
    const edge = 36
    if (clientY < box.top + edge) el.scrollTop -= 12
    else if (clientY > box.bottom - edge) el.scrollTop += 12
  }

  const handleDrop = () => {
    const from = dragIdRef.current
    if (!from || !dropTarget) {
      endDrag()
      return
    }
    if (from !== dropTarget.id) onReorder(from, dropTarget.id, dropTarget.position)
    endDrag()
  }

  const renderItem = (doc: DocRecord) => {
    const isActive = doc.id === activeId
    const isEditing = doc.id === editingId
    const isDragging = doc.id === dragId
    const dropHere = dropTarget?.id === doc.id ? dropTarget.position : null

    return (
      <div
        key={doc.id}
        className={
          'doclist-item' +
          (isActive ? ' is-active' : '') +
          (isDragging ? ' is-dragged' : '') +
          (dropHere ? ` is-drop-${dropHere}` : '')
        }
        draggable={draggable && !isEditing}
        onDragStart={(e) => {
          dragIdRef.current = doc.id
          setDragId(doc.id)
          e.dataTransfer.effectAllowed = 'move'
          // Firefox 要求必须有数据才会触发 drag
          e.dataTransfer.setData('text/plain', doc.id)
        }}
        onDragEnd={endDrag}
        onDragOver={(e) => {
          if (!draggable || !dragIdRef.current || dragIdRef.current === doc.id) return
          e.preventDefault()
          e.stopPropagation()
          const box = e.currentTarget.getBoundingClientRect()
          const position: DropPosition = e.clientY < box.top + box.height / 2 ? 'before' : 'after'
          setDropTarget((prev) =>
            prev?.id === doc.id && prev.position === position ? prev : { id: doc.id, position },
          )
        }}
        onDrop={(e) => {
          if (!dragIdRef.current) return
          e.preventDefault()
          e.stopPropagation()
          handleDrop()
        }}
        onClick={() => {
          if (!isEditing) onSelect(doc.id)
        }}
        onDoubleClick={() => startEdit(doc)}
        onContextMenu={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onSelect(doc.id)
          setContextMenu({
            kind: 'doc',
            doc,
            ...menuPosition(e.clientX, e.clientY),
          })
        }}
        role="button"
        tabIndex={0}
        title={doc.title || '未命名文档'}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !isEditing) onSelect(doc.id)
        }}
      >
        <span className="doclist-grip" aria-hidden="true" title="拖拽排序">
          <GripVertical size={12} strokeWidth={2} />
        </span>

        <FileText className="doclist-icon" size={14} strokeWidth={1.8} aria-hidden="true" />

        {isEditing ? (
          <input
            ref={inputRef}
            className="doclist-rename"
            value={draft}
            aria-label="重命名文档"
            onChange={(e) => setDraft(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitEdit}
            onKeyDown={(e) => {
              e.stopPropagation()
              if (e.key === 'Enter') commitEdit()
              else if (e.key === 'Escape') cancelEdit()
            }}
          />
        ) : (
          <span className="doclist-title">{doc.title || '未命名文档'}</span>
        )}

        {!isEditing && (
          <div className="doclist-actions">
            <button
              type="button"
              className="doclist-act"
              title="重命名（也可双击文件名）"
              onClick={(e) => {
                e.stopPropagation()
                startEdit(doc)
              }}
            >
              <Pencil size={12.5} strokeWidth={2} />
            </button>
            <button
              type="button"
              className="doclist-act"
              title="删除这篇文档"
              onClick={(e) => {
                e.stopPropagation()
                setDeleteDialog({ kind: 'doc', doc })
              }}
            >
              <Trash2 size={12.5} strokeWidth={2} />
            </button>
          </div>
        )}
      </div>
    )
  }

  const openFolderContext = (event: React.MouseEvent, root: string, path: string, name: string) => {
    if (!root) return
    event.preventDefault()
    event.stopPropagation()
    setContextMenu({ kind: 'folder', root, path, name, ...menuPosition(event.clientX, event.clientY) })
  }

  const askForFolder = (root: string, parent: string, parentName: string) => {
    setContextMenu(null)
    setFolderDialog({ root, parent, parentName, name: '新建文件夹' })
  }

  const openImportPicker = (root: string, dir: string, kind: 'files' | 'zip') => {
    setContextMenu(null)
    importTargetRef.current = { root, dir }
    if (kind === 'files') importFileRef.current?.click()
    else importZipRef.current?.click()
  }

  const handleImportPick = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    const target = importTargetRef.current
    importTargetRef.current = null
    if (target && files.length > 0) onImportFiles(files, target.root, target.dir)
  }

  const commitFolder = () => {
    if (!folderDialog) return
    const name = folderDialog.name.trim()
    if (!name) return
    onCreateFolder(folderDialog.root, folderDialog.parent, name)
    setFolderDialog(null)
  }

  const renderFolderNode = (root: string, node: FolderNode, depth: number) => {
    const key = `${root}|${node.path}`
    const isCollapsed = !query.trim() && collapsed.includes(key)
    return (
      <div className="docfolder" key={key}>
        <div
          className="docfolder-head"
          style={{ paddingLeft: 5 + depth * 14 }}
          role="button"
          tabIndex={0}
          aria-expanded={!isCollapsed}
          onClick={(event) => {
            if ((event.target as HTMLElement).closest('button')) return
            toggleGroup(key)
          }}
          onKeyDown={(event) => {
            if ((event.target as HTMLElement).closest('button')) return
            if (event.key !== 'Enter' && event.key !== ' ') return
            event.preventDefault()
            toggleGroup(key)
          }}
          onContextMenu={(event) => openFolderContext(event, root, node.path, node.name)}
        >
          <button
            type="button"
            className={'docgroup-toggle' + (isCollapsed ? ' is-collapsed' : '')}
            title={isCollapsed ? '展开' : '折叠'}
            onClick={() => toggleGroup(key)}
          >
            <ChevronRight size={12} strokeWidth={2.2} />
          </button>
          <Folder size={14} strokeWidth={1.8} className="docgroup-icon" />
          <span className="docgroup-name" title={node.path}>{node.name}</span>
          <span className="docgroup-count">{folderDocCount(node)}</span>
          <div className="docgroup-actions" role="group" aria-label={`${node.name} 快捷操作`}>
            <button
              type="button"
              title={`在“${node.name}”中新建文档`}
              aria-label={`在“${node.name}”中新建文档`}
              onClick={(event) => {
                event.stopPropagation()
                onCreate(root, node.path)
              }}
            >
              <Plus size={13} strokeWidth={2.2} />
            </button>
            <button
              type="button"
              title={`在“${node.name}”中新建文件夹`}
              aria-label={`在“${node.name}”中新建文件夹`}
              onClick={(event) => {
                event.stopPropagation()
                askForFolder(root, node.path, node.name)
              }}
            >
              <FolderPlus size={13} strokeWidth={2} />
            </button>
          </div>
        </div>
        {!isCollapsed && (
          <div className="docfolder-contents">
            <div className="docfolder-docs" style={{ paddingLeft: 14 + depth * 14 }}>
              {node.docs.map(renderItem)}
            </div>
            {node.children.map((child) => renderFolderNode(root, child, depth + 1))}
          </div>
        )}
      </div>
    )
  }

  const noResults = Boolean(query.trim()) && visible.length === 0
  const noWorkspace = roots.length === 0 && visible.length === 0

  return (
    <div className="doclist">
      <div className="doclist-tools">
        <div className="doclist-search">
          <Search size={14} strokeWidth={2} className="doclist-search-icon" />
          <input
            value={query}
            placeholder="搜索文档名或内容"
            aria-label="搜索文档"
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setQuery('')
            }}
          />
          {query && (
            <button type="button" aria-label="清空搜索" onClick={() => setQuery('')}>
              <X size={13} strokeWidth={2.2} />
            </button>
          )}
        </div>
      </div>

      <input
        ref={importFileRef}
        type="file"
        multiple
        accept=".md,.markdown,.mdown,.mkd,.txt,text/markdown,text/plain"
        hidden
        onChange={handleImportPick}
      />
      <input
        ref={importZipRef}
        type="file"
        multiple
        accept=".zip,application/zip"
        hidden
        onChange={handleImportPick}
      />

      <div
        ref={listRef}
        className={'doclist-items' + (dragId ? ' is-dragging' : '')}
        onDragOver={(e) => {
          if (!draggable || !dragId) return
          e.preventDefault()
          autoScroll(e.clientY)
        }}
        onDrop={(e) => {
          if (!dragId) return
          e.preventDefault()
          handleDrop()
        }}
      >
        {noResults || noWorkspace ? (
          <p className="doclist-empty">
            {noResults ? (
              <>没有匹配「{query}」的文档。</>
            ) : (
              <>
                还没有打开任何目录。
                <br />
                请从“文件”菜单打开目录。
              </>
            )}
          </p>
        ) : (
          groups.map((group) => {
            const isCollapsed = !query.trim() && collapsed.includes(group.key)
            const count = group.docs.length + group.folders.reduce((sum, folder) => sum + folderDocCount(folder), 0)
            return (
              <div className="docgroup" key={group.key}>
                <div
                  className="docgroup-head"
                  role="button"
                  tabIndex={0}
                  aria-expanded={!isCollapsed}
                  onClick={(event) => {
                    if ((event.target as HTMLElement).closest('button')) return
                    toggleGroup(group.key)
                  }}
                  onKeyDown={(event) => {
                    if ((event.target as HTMLElement).closest('button')) return
                    if (event.key !== 'Enter' && event.key !== ' ') return
                    event.preventDefault()
                    toggleGroup(group.key)
                  }}
                  onContextMenu={(event) => openFolderContext(event, group.root, '', group.name)}
                >
                  <button
                    type="button"
                    className={'docgroup-toggle' + (isCollapsed ? ' is-collapsed' : '')}
                    title={isCollapsed ? '展开' : '折叠'}
                    onClick={() => toggleGroup(group.key)}
                  >
                    <ChevronRight size={13} strokeWidth={2.2} />
                  </button>
                  <Folder size={14} strokeWidth={1.8} className="docgroup-icon" />
                  <span className="docgroup-name" title={group.root || '还没保存'}>
                    {group.name}
                  </span>
                  <span className="docgroup-count">{count}</span>
                  {group.root && (
                    <div className="docgroup-actions" role="group" aria-label={`${group.name} 快捷操作`}>
                      <button
                        type="button"
                        title={`在“${group.name}”中新建文档`}
                        aria-label={`在“${group.name}”中新建文档`}
                        onClick={(event) => {
                          event.stopPropagation()
                          onCreate(group.root, '')
                        }}
                      >
                        <Plus size={13} strokeWidth={2.2} />
                      </button>
                      <button
                        type="button"
                        title={`在“${group.name}”中新建文件夹`}
                        aria-label={`在“${group.name}”中新建文件夹`}
                        onClick={(event) => {
                          event.stopPropagation()
                          askForFolder(group.root, '', group.name)
                        }}
                      >
                        <FolderPlus size={13} strokeWidth={2} />
                      </button>
                    </div>
                  )}
                </div>
                {!isCollapsed && (
                  <div className="docgroup-items">
                    {group.folders.map((folder) => renderFolderNode(group.root, folder, 0))}
                    {group.docs.map(renderItem)}
                    {group.root && count === 0 && group.folders.length === 0 && (
                      <p className="docgroup-empty">右键目录可新建文件夹或导出 ZIP。</p>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {contextMenu &&
        createPortal(
          <div
            ref={contextMenuRef}
            className="doc-context-menu"
            role="menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {contextMenu.kind === 'doc' ? (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onDuplicate(contextMenu.doc.id)
                    setContextMenu(null)
                  }}
                >
                  <Copy size={15} strokeWidth={2} />
                  创建副本
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    if (contextMenu.doc.root && contextMenu.doc.path) {
                      revealDocFile(contextMenu.doc.root, contextMenu.doc.path)
                    } else {
                      revealDraftFile(contextMenu.doc.id)
                    }
                    setContextMenu(null)
                  }}
                >
                  <FolderOpen size={15} strokeWidth={2} />
                  打开所在目录
                </button>
              </>
            ) : (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onCreate(contextMenu.root, contextMenu.path)
                    setContextMenu(null)
                  }}
                >
                  <Plus size={15} strokeWidth={2.2} />
                  新建文档
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => askForFolder(contextMenu.root, contextMenu.path, contextMenu.name)}
                >
                  <FolderPlus size={15} strokeWidth={2} />
                  新建文件夹
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openImportPicker(contextMenu.root, contextMenu.path, 'files')}
                >
                  <FileText size={15} strokeWidth={2} />
                  导入文件…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => openImportPicker(contextMenu.root, contextMenu.path, 'zip')}
                >
                  <FileArchive size={15} strokeWidth={2} />
                  导入 ZIP…
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    revealFolder(contextMenu.root, contextMenu.path)
                    setContextMenu(null)
                  }}
                >
                  <FolderOpen size={15} strokeWidth={2} />
                  在文件管理器中打开
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    onExportFolder(contextMenu.root, contextMenu.path)
                    setContextMenu(null)
                  }}
                >
                  <FileArchive size={15} strokeWidth={2} />
                  导出此目录为 ZIP
                </button>
                {contextMenu.path !== '' && (
                  <button
                    type="button"
                    role="menuitem"
                    className="is-danger"
                    disabled={hasNestedFolder(contextMenu.root, contextMenu.path)}
                    title={
                      hasNestedFolder(contextMenu.root, contextMenu.path)
                        ? '目录中还有子目录，无法删除'
                        : '删除目录及其中的所有文档'
                    }
                    onClick={() => {
                      const prefix = `${contextMenu.path}/`
                      setDeleteDialog({
                        kind: 'folder',
                        root: contextMenu.root,
                        path: contextMenu.path,
                        name: contextMenu.name,
                        docCount: docs.filter(
                          (doc) => doc.root === contextMenu.root && doc.path.startsWith(prefix),
                        ).length,
                      })
                      setContextMenu(null)
                    }}
                  >
                    <Trash2 size={15} strokeWidth={2} />
                    {hasNestedFolder(contextMenu.root, contextMenu.path)
                      ? '包含子目录，无法删除'
                      : '删除目录'}
                  </button>
                )}
                {contextMenu.path === '' && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onDetachRoot(contextMenu.root)
                      setContextMenu(null)
                    }}
                  >
                    <X size={15} strokeWidth={2} />
                    从侧栏移除目录
                  </button>
                )}
              </>
            )}
          </div>,
          document.body,
        )}

      {folderDialog &&
        createPortal(
          <div className="folder-dialog-backdrop" onMouseDown={() => setFolderDialog(null)}>
            <div className="folder-dialog" onMouseDown={(event) => event.stopPropagation()}>
              <div className="folder-dialog-title">新建文件夹</div>
              <div className="folder-dialog-hint">将在「{folderDialog.parentName}」中创建</div>
              <input
                ref={folderInputRef}
                value={folderDialog.name}
                onChange={(event) => setFolderDialog((prev) => (prev ? { ...prev, name: event.target.value } : prev))}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitFolder()
                  else if (event.key === 'Escape') setFolderDialog(null)
                }}
              />
              <div className="folder-dialog-actions">
                <button type="button" className="btn" onClick={() => setFolderDialog(null)}>取消</button>
                <button type="button" className="btn btn-primary" onClick={commitFolder}>创建</button>
              </div>
            </div>
          </div>,
          document.body,
        )}

      {deleteDialog &&
        createPortal(
          <div className="folder-dialog-backdrop" onMouseDown={() => setDeleteDialog(null)}>
            <div
              className="folder-dialog delete-dialog"
              role="alertdialog"
              aria-modal="true"
              aria-labelledby="delete-dialog-title"
              aria-describedby="delete-dialog-description"
              onMouseDown={(event) => event.stopPropagation()}
            >
              <div className="delete-dialog-icon" aria-hidden="true">
                <Trash2 size={19} strokeWidth={2} />
              </div>
              <div className="folder-dialog-title" id="delete-dialog-title">
                {deleteDialog.kind === 'doc' ? '删除文档？' : '删除目录？'}
              </div>
              <div className="folder-dialog-hint" id="delete-dialog-description">
                {deleteDialog.kind === 'doc'
                  ? `「${deleteDialog.doc.title || '未命名文档'}」将被永久删除，此操作无法撤销。`
                  : `「${deleteDialog.name}」及其中 ${deleteDialog.docCount} 篇文档将被永久删除，此操作无法撤销。`}
              </div>
              <div className="folder-dialog-actions">
                <button type="button" className="btn" onClick={() => setDeleteDialog(null)}>取消</button>
                <button
                  ref={deleteConfirmRef}
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    const target = deleteDialog
                    setDeleteDialog(null)
                    if (target.kind === 'doc') onDelete(target.doc.id)
                    else onDeleteFolder(target.root, target.path)
                  }}
                >
                  删除
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  )
}
