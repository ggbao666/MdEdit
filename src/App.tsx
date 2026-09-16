import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { CSSProperties, PointerEvent as ReactPointerEvent } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import { Selection } from '@tiptap/pm/state'
import {
  FileText,
  FolderTree,
  Save,
  Settings as SettingsIcon,
} from 'lucide-react'

import BubbleBar from './components/BubbleBar'
import About from './components/About'
import DocsPanel from './components/DocsPanel'
import type { DropPosition } from './components/DocsPanel'
import Launcher from './components/Launcher'
import Outline from './components/Outline'
import type { HeadingItem } from './components/Outline'
import Settings from './components/Settings'
import Shortcuts from './components/Shortcuts'
import type { SourceEditorHandle } from './components/SourceEditor'
import ThemeSwitcher from './components/ThemeSwitcher'
import TableContextMenu from './components/TableContextMenu'
import Toolbar from './components/Toolbar'
import { APP_SLUG } from './config/app'
import { applyTheme, type Theme } from './config/themes'
import { createExtensions, countChars, countWords } from './editor/extensions'
import { createDropHandler, createPasteHandler } from './editor/imageInput'
import { assetFileName, assetRelPath, fileToBytes, fileToDataUrl, resolveAssetDir } from './lib/assets'
import { htmlToMarkdown } from './lib/convert'
import { docToMarkdown, markdownToHtml } from './lib/markdown'
import { onMenuAction, saveBlobNative, saveTextNative } from './lib/native'
import { docsToZipBlob, readTextFiles, type ImportedMarkdown } from './lib/zip'
import {
  attachWorkspace,
  createFolder as createWorkspaceFolder,
  createDocFile,
  detachWorkspace,
  fetchState,
  getRoots,
  listDocFiles,
  listDraftFiles,
  listFolders,
  openDocFile,
  openDroppedDocFile,
  openWorkspace,
  readDocFile,
  removeDraftFile,
  removeDocFile,
  removeFolder as removeWorkspaceFolder,
  renameDocFile,
  renameFolder as renameWorkspaceFolder,
  saveDocAs,
  setActiveRoot,
  writeAssetFile,
  writeExternalAssetFile,
  writeDraftFile,
  writeDocFile,
  type FolderMeta,
  type WorkspaceInfo,
} from './lib/workspace'
import {
  createDoc as newDocRecord,
  createMemoryDoc,
  htmlToText,
  isOnDisk,
  loadDocOrder,
  loadPrefs,
  loadTheme,
  safeFileName,
  saveDocOrder,
  savePrefs,
  saveTheme,
  touchDoc,
  type DocRecord,
  type Prefs,
  type SaveState,
} from './lib/storage'

interface Toast {
  id: number
  text: string
}

const SourceEditor = lazy(() => import('./components/SourceEditor'))

function uniqueTemporaryTitle(docs: readonly DocRecord[], base = '未命名文档'): string {
  const used = new Set(docs.filter((doc) => !isOnDisk(doc)).map((doc) => doc.title))
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
}

function headingsFromMarkdown(markdown: string): HeadingItem[] {
  const list: HeadingItem[] = []
  let offset = 0
  for (const line of markdown.split('\n')) {
    const match = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line)
    if (match) list.push({ pos: offset, level: match[1].length, text: match[2].trim() || '无标题' })
    offset += line.length + 1
  }
  return list
}

export default function App() {
  /* ---------------- 状态 ---------------- */
  const [theme, setTheme] = useState<Theme>(() => {
    const initial = loadTheme()
    applyTheme(initial)
    return initial
  })
  const [prefs, setPrefs] = useState<Prefs>(loadPrefs)
  const [docs, setDocs] = useState<DocRecord[]>([])
  const [activeId, setActiveId] = useState('')
  /** 新建后让侧栏中的文件名原地进入编辑态；顶部标题框只用于平常修改。 */
  const [newDocEditId, setNewDocEditId] = useState<string | null>(null)
  /** 已挂载的目录，文档列表按它分组 */
  const [roots, setRoots] = useState<WorkspaceInfo[]>([])
  const [folders, setFolders] = useState<FolderMeta[]>([])
  /** 上次会话打开过的目录，供启动面板用 */
  const [lastRoots, setLastRoots] = useState<WorkspaceInfo[]>([])
  /** 首屏要异步探测工作区，探测完成前不渲染任何内容 */
  const [booted, setBooted] = useState(false)
  const [showLauncher, setShowLauncher] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [stats, setStats] = useState({ words: 0, chars: 0 })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [headings, setHeadings] = useState<HeadingItem[]>([])
  const [activeHeading, setActiveHeading] = useState(-1)
  const [showHelp, setShowHelp] = useState(false)
  const [showAbout, setShowAbout] = useState(false)
  const [toasts, setToasts] = useState<Toast[]>([])
  const [scrollEl, setScrollEl] = useState<HTMLDivElement | null>(null)
  const [resizingSidebar, setResizingSidebar] = useState(false)
  const [draggingMarkdown, setDraggingMarkdown] = useState(false)

  /* ---------------- 引用 ---------------- */
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const prefsRef = useRef(prefs)
  const lastRootsRef = useRef<WorkspaceInfo[]>([])
  const headingsRef = useRef<HeadingItem[]>([])
  const saveTimer = useRef<number | null>(null)
  const dirtyIdsRef = useRef<Set<string>>(new Set())
  const imageRef = useRef<HTMLInputElement>(null)
  const   toastSeq = useRef(0)

  /** 始终指向最新值，供编辑器回调（闭包）安全读取 */
  const docsRef = useRef(docs)
  const activeIdRef = useRef(activeId)
  const editorRef = useRef<Editor | null>(null)
  const sourceEditorRef = useRef<SourceEditorHandle>(null)
  /** 避免只切换模式、未改富文本时把原始 Markdown 重新格式化。 */
  const richChangedRef = useRef(false)
  /** 编辑器重建后是否聚焦到正文开头（切换 / 删除 / 副本文档时） */
  const pendingEditorFocus = useRef(false)
  const pendingSourceFocus = useRef(false)
  /** StrictMode 会重复执行首次副作用，避免欢迎文档被第二篇空文档覆盖。 */
  const initialDocumentCreated = useRef(false)
  const sidebarResizeRef = useRef({ startX: 0, startWidth: 248 })

  docsRef.current = docs
  activeIdRef.current = activeId
  prefsRef.current = prefs
  lastRootsRef.current = lastRoots

  const currentDoc = docs.find((d) => d.id === activeId)
  const title = currentDoc?.title ?? '未命名文档'
  const titleRef = useRef(title)
  titleRef.current = title

  /* ---------------- 编辑器内部逻辑 ---------------- */

  function collectHeadings(ed: Editor): HeadingItem[] {
    const list: HeadingItem[] = []
    ed.state.doc.forEach((node, pos) => {
      if (node.type.name === 'heading') {
        list.push({
          pos,
          level: Number(node.attrs.level ?? 1),
          text: node.textContent.trim() || '无标题',
        })
      }
    })
    return list
  }

  function activeIndexFor(list: HeadingItem[], pos: number): number {
    let index = -1
    for (let i = 0; i < list.length; i += 1) {
      if (list[i].pos <= pos) index = i
      else break
    }
    return index
  }

  function sameHeadings(a: HeadingItem[], b: HeadingItem[]): boolean {
    if (a.length !== b.length) return false
    return a.every((item, i) => item.pos === b[i].pos && item.level === b[i].level && item.text === b[i].text)
  }

  function refreshAll(ed: Editor) {
    const counter = ed.storage.characterCount as
      | { words: () => number; characters: () => number }
      | undefined
    /*
     * 编辑器刚建好的那一帧，extension storage 可能还没挂上（生产包里能稳定复现），
     * 直接取会抛异常并让整棵 React 树卸载。兜一手：本地按同一套规则算一遍。
     */
    const words = counter
      ? counter.words()
      : countWords(ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', ' '))
    const chars = counter
      ? counter.characters()
      : countChars(ed.state.doc.textBetween(0, ed.state.doc.content.size, '\n', ' '))

    setStats((prev) => (prev.words === words && prev.chars === chars ? prev : { words, chars }))

    const next = collectHeadings(ed)
    headingsRef.current = next
    setHeadings((prev) => (sameHeadings(prev, next) ? prev : next))
    setActiveHeading(activeIndexFor(next, ed.state.selection.from))
  }

  function syncActive(ed: Editor) {
    setActiveHeading(activeIndexFor(headingsRef.current, ed.state.selection.from))
  }

  /* ---------------- 通用动作 ---------------- */

  /** 新建 / 导入 / 删除等场景下给个轻量反馈 */
  const pushToast = useCallback((text: string) => {
    toastSeq.current += 1
    const id = toastSeq.current
    setToasts((prev) => [...prev, { id, text }])
    window.setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 2200)
  }, [])

  /**
   * 从所有已挂载目录重建文档列表。
   * 磁盘文件本身没有顺序，手动拖出来的顺序按目录单独存了一份。
   */
  const loadDocs = useCallback(async (list: WorkspaceInfo[], preferId = ''): Promise<void> => {
    const [files, nextFolders] = await Promise.all([listDocFiles(), listFolders()])
    const records: DocRecord[] = []
    const cachedDocs = new Map(docsRef.current.map((doc) => [doc.id, doc]))
    const dirtyBeforeReload = new Set(dirtyIdsRef.current)
    const temporary = docsRef.current.filter((doc) => !isOnDisk(doc))

    for (const info of list) {
      const mine = files.filter((f) => f.root === info.root)
      const order = loadDocOrder(info.root)
      const rank = (path: string) => {
        const i = order.indexOf(path)
        return i < 0 ? Number.MAX_SAFE_INTEGER : i
      }
      mine.sort((a, b) => {
        const ra = rank(a.path)
        const rb = rank(b.path)
        if (ra !== rb) return ra - rb
        return a.title.localeCompare(b.title, 'zh-Hans-CN')
      })
      for (const file of mine) {
        const id = `${file.root}|${file.path}`
        const cached = cachedDocs.get(id)
        if (cached && dirtyBeforeReload.has(id)) {
          records.push(cached)
          continue
        }
        const markdown = await readDocFile(file.root, file.path)
        const html = markdownToHtml(markdown)
        records.push({
          ...newDocRecord(file.title, html, file.root, file.path, markdown),
          createdAt: file.mtime,
          updatedAt: file.mtime,
        })
      }
    }

    setFolders(nextFolders)
    const nextDocs = [...records, ...temporary]
    const nextIds = new Set(nextDocs.map((doc) => doc.id))
    dirtyIdsRef.current = new Set([...dirtyBeforeReload].filter((id) => nextIds.has(id)))
    docsRef.current = nextDocs
    setDocs(nextDocs)

    const wanted = nextDocs.find((d) => d.id === preferId) ?? nextDocs.find((d) => d.id === activeIdRef.current) ?? nextDocs[0]
    activeIdRef.current = wanted?.id ?? ''
    setActiveId(wanted?.id ?? '')
    setActiveRoot(wanted?.root ?? null)
    setSaveState(wanted && dirtyIdsRef.current.has(wanted.id) ? 'dirty' : 'idle')
  }, [])

  /** 打开（并挂载）一个目录；传 null 表示弹系统选择框 */
  const attachRoot = useCallback(
    async (root: string | null): Promise<WorkspaceInfo[] | null> => {
      const st = root ? await attachWorkspace(root) : await openWorkspace()
      if (!st) return null
      setRoots(st.roots)
      await loadDocs(st.roots)
      pendingEditorFocus.current = true
      return st.roots
    },
    [loadDocs],
  )

  /** 把富文本及其 Markdown 同步进记录，保证两种编辑模式使用同一份内容。 */
  const commitHtml = useCallback((id: string, html: string, markdown?: string) => {
    const patch = markdown === undefined ? { html } : { html, markdown }
    const next = docsRef.current.map((d) => (d.id === id ? touchDoc(d, patch) : d))
    docsRef.current = next
    setDocs(next)
  }, [])

  const commitMarkdown = useCallback((id: string, markdown: string) => {
    const next = docsRef.current.map((d) => (d.id === id ? touchDoc(d, { markdown }) : d))
    docsRef.current = next
    setDocs(next)
  }, [])

  /**
   * 把当前文档序列化成 Markdown 写回磁盘。
   * 标题和文件名不一致时先改名（重命名也会顺带带走「文档名.assets」资源目录）。
   */
  const persistMarkdownToDisk = useCallback(async (doc: DocRecord, markdown: string) => {
    const id = doc.id
    if (!isOnDisk(doc)) return false

    let path = doc.path
    let savedId = id
    const root = doc.root
    const currentName = path.replace(/^.*\//, '').replace(/\.(md|markdown)$/i, '')
    if (currentName !== doc.title) {
      const renamed = await renameDocFile(root, path, doc.title)
      if (renamed) {
        path = renamed.path
        savedId = `${renamed.root}|${renamed.path}`
        const nextDocs = docsRef.current.map((d) =>
          d.id === id
            ? { ...d, id: savedId, path: renamed.path, title: renamed.title }
            : d,
        )
        docsRef.current = nextDocs
        setDocs(nextDocs)
        if (dirtyIdsRef.current.delete(id)) dirtyIdsRef.current.add(savedId)
        if (activeIdRef.current === id) {
          activeIdRef.current = savedId
          setActiveId(savedId)
        }
      }
    }

    const ok = await writeDocFile(root, path, markdown)
    if (ok) {
      dirtyIdsRef.current.delete(id)
      dirtyIdsRef.current.delete(savedId)
    }
    if (activeIdRef.current === savedId || activeIdRef.current === id) {
      setSaveState(ok ? 'saved' : 'dirty')
    }
    return ok
  }, [])

  /** 立即同步当前模式内容；自动保存开启或显式传 true 时才写回磁盘。 */
  const flushSave = useCallback((forcePersist = prefsRef.current.autoSave) => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const id = activeIdRef.current
    let doc = docsRef.current.find((d) => d.id === id)
    if (!doc) return

    let markdown = doc.markdown
    if (prefsRef.current.editorMode === 'source') {
      commitHtml(id, markdownToHtml(markdown), markdown)
    } else {
      const ed = editorRef.current
      if (!ed || ed.isDestroyed) return
      if (richChangedRef.current) markdown = docToMarkdown(ed.getJSON())
      commitHtml(id, ed.getHTML(), markdown)
      richChangedRef.current = false
    }

    doc = docsRef.current.find((d) => d.id === id)
    if (doc && isOnDisk(doc) && forcePersist) void persistMarkdownToDisk(doc, markdown)
    else if (doc && !isOnDisk(doc)) {
      void writeDraftFile(id, doc.title, markdown).then(() => {
        if (activeIdRef.current === id) setSaveState('dirty')
      })
    }
  }, [commitHtml, persistMarkdownToDisk])

  const scheduleSave = useCallback(() => {
    const id = activeIdRef.current
    if (id) dirtyIdsRef.current.add(id)
    if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    if (!prefsRef.current.autoSave) {
      setSaveState('dirty')
      const current = docsRef.current.find((doc) => doc.id === id)
      // “自动保存”关闭时不写正式文件，但临时文档仍保留恢复副本，避免重启丢失。
      if (current && !isOnDisk(current)) {
        saveTimer.current = window.setTimeout(() => {
          saveTimer.current = null
          flushSave(false)
        }, prefsRef.current.autoSaveDelay)
      } else {
        saveTimer.current = null
      }
      return
    }
    setSaveState('saving')
    saveTimer.current = window.setTimeout(() => {
      saveTimer.current = null
      flushSave(true)
    }, prefsRef.current.autoSaveDelay)
  }, [flushSave])

  const manualSave = useCallback(async () => {
    let doc = docsRef.current.find((d) => d.id === activeIdRef.current)
    if (!doc) return
    if (isOnDisk(doc)) {
      flushSave(true)
      pushToast('已保存')
      return
    }

    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    let markdown = doc.markdown
    if (prefsRef.current.editorMode === 'source') {
      commitHtml(doc.id, markdownToHtml(markdown), markdown)
    } else {
      const ed = editorRef.current
      if (!ed || ed.isDestroyed) return
      if (richChangedRef.current) markdown = docToMarkdown(ed.getJSON())
      commitHtml(doc.id, ed.getHTML(), markdown)
      richChangedRef.current = false
    }
    doc = docsRef.current.find((item) => item.id === doc?.id)
    if (!doc) return
    setSaveState('saving')
    const saved = await saveDocAs(safeFileName(doc.title), markdown)
    if (!saved) {
      setSaveState('dirty')
      return
    }

    const savedId = `${saved.file.root}|${saved.file.path}`
    const nextDocs = docsRef.current.map((item) =>
      item.id === doc.id
        ? { ...item, id: savedId, root: saved.file.root, path: saved.file.path, title: saved.file.title }
        : item,
    )
    docsRef.current = nextDocs
    setDocs(nextDocs)
    dirtyIdsRef.current.delete(doc.id)
    void removeDraftFile(doc.id)
    setRoots(saved.state.roots)
    activeIdRef.current = savedId
    setActiveId(savedId)
    setActiveRoot(saved.file.root)
    await loadDocs(saved.state.roots, savedId)
    setSaveState('saved')
    pushToast('文档已保存')
  }, [commitHtml, flushSave, loadDocs, pushToast])

  const refreshSource = useCallback((markdown: string) => {
    let text = markdown
    try {
      text = htmlToText(markdownToHtml(markdown))
    } catch {
      /* 保留原文作为统计兜底 */
    }
    setStats({ words: countWords(text), chars: countChars(text) })
    const next = headingsFromMarkdown(markdown)
    headingsRef.current = next
    setHeadings(next)
  }, [])

  const handleSourceChange = useCallback(
    (markdown: string) => {
      const id = activeIdRef.current
      if (!id) return
      commitMarkdown(id, markdown)
      refreshSource(markdown)
      scheduleSave()
    },
    [commitMarkdown, refreshSource, scheduleSave],
  )

  const toggleEditorMode = useCallback(() => {
    const leavingSource = prefsRef.current.editorMode === 'source'
    // 先同步当前模式的最新内容，再切换视图；光标统一交给目标编辑器定位到文档开头。
    flushSave(false)
    if (leavingSource) {
      /*
       * Tiptap 在源码模式中保持挂载，避免切回富文本时工具栏短暂拿到
       * 已销毁的 editor。切换前把最新 Markdown 灌回同一个实例即可。
       */
      const doc = docsRef.current.find((item) => item.id === activeIdRef.current)
      const ed = editorRef.current
      if (doc && ed && !ed.isDestroyed) {
        ed.commands.setContent(markdownToHtml(doc.markdown), { emitUpdate: false })
        richChangedRef.current = false
      }
      pendingEditorFocus.current = true
    } else {
      pendingSourceFocus.current = true
    }
    setPrefs((current) => ({ ...current, editorMode: leavingSource ? 'rich' : 'source' }))
  }, [flushSave])

  /**
   * 插入图片。
   * 「原图」策略：把原图字节写进资源目录，节点只记相对引用；
   * 「内联」策略：把原图转成 base64 直接嵌进文档。
   */
  const insertImages = useCallback(
    async (files: File[]) => {
      const ed = editorRef.current
      const sourceMode = prefsRef.current.editorMode === 'source'
      if (files.length === 0) return
      if (!sourceMode && (!ed || ed.isDestroyed)) return

      const target = currentDoc?.root || null
      const customAssetDirectory = prefs.assetDirMode === 'custom' ? prefs.customAssetDir.trim() : ''
      const toDisk = prefs.imageMode === 'file' && Boolean(customAssetDirectory || target)
      const sourceSnippets: string[] = []
      let inserted = 0

      for (const file of files) {
        try {
          if (toDisk) {
            const bytes = await fileToBytes(file)
            const name = assetFileName(file.name, file.type)
            const saved = customAssetDirectory
              ? await writeExternalAssetFile(customAssetDirectory, name, bytes)
              : target
                ? await writeAssetFile(
                    target,
                    assetRelPath(resolveAssetDir(prefs.assetDir, titleRef.current), name),
                    bytes,
                  )
                : null
            if (!saved) continue
            if (sourceMode) {
              const destination = /[\s()<>]/.test(saved) ? `<${saved}>` : saved
              sourceSnippets.push(`![${name.replace(/[[\]]/g, '\\$&')}](${destination})`)
            } else {
              ed?.chain().focus().insertImage({ rel: saved, alt: name }).run()
            }
          } else {
            const dataUrl = await fileToDataUrl(file)
            if (sourceMode) {
              sourceSnippets.push(`![${file.name.replace(/[[\]]/g, '\\$&')}](${dataUrl})`)
            } else {
              ed?.chain().focus().insertImage({ rel: dataUrl, alt: file.name }).run()
            }
          }
          inserted += 1
        } catch {
          /* 单张失败不影响后面的 */
        }
      }

      if (inserted === 0) {
        pushToast('图片插入失败')
        return
      }
      if (sourceMode) sourceEditorRef.current?.insertText(sourceSnippets.join('\n'))
      pushToast(toDisk ? `已插入 ${inserted} 张原图到资源目录` : `已内联插入 ${inserted} 张图片`)
      if (!sourceMode) scheduleSave()
    },
    [
      currentDoc?.root,
      prefs.imageMode,
      prefs.assetDir,
      prefs.assetDirMode,
      prefs.customAssetDir,
      pushToast,
      scheduleSave,
    ],
  )

  /* ---------------- 编辑器实例 ----------------
     deps = [activeId, booted]：只在切换文档时销毁重建，
     顺带清空 undo 历史，避免 Ctrl+Z 把上一篇的内容恢复出来。
     富文本 / 源码切换必须复用实例，否则工具栏可能引用到销毁中的 editor。 */
  const editor = useEditor(
    {
      extensions: createExtensions(),
      content: currentDoc?.html ?? '<p></p>',
      editorProps: {
        attributes: { class: 'tiptap', spellcheck: 'false' },
        handlePaste: createPasteHandler((files) => void insertImages(files)),
        handleDrop: createDropHandler((files) => void insertImages(files)),
      },
      shouldRerenderOnTransaction: true,
      onUpdate: ({ editor: ed }) => {
        if (prefsRef.current.editorMode !== 'rich') return
        richChangedRef.current = true
        refreshAll(ed)
        scheduleSave()
      },
      onSelectionUpdate: ({ editor: ed }) => {
        syncActive(ed)
      },
    },
    [activeId, booted],
  )

  editorRef.current = editor

  /* ---------------- 副作用 ---------------- */

  // 编辑器重建（首屏 / 切换文档）后同步统计与大纲。
  // 用显式意图标记决定是否抢焦点，比"是不是第一次挂载"更可靠（StrictMode 下 effect 会跑两次）
  useEffect(() => {
    if (!editor) return
    let focusFrame = 0
    let cancelled = false
    richChangedRef.current = false
    if (prefs.editorMode === 'source') refreshSource(currentDoc?.markdown ?? '')
    else refreshAll(editor)

    if (pendingEditorFocus.current && prefs.editorMode === 'rich') {
      pendingEditorFocus.current = false
      let mountPasses = 0
      const focusDocumentStart = () => {
        if (cancelled || editor.isDestroyed || prefsRef.current.editorMode !== 'rich') return
        if (!editor.view.dom.isConnected) {
          mountPasses += 1
          if (mountPasses < 12) focusFrame = requestAnimationFrame(focusDocumentStart)
          return
        }
        if (scrollElRef.current) scrollElRef.current.scrollTop = 0
        const startSelection = Selection.atStart(editor.state.doc)
        editor.view.dispatch(editor.state.tr.setSelection(startSelection).scrollIntoView())
        editor.view.focus()
      }
      focusFrame = requestAnimationFrame(focusDocumentStart)
    }
    return () => {
      cancelled = true
      cancelAnimationFrame(focusFrame)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, prefs.editorMode])

  useEffect(() => {
    if (prefs.editorMode !== 'source') return
    let restoreFrame = 0
    refreshSource(currentDoc?.markdown ?? '')
    if (pendingEditorFocus.current) {
      pendingEditorFocus.current = false
      pendingSourceFocus.current = true
    }
    if (pendingSourceFocus.current) {
      pendingSourceFocus.current = false
      restoreFrame = requestAnimationFrame(() => {
        if (scrollElRef.current) scrollElRef.current.scrollTop = 0
        sourceEditorRef.current?.focusAt(0)
      })
    }
    return () => cancelAnimationFrame(restoreFrame)
  }, [activeId, currentDoc?.markdown, prefs.editorMode, refreshSource])

  // 首屏：刷新页面时沿用已挂载目录；真正冷启动始终显示启动选择页。
  useEffect(() => {
    let cancelled = false
    void (async () => {
      const recovered = await listDraftFiles()
      if (cancelled) return
      const meaningfulDrafts = recovered.filter((file) => file.content.trim().length > 0)
      for (const empty of recovered.filter((file) => file.content.trim().length === 0)) {
        void removeDraftFile(empty.id)
      }
      const recoveredDocs = meaningfulDrafts.map((file) => {
        const record = createMemoryDoc(file.title, markdownToHtml(file.content), file.content)
        return {
          ...record,
          id: file.id,
          createdAt: file.mtime,
          updatedAt: file.mtime,
        }
      })
      docsRef.current = recoveredDocs
      setDocs(recoveredDocs)
      if (recoveredDocs.length > 0) {
        activeIdRef.current = recoveredDocs[0].id
        setActiveId(recoveredDocs[0].id)
      }

      const st = await fetchState()
      if (cancelled) return
      setLastRoots(st.last)

      if (st.roots.length > 0) {
        // 主进程里还挂着目录（比如刚挂载完又刷新了页面），直接接着用
        setRoots(st.roots)
        await loadDocs(st.roots)
      } else {
        setShowLauncher(true)
      }
      if (!cancelled) setBooted(true)
    })()
    return () => {
      cancelled = true
    }
  }, [loadDocs])

  // 一个目录都没开、列表又空着的时候，给一篇内存文档，保证界面能直接开始写
  useEffect(() => {
    if (!booted || docs.length > 0) return
    if (showLauncher) return
    if (getRoots().length > 0) return
    if (initialDocumentCreated.current) return
    initialDocumentCreated.current = true
    const doc = createMemoryDoc(uniqueTemporaryTitle(docsRef.current))
    docsRef.current = [doc]
    setDocs([doc])
    activeIdRef.current = doc.id
    setActiveId(doc.id)
    void writeDraftFile(doc.id, doc.title, '')
  }, [booted, docs.length, showLauncher])

  useEffect(() => {
    applyTheme(theme)
    saveTheme(theme)
  }, [theme])

  useEffect(() => {
    savePrefs(prefs)
  }, [prefs])

  // 切换保存模式时取消旧计时；重新开启后把当前未保存内容按新延迟写入。
  useEffect(() => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    if (!prefs.autoSave) {
      if (dirtyIdsRef.current.has(activeIdRef.current)) setSaveState('dirty')
      return
    }
    if (dirtyIdsRef.current.has(activeIdRef.current)) scheduleSave()
  }, [prefs.autoSave, prefs.autoSaveDelay, scheduleSave])

  // 关窗口前把未落盘的改动写进去
  useEffect(() => {
    const onLeave = () => flushSave()
    window.addEventListener('beforeunload', onLeave)
    return () => window.removeEventListener('beforeunload', onLeave)
  }, [flushSave])

  useEffect(
    () => () => {
      if (saveTimer.current !== null) window.clearTimeout(saveTimer.current)
    },
    [],
  )

  /* ---------------- 文档操作 ---------------- */

  /** 切换文档：先把当前内容存回去，再换 activeId */
  const switchTo = useCallback(
    (id: string) => {
      if (id === activeIdRef.current) return
      flushSave()
      const doc = docsRef.current.find((d) => d.id === id)
      setActiveRoot(doc?.root || null)
      activeIdRef.current = id
      pendingEditorFocus.current = true
      setActiveId(id)
      setSaveState(dirtyIdsRef.current.has(id) ? 'dirty' : 'idle')
    },
    [flushSave],
  )

  /** 新建文档：指定了目录就落到那个目录，否则新建一篇内存文档 */
  const createDoc = useCallback(
    (wantRoot: string | null = null, wantDir = '') => {
      flushSave()
      const target = wantRoot

      if (!target) {
        const doc = createMemoryDoc(uniqueTemporaryTitle(docsRef.current), '<p></p>')
        docsRef.current = [...docsRef.current, doc]
        setDocs(docsRef.current)
        activeIdRef.current = doc.id
        setActiveId(doc.id)
        setSaveState('idle')
        void writeDraftFile(doc.id, doc.title, '')
        setNewDocEditId(doc.id)
        pushToast('已新建文档（还没保存到目录）')
        return
      }

      void (async () => {
        const meta = await createDocFile(target, '未命名文档', wantDir)
        if (!meta) {
          pushToast('新建失败，请检查文件夹权限')
          return
        }
        const record: DocRecord = {
          ...newDocRecord(meta.title, '<p></p>', meta.root, meta.path, ''),
          createdAt: meta.mtime,
          updatedAt: meta.mtime,
        }
        docsRef.current = [...docsRef.current, record]
        setDocs(docsRef.current)
        setActiveRoot(meta.root)
        activeIdRef.current = record.id
        setActiveId(record.id)
        setSaveState('idle')
        setNewDocEditId(record.id)
        pushToast('已新建文档')
      })()
    },
    [flushSave, pushToast],
  )

  const createFolder = useCallback(
    async (root: string, parent: string, name: string): Promise<FolderMeta | null> => {
      const folder = await createWorkspaceFolder(root, parent, name)
      if (!folder) {
        pushToast('新建文件夹失败，请检查名称或目录权限')
        return null
      }
      setFolders((prev) => [...prev.filter((item) => !(item.root === folder.root && item.path === folder.path)), folder])
      pushToast(`已新建文件夹「${folder.name}」`)
      return folder
    },
    [pushToast],
  )

  const renameFolder = useCallback(
    async (root: string, from: string, name: string): Promise<FolderMeta | null> => {
      const folder = await renameWorkspaceFolder(root, from, name)
      if (!folder) {
        pushToast('重命名文件夹失败，请检查名称或目录权限')
        return null
      }

      const oldPrefix = `${from}/`
      const remapPath = (path: string) => folder.path + path.slice(from.length)
      setFolders((prev) =>
        prev.map((item) => {
          if (item.root !== root || (item.path !== from && !item.path.startsWith(oldPrefix))) return item
          const path = remapPath(item.path)
          return { ...item, path, name: item.path === from ? folder.name : item.name }
        }),
      )

      const idMap = new Map<string, string>()
      const nextDocs = docsRef.current.map((doc) => {
        if (doc.root !== root || !doc.path.startsWith(oldPrefix)) return doc
        const path = remapPath(doc.path)
        const id = `${root}|${path}`
        idMap.set(doc.id, id)
        return { ...doc, id, path }
      })
      docsRef.current = nextDocs
      setDocs(nextDocs)

      for (const [oldId, newId] of idMap) {
        if (dirtyIdsRef.current.delete(oldId)) dirtyIdsRef.current.add(newId)
      }
      const nextActiveId = idMap.get(activeIdRef.current)
      if (nextActiveId) {
        activeIdRef.current = nextActiveId
        setActiveId(nextActiveId)
      }
      pushToast(`已重命名文件夹为「${folder.name}」`)
      return folder
    },
    [pushToast],
  )

  const renameDoc = useCallback((id: string, next: string) => {
    const clean = next.trim() || '未命名文档'
    const optimistic = docsRef.current.map((d) => (d.id === id ? { ...d, title: clean } : d))
    docsRef.current = optimistic
    setDocs(optimistic)

    const target = optimistic.find((d) => d.id === id)
    if (!target) return
    if (!isOnDisk(target)) {
      void writeDraftFile(target.id, target.title, target.markdown || htmlToMarkdown(target.html))
      return
    }

    void (async () => {
      const meta = await renameDocFile(target.root, target.path, clean)
      if (!meta) return
      const newId = `${meta.root}|${meta.path}`
      if (dirtyIdsRef.current.delete(id)) dirtyIdsRef.current.add(newId)
      const synced = docsRef.current.map((d) =>
        d.id === id ? { ...d, id: newId, path: meta.path, title: meta.title } : d,
      )
      docsRef.current = synced
      setDocs(synced)
      if (activeIdRef.current === id) {
        activeIdRef.current = newId
        setActiveId(newId)
      }
    })()
  }, [])

  const duplicateDoc = useCallback(
    (id: string) => {
      flushSave()
      const src = docsRef.current.find((d) => d.id === id)
      if (!src) return

      if (!isOnDisk(src)) {
        const copy = createMemoryDoc(
          uniqueTemporaryTitle(docsRef.current, `${src.title} 副本`),
          src.html,
          src.markdown,
        )
        docsRef.current = [...docsRef.current, copy]
        setDocs(docsRef.current)
        activeIdRef.current = copy.id
        setActiveId(copy.id)
        setSaveState('idle')
        void writeDraftFile(copy.id, copy.title, copy.markdown || htmlToMarkdown(copy.html))
        pendingEditorFocus.current = true
        pushToast('已创建副本')
        return
      }

      void (async () => {
        const slash = src.path.lastIndexOf('/')
        const dir = slash < 0 ? '' : src.path.slice(0, slash)
        const meta = await createDocFile(src.root, `${src.title} 副本`, dir)
        if (!meta) {
          pushToast('创建副本失败')
          return
        }
        await writeDocFile(meta.root, meta.path, src.markdown || htmlToMarkdown(src.html))
        const record: DocRecord = {
          ...newDocRecord(meta.title, src.html, meta.root, meta.path, src.markdown || htmlToMarkdown(src.html)),
          createdAt: meta.mtime,
          updatedAt: meta.mtime,
        }
        docsRef.current = [...docsRef.current, record]
        setDocs(docsRef.current)
        activeIdRef.current = record.id
        setActiveId(record.id)
        setSaveState('idle')
        pendingEditorFocus.current = true
        pushToast('已创建副本')
      })()
    },
    [flushSave, pushToast],
  )

  const deleteDoc = useCallback(
    (id: string) => {
      flushSave()
      dirtyIdsRef.current.delete(id)
      const target = docsRef.current.find((d) => d.id === id)
      if (target && isOnDisk(target)) void removeDocFile(target.root, target.path)
      else if (target) void removeDraftFile(target.id)

      const index = docsRef.current.findIndex((d) => d.id === id)
      const rest = docsRef.current.filter((d) => d.id !== id)
      docsRef.current = rest
      setDocs(rest)

      // 删除最后一篇文档后回到起始页，避免只剩空白的编辑器壳层。
      if (rest.length === 0) setShowLauncher(true)

      if (id === activeIdRef.current) {
        // 删掉的是当前文档：切到相邻的那一篇
        const next = rest[Math.min(index, rest.length - 1)]
        activeIdRef.current = next?.id ?? ''
        setActiveId(next?.id ?? '')
        setActiveRoot(next?.root || null)
        setSaveState(next && dirtyIdsRef.current.has(next.id) ? 'dirty' : 'idle')
        pendingEditorFocus.current = true
      }
      pushToast('已删除文档')
    },
    [flushSave, pushToast],
  )

  const deleteFolder = useCallback(
    async (root: string, path: string) => {
      const prefix = `${path}/`
      const targets = docsRef.current.filter((doc) => doc.root === root && doc.path.startsWith(prefix))
      const targetIds = new Set(targets.map((doc) => doc.id))

      if (!targetIds.has(activeIdRef.current)) flushSave()
      else if (saveTimer.current !== null) {
        window.clearTimeout(saveTimer.current)
        saveTimer.current = null
      }

      const result = await removeWorkspaceFolder(root, path)
      if (result !== 'removed') {
        if (result === 'has-subfolders') pushToast('目录中还有子目录，无法删除')
        else if (result === 'has-other-files') pushToast('目录中还有非 Markdown 文件，未删除')
        else pushToast('删除目录失败，请检查目录权限')
        return
      }

      targetIds.forEach((id) => dirtyIdsRef.current.delete(id))
      const activeIndex = docsRef.current.findIndex((doc) => doc.id === activeIdRef.current)
      const activeWasDeleted = targetIds.has(activeIdRef.current)
      const rest = docsRef.current.filter((doc) => !targetIds.has(doc.id))
      docsRef.current = rest
      setDocs(rest)
      setFolders((prev) => prev.filter((folder) => !(folder.root === root && folder.path === path)))

      if (rest.length === 0) setShowLauncher(true)
      if (activeWasDeleted) {
        const next = rest[Math.min(activeIndex, rest.length - 1)]
        activeIdRef.current = next?.id ?? ''
        setActiveId(next?.id ?? '')
        setActiveRoot(next?.root || null)
        setSaveState(next && dirtyIdsRef.current.has(next.id) ? 'dirty' : 'idle')
        pendingEditorFocus.current = true
      }
      pushToast(`已删除目录及 ${targets.length} 篇文档`)
    },
    [flushSave, pushToast],
  )

  /** 拖拽排序：同一目录内把 dragId 移动到 targetId 的前/后 */
  const reorderDocs = useCallback(
    (dragId: string, targetId: string, position: DropPosition) => {
      const list = docsRef.current
      const from = list.findIndex((d) => d.id === dragId)
      const target = list.findIndex((d) => d.id === targetId)
      if (from < 0 || target < 0 || from === target) return
      // 跨目录拖动直接忽略：两个目录各有各的顺序
      if (list[from].root !== list[target].root) return
      const fromDir = list[from].path.slice(0, Math.max(0, list[from].path.lastIndexOf('/') + 1))
      const targetDir = list[target].path.slice(0, Math.max(0, list[target].path.lastIndexOf('/') + 1))
      if (fromDir !== targetDir) return

      const next = [...list]
      const [moved] = next.splice(from, 1)
      // 先算目标位置：原索引可能因 splice 前移了一位
      let insertAt = next.findIndex((d) => d.id === targetId)
      if (position === 'after') insertAt += 1
      next.splice(insertAt, 0, moved)

      docsRef.current = next
      setDocs(next)

      // 磁盘上的文件没有顺序，单独把顺序记在这个目录上
      if (moved.root) saveDocOrder(moved.root, next.filter((d) => d.root === moved.root).map((d) => d.path))
    },
    [],
  )

  /** 把目录从侧栏移除，不动磁盘上的任何文件 */
  const detachRoot = useCallback(
    async (root: string) => {
      flushSave()
      const st = await detachWorkspace(root)
      if (!st) return
      setRoots(st.roots)

      const rest = docsRef.current.filter((d) => d.root !== root)
      setFolders((prev) => prev.filter((folder) => folder.root !== root))
      for (const doc of docsRef.current) {
        if (doc.root === root) dirtyIdsRef.current.delete(doc.id)
      }
      docsRef.current = rest
      setDocs(rest)

      if (!rest.some((d) => d.id === activeIdRef.current)) {
        const first = rest[0]
        activeIdRef.current = first?.id ?? ''
        setActiveId(first?.id ?? '')
        setActiveRoot(first?.root || null)
        setSaveState(first && dirtyIdsRef.current.has(first.id) ? 'dirty' : 'idle')
        pendingEditorFocus.current = true
      }
      pushToast('已把这个目录从侧栏移除')
    },
    [flushSave, pushToast],
  )

  const handleOpenFolder = useCallback(async () => {
    flushSave()
    const list = await attachRoot(null)
    if (list) pushToast(`已打开 ${list[list.length - 1]?.name ?? '目录'}`)
  }, [attachRoot, flushSave, pushToast])

  const handleOpenFile = useCallback(async (): Promise<boolean> => {
    flushSave()
    const opened = await openDocFile()
    if (!opened) return false
    setRoots(opened.state.roots)
    await loadDocs(opened.state.roots, `${opened.file.root}|${opened.file.path}`)
    pendingEditorFocus.current = true
    pushToast(`已打开 ${opened.file.path}`)
    return true
  }, [flushSave, loadDocs, pushToast])

  const handleDroppedMarkdown = useCallback(
    async (file: File) => {
      flushSave()
      const opened = await openDroppedDocFile(file)
      if (!opened) {
        pushToast('无法打开拖入的 Markdown 文件')
        return
      }
      const id = `${opened.file.root}|${opened.file.path}`
      setRoots(opened.state.roots)
      setShowLauncher(false)
      await loadDocs(opened.state.roots, id)
      pushToast(`已打开「${opened.file.title}」`)
    },
    [flushSave, loadDocs, pushToast],
  )

  useEffect(() => {
    const markdownFile = (transfer: DataTransfer | null): File | null => {
      if (!transfer) return null
      const files = Array.from(transfer.files)
      for (const item of Array.from(transfer.items)) {
        const file = item.kind === 'file' ? item.getAsFile() : null
        if (file && !files.includes(file)) files.push(file)
      }
      return files.find((file) => /\.(md|markdown)$/i.test(file.name)) ?? null
    }
    const onDragOver = (event: DragEvent) => {
      if (!markdownFile(event.dataTransfer)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setDraggingMarkdown(true)
    }
    const onDragLeave = (event: DragEvent) => {
      if (event.relatedTarget === null) setDraggingMarkdown(false)
    }
    const onDrop = (event: DragEvent) => {
      const file = markdownFile(event.dataTransfer)
      if (!file) return
      event.preventDefault()
      event.stopPropagation()
      setDraggingMarkdown(false)
      void handleDroppedMarkdown(file)
    }
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [handleDroppedMarkdown])

  /** 启动选择页的四个出口 */
  const finishLaunch = useCallback(
    async (action: 'last' | 'folder' | 'file' | 'blank') => {
      if (action === 'blank') {
        setShowLauncher(false)
        createDoc(null)
        return
      }

      if (action === 'last') {
        for (const dir of lastRootsRef.current) await attachWorkspace(dir.root)
        const st = await fetchState()
        if (st.roots.length === 0) {
          pushToast('上次的目录已经不存在了')
          return
        }
        setRoots(st.roots)
        await loadDocs(st.roots)
      } else if (action === 'folder') {
        const list = await attachRoot(null)
        if (!list) return
      } else if (!(await handleOpenFile())) {
        return
      }
      setShowLauncher(false)
      pendingEditorFocus.current = true
    },
    [attachRoot, createDoc, handleOpenFile, loadDocs, pushToast],
  )

  const handleExport = useCallback(async () => {
    flushSave(false)
    const md = docsRef.current.find((doc) => doc.id === activeIdRef.current)?.markdown ?? ''
    const name = `${safeFileName(titleRef.current)}.md`
    if (await saveTextNative(name, md)) pushToast('已导出 Markdown 文件')
  }, [flushSave, pushToast])

  /** 全部文档 → 一个 ZIP，每篇一个 .md */
  const handleExportAll = useCallback(async () => {
    const list = docsRef.current
    if (list.length === 0) return
    try {
      flushSave()
      const blob = docsToZipBlob(list)
      const stamp = new Date().toISOString().slice(0, 10)
      const name = `${APP_SLUG}-docs-${stamp}.zip`
      if (await saveBlobNative(name, blob)) pushToast(`已导出 ${list.length} 篇文档为 ZIP`)
    } catch {
      pushToast('导出失败，请重试')
    }
  }, [flushSave, pushToast])

  const handleExportFolder = useCallback(
    async (root: string, folderPath = '') => {
      flushSave()
      const prefix = folderPath ? `${folderPath}/` : ''
      const list = docsRef.current.filter(
        (doc) => doc.root === root && (!folderPath || doc.path.startsWith(prefix)),
      )
      if (list.length === 0) {
        pushToast('这个目录下没有 Markdown 文档')
        return
      }
      try {
        const blob = docsToZipBlob(list, (doc) => (prefix ? doc.path.slice(prefix.length) : doc.path))
        const rootName = roots.find((item) => item.root === root)?.name || '文档'
        const folderName = folderPath.split('/').filter(Boolean).pop() || rootName
        const name = `${safeFileName(folderName)}-${new Date().toISOString().slice(0, 10)}.zip`
        if (await saveBlobNative(name, blob)) pushToast(`已导出 ${list.length} 篇文档为 ZIP`)
      } catch {
        pushToast('导出失败，请重试')
      }
    },
    [flushSave, pushToast, roots],
  )

  /** 导入：目标目录由目录树右键菜单明确传入。 */
  const handleFiles = useCallback(
    async (files: readonly File[], target: string, targetDir: string) => {
      let items: ImportedMarkdown[] = []
      try {
        items = await readTextFiles(files)
      } catch {
        pushToast('读取失败，请确认文件是 UTF-8 编码的 .md / .zip')
        return
      }
      if (items.length === 0) {
        pushToast('没有找到可导入的 Markdown 文件')
        return
      }

      if (!target) {
        pushToast('请先打开一个目录')
        return
      }

      flushSave()
      let count = 0
      let firstId = ''
      for (const item of items) {
        const meta = await createDocFile(target, item.name.trim() || '未命名文档', targetDir)
        if (!meta) continue
        await writeDocFile(meta.root, meta.path, item.text)
        const record: DocRecord = {
          ...newDocRecord(meta.title, markdownToHtml(item.text), meta.root, meta.path, item.text),
          createdAt: meta.mtime,
          updatedAt: meta.mtime,
        }
        docsRef.current = [...docsRef.current, record]
        if (!firstId) firstId = record.id
        count += 1
      }
      if (!firstId) {
        pushToast('导入失败，请检查文件夹权限')
        return
      }
      setDocs(docsRef.current)
      setActiveRoot(target)
      activeIdRef.current = firstId
      pendingEditorFocus.current = true
      setActiveId(firstId)
      pushToast(`已导入 ${count} 篇文档`)
    },
    [flushSave, pushToast],
  )

  const jumpTo = useCallback(
    (item: HeadingItem) => {
      if (prefsRef.current.editorMode === 'source') {
        sourceEditorRef.current?.focusAt(item.pos)
        setActiveHeading(activeIndexFor(headingsRef.current, item.pos))
        return
      }
      editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run()
      setActiveHeading(activeIndexFor(headingsRef.current, item.pos + 1))
    },
    [editor],
  )

  /* ---------------- 全局快捷键 ---------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'F1') {
        event.preventDefault()
        setShowHelp((value) => !value)
        return
      }
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()

      if (event.key === '/') {
        event.preventDefault()
        toggleEditorMode()
      } else if (event.altKey && key === 'n') {
        event.preventDefault()
        createDoc(null)
      } else if (key === 's') {
        event.preventDefault()
        manualSave()
      } else if (event.shiftKey && event.altKey && key === 'e') {
        event.preventDefault()
        void handleExportAll()
      } else if (event.key === '\\') {
        // 折叠 / 展开侧栏
        event.preventDefault()
        setPrefs((p) => ({ ...p, sidebar: !p.sidebar }))
      } else if (event.key === ',') {
        event.preventDefault()
        setShowSettings(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [createDoc, handleExportAll, manualSave, toggleEditorMode])

  /* ---------------- 原生菜单 ---------------- */
  useEffect(() => {
    const offs = [
      onMenuAction('new-doc', () => createDoc(null)),
      onMenuAction('open-file', () => void handleOpenFile()),
      onMenuAction('export-md', () => void handleExport()),
      onMenuAction('export-zip', () => void handleExportAll()),
      onMenuAction('open-folder', () => void handleOpenFolder()),
      onMenuAction('shortcuts', () => setShowHelp(true)),
      onMenuAction('about', () => setShowAbout(true)),
    ]
    return () => offs.forEach((off) => off())
  }, [createDoc, handleExport, handleExportAll, handleOpenFile, handleOpenFolder])

  /* ---------------- 渲染 ---------------- */
  const setScrollNode = useCallback((node: HTMLDivElement | null) => {
    scrollElRef.current = node
    setScrollEl(node)
  }, [])

  const beginSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return
    event.preventDefault()
    sidebarResizeRef.current = { startX: event.clientX, startWidth: prefsRef.current.sidebarWidth }
    event.currentTarget.setPointerCapture(event.pointerId)
    setResizingSidebar(true)
  }, [])

  const resizeSidebar = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!event.currentTarget.hasPointerCapture(event.pointerId)) return
    const availableMax = Math.max(160, Math.min(420, window.innerWidth - 360))
    const next = Math.round(
      Math.min(availableMax, Math.max(160, sidebarResizeRef.current.startWidth + event.clientX - sidebarResizeRef.current.startX)),
    )
    setPrefs((current) => (current.sidebarWidth === next ? current : { ...current, sidebarWidth: next }))
  }, [])

  const endSidebarResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
    setResizingSidebar(false)
  }, [])

  const minutes = Math.max(1, Math.round(stats.words / 300))
  const sidebarVisible = prefs.sidebar
  const onDisk = Boolean(currentDoc && isOnDisk(currentDoc))
  const workspaceLabel = useMemo(
    () => (roots.length > 0 ? roots.map((r) => r.name).join(' · ') : '未打开目录'),
    [roots],
  )

  if (!booted) return <div className="boot" />

  return (
    <div
      className={
        'app'
        + (resizingSidebar ? ' is-resizing-sidebar' : '')
      }
      style={
        {
          '--sidebar-w': `${prefs.sidebarWidth}px`,
          '--editor-font-size': `${prefs.editorFontSize}px`,
        } as CSSProperties
      }
    >
      {/* 顶栏 */}
      <header className="topbar">
          <button
            type="button"
            className={'btn topbar-sidebar-toggle' + (prefs.sidebar ? ' is-active' : '')}
            title="显示或隐藏文档列表"
          onClick={() => setPrefs((p) => ({ ...p, sidebar: !p.sidebar }))}
        >
          <FolderTree size={17} strokeWidth={2} />
        </button>

        <div className="current-doc-label" title={currentDoc ? title : undefined} aria-label="当前文档">
          <span className="doc-title">{title}</span>
        </div>

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          {(!prefs.autoSave || !onDisk) && (
            <>
              <div className="divider-v" />
              <button
                type="button"
                className={'btn' + (saveState === 'dirty' ? ' is-active' : '')}
                title={onDisk ? '保存当前文档 (Ctrl/⌘ + S)' : '选择位置保存文档 (Ctrl/⌘ + S)'}
                disabled={!currentDoc || saveState === 'saving'}
                onClick={() => void manualSave()}
              >
                <Save size={17} strokeWidth={2} />
              </button>
            </>
          )}
          <div className="divider-v" />

          <button type="button" className="btn" title="设置：目录与图片的存储方式" onClick={() => setShowSettings(true)}>
            <SettingsIcon size={17} strokeWidth={2} />
          </button>
          <ThemeSwitcher theme={theme} onChange={setTheme} />
        </div>
      </header>

      <div className="body">
        {/* 左侧栏：只放文档列表 */}
        <aside className={'sidebar' + (sidebarVisible ? '' : ' is-hidden')} aria-hidden={!sidebarVisible}>
          <div className="sidebar-tabs">
            <div className="sidebar-tab is-active">
              文档
              <span className="sidebar-tab-count" title={`所有已打开目录，共 ${docs.length} 篇文档`}>
                {docs.length}
              </span>
            </div>
          </div>

          <DocsPanel
            docs={docs}
            roots={roots}
            folders={folders}
            activeId={activeId}
            editRequestId={newDocEditId}
            onSelect={switchTo}
            onCreate={createDoc}
            onCreateFolder={createFolder}
            onRenameFolder={renameFolder}
            onDeleteFolder={(root, path) => void deleteFolder(root, path)}
            onExportFolder={(root, path) => void handleExportFolder(root, path)}
            onRename={renameDoc}
            onDelete={deleteDoc}
            onDuplicate={duplicateDoc}
            onReorder={reorderDocs}
            onImportFiles={(files, root, dir) => void handleFiles(files, root, dir)}
            onDetachRoot={(root) => void detachRoot(root)}
          />

          <div
            className="sidebar-resizer"
            role="separator"
            aria-label="调整侧栏宽度"
            aria-orientation="vertical"
            aria-valuemin={160}
            aria-valuemax={420}
            aria-valuenow={prefs.sidebarWidth}
            tabIndex={0}
            title="拖拽调整侧栏宽度，双击恢复默认"
            onPointerDown={beginSidebarResize}
            onPointerMove={resizeSidebar}
            onPointerUp={endSidebarResize}
            onPointerCancel={endSidebarResize}
            onDoubleClick={() => setPrefs((p) => ({ ...p, sidebarWidth: 210 }))}
            onKeyDown={(event) => {
              if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
              event.preventDefault()
              const delta = event.key === 'ArrowLeft' ? -12 : 12
              setPrefs((p) => ({ ...p, sidebarWidth: Math.min(420, Math.max(160, p.sidebarWidth + delta)) }))
            }}
          />

        </aside>

        {/* 工作区：工具栏横跨正文和右侧大纲 */}
        <section className="workspace">
          <Toolbar
            editor={editor}
            sourceMode={prefs.editorMode === 'source'}
            outlineVisible={prefs.outlineVisible}
            onToggleSource={toggleEditorMode}
            onToggleOutline={() => setPrefs((current) => ({ ...current, outlineVisible: !current.outlineVisible }))}
            onInsertImage={() => imageRef.current?.click()}
          />
          <div className="workspace-body">
            <main className="main">
              <div className="scroll-area" ref={setScrollNode}>
                <div className={'page' + (prefs.editorMode === 'source' ? ' is-source' : '')}>
                  <div className="editor-shell">
                    {prefs.editorMode === 'source' ? (
                      <Suspense fallback={<div className="source-editor-loading">正在载入源码编辑器…</div>}>
                        <SourceEditor
                          key={activeId}
                          ref={sourceEditorRef}
                          value={currentDoc?.markdown ?? ''}
                          onChange={handleSourceChange}
                          onSelectionChange={(position) => {
                            setActiveHeading(activeIndexFor(headingsRef.current, position))
                          }}
                          onImages={(files) => void insertImages(files)}
                          onToggleMode={toggleEditorMode}
                        />
                      </Suspense>
                    ) : (
                      <>
                        <EditorContent editor={editor} />
                        <TableContextMenu editor={editor} />
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* 一篇文档都没有时盖一层，避免对着空白编辑器发呆 */}
              {docs.length === 0 && (
                <div className="empty-stage">
                  <FileText size={22} strokeWidth={1.8} />
                  <p className="empty-stage-title">这里还没有文档</p>
                </div>
              )}
            </main>

            {prefs.outlineVisible && (
              <aside className="outline-sidebar" aria-label="文档大纲侧栏">
                <Outline items={headings} activeIndex={activeHeading} onJump={jumpTo} />
              </aside>
            )}
          </div>
        </section>
      </div>

      {/* 状态栏 */}
      <footer className="statusbar">
        <span>
          字数 <b>{stats.words}</b>
        </span>
        <span className="dot" />
        <span>
          字符 <b>{stats.chars}</b>
        </span>
        <span className="dot" />
        <span>
          约 <b>{minutes}</b> 分钟读完
        </span>
        <div className="status-right">
          <span className="save-state">
            <i
              className={
                'save-dot' +
                (saveState === 'saving'
                  ? ' is-saving'
                  : saveState === 'saved'
                    ? ' is-saved'
                    : saveState === 'dirty'
                      ? ' is-dirty'
                      : '')
              }
            />
            {!onDisk
              ? '未保存到目录'
              : saveState === 'saving'
                ? '正在保存…'
                : saveState === 'saved'
                  ? '已保存到文件'
                  : saveState === 'dirty'
                    ? '有未保存更改'
                    : prefs.autoSave
                      ? '自动保存已开启'
                      : '等待手动保存'}
          </span>
          <span className="dot" />
          <span>{workspaceLabel}</span>
        </div>
      </footer>

      {draggingMarkdown && (
        <div className="markdown-drop-overlay" aria-hidden="true">
          <div>
            <FileText size={30} strokeWidth={1.7} />
            <strong>松开以打开 Markdown</strong>
            <span>将同时打开此文档所在目录</span>
          </div>
        </div>
      )}

      {/* 浮层 */}
      {prefs.editorMode === 'rich' && <BubbleBar editor={editor} scrollEl={scrollEl} />}
      {showAbout && <About onClose={() => setShowAbout(false)} />}
      {showHelp && <Shortcuts onClose={() => setShowHelp(false)} />}
      {showSettings && (
        <Settings
          prefs={prefs}
          onChange={(patch) => setPrefs((p) => ({ ...p, ...patch }))}
          theme={theme}
          onThemeChange={setTheme}
          roots={roots}
          onDetachRoot={(root) => void detachRoot(root)}
          onClose={() => setShowSettings(false)}
        />
      )}
      {showLauncher && (
        <Launcher
          last={lastRoots}
          onOpenLast={() => void finishLaunch('last')}
          onOpenFolder={() => void finishLaunch('folder')}
          onOpenFile={() => void finishLaunch('file')}
          onNewBlank={() => void finishLaunch('blank')}
        />
      )}

      <div className="toast-wrap">
        {toasts.map((t) => (
          <div className="toast" key={t.id}>
            {t.text}
          </div>
        ))}
      </div>

      <input
        ref={imageRef}
        type="file"
        accept="image/*"
        multiple
        style={{ display: 'none' }}
        onChange={(event) => {
          // 置空 value 会连带清空 FileList，先复制一份
          const files: File[] = Array.from(event.target.files ?? [])
          event.target.value = ''
          if (files.length) void insertImages(files)
        }}
      />
    </div>
  )
}
