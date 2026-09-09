import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import type { Editor } from '@tiptap/react'
import {
  Copy,
  Download,
  FileText,
  Focus as FocusIcon,
  Keyboard,
  Moon,
  MoveVertical,
  PanelLeft,
  Save,
  Settings as SettingsIcon,
  Sun,
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
import Toolbar from './components/Toolbar'
import appIcon from './assets/mdedit-icon-offset.svg'
import { APP_NAME, APP_SLUG } from './config/app'
import { applyTheme, DEFAULT_DARK_THEME, THEMES, type Theme } from './config/themes'
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
  openWorkspace,
  readDocFile,
  removeDraftFile,
  removeDocFile,
  renameDocFile,
  saveDocAs,
  setActiveRoot,
  writeAssetFile,
  writeDraftFile,
  writeDocFile,
  type FolderMeta,
  type WorkspaceInfo,
} from './lib/workspace'
import {
  createDoc as newDocRecord,
  createMemoryDoc,
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

function uniqueTemporaryTitle(docs: readonly DocRecord[], base = '未命名文档'): string {
  const used = new Set(docs.filter((doc) => !isOnDisk(doc)).map((doc) => doc.title))
  if (!used.has(base)) return base
  let index = 2
  while (used.has(`${base} ${index}`)) index += 1
  return `${base} ${index}`
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

  /* ---------------- 引用 ---------------- */
  const scrollElRef = useRef<HTMLDivElement | null>(null)
  const titleInputRef = useRef<HTMLInputElement>(null)
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
  /** 编辑器重建后是否要把焦点交给标题输入框（新建 / 导入文档时） */
  const pendingTitleFocus = useRef(false)
  /** 编辑器重建后是否聚焦到正文开头（切换 / 删除 / 副本文档时） */
  const pendingEditorFocus = useRef(false)
  /** StrictMode 会重复执行首次副作用，避免欢迎文档被第二篇空文档覆盖。 */
  const initialDocumentCreated = useRef(false)

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

  function applyTypewriter(ed: Editor) {
    if (!prefsRef.current.typewriter) return
    const el = scrollElRef.current
    if (!el) return
    const { view } = ed
    if (!view.hasFocus()) return

    let top: number
    try {
      top = view.coordsAtPos(view.state.selection.from).top
    } catch {
      return
    }
    const box = el.getBoundingClientRect()
    const delta = top - (box.top + box.height * 0.4)
    if (Math.abs(delta) > 2) el.scrollTop += delta
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
        const html = markdownToHtml(await readDocFile(file.root, file.path))
        records.push({
          ...newDocRecord(file.title, html, file.root, file.path),
          createdAt: file.mtime,
          updatedAt: file.mtime,
        })
      }
    }

    dirtyIdsRef.current.clear()
    setSaveState('idle')
    setFolders(nextFolders)
    const nextDocs = [...records, ...temporary]
    docsRef.current = nextDocs
    setDocs(nextDocs)

    const wanted = nextDocs.find((d) => d.id === preferId) ?? nextDocs.find((d) => d.id === activeIdRef.current) ?? nextDocs[0]
    activeIdRef.current = wanted?.id ?? ''
    setActiveId(wanted?.id ?? '')
    setActiveRoot(wanted?.root ?? null)
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

  /** 把 HTML 写进指定文档（同步更新 ref，供后续同步落盘） */
  const commitHtml = useCallback((id: string, html: string) => {
    const next = docsRef.current.map((d) => (d.id === id ? touchDoc(d, { html }) : d))
    docsRef.current = next
    setDocs(next)
  }, [])

  /**
   * 把当前文档序列化成 Markdown 写回磁盘。
   * 标题和文件名不一致时先改名（重命名也会顺带带走「文档名.assets」资源目录）。
   */
  const persistToDisk = useCallback(async (ed: Editor) => {
    const id = activeIdRef.current
    const doc = docsRef.current.find((d) => d.id === id)
    if (!doc || !isOnDisk(doc)) return false

    let path = doc.path
    let savedId = id
    const root = doc.root
    const markdown = docToMarkdown(ed.getJSON())
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

  /** 立即同步编辑器内容；自动保存开启或显式传 true 时才写回磁盘 */
  const flushSave = useCallback((forcePersist = prefsRef.current.autoSave) => {
    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    const ed = editorRef.current
    if (!ed || ed.isDestroyed) return
    const id = activeIdRef.current
    commitHtml(id, ed.getHTML())
    const doc = docsRef.current.find((d) => d.id === id)
    if (doc && isOnDisk(doc) && forcePersist) void persistToDisk(ed)
    else if (doc && !isOnDisk(doc)) {
      void writeDraftFile(id, doc.title, docToMarkdown(ed.getJSON())).then(() => {
        if (activeIdRef.current === id) setSaveState('dirty')
      })
    }
  }, [commitHtml, persistToDisk])

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
    const doc = docsRef.current.find((d) => d.id === activeIdRef.current)
    const ed = editorRef.current
    if (!doc || !ed || ed.isDestroyed) return
    if (isOnDisk(doc)) {
      flushSave(true)
      pushToast('已保存')
      return
    }

    if (saveTimer.current !== null) {
      window.clearTimeout(saveTimer.current)
      saveTimer.current = null
    }
    commitHtml(doc.id, ed.getHTML())
    setSaveState('saving')
    const saved = await saveDocAs(safeFileName(doc.title), docToMarkdown(ed.getJSON()))
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

  /**
   * 插入图片。
   * 「原图」策略：把原图字节写进资源目录，节点只记相对引用；
   * 「内联」策略：把原图转成 base64 直接嵌进文档。
   */
  const insertImages = useCallback(
    async (files: File[]) => {
      const ed = editorRef.current
      if (!ed || ed.isDestroyed || files.length === 0) return

      const target = currentDoc?.root || null
      const toDisk = prefs.imageMode === 'file' && Boolean(target)
      let inserted = 0

      for (const file of files) {
        try {
          if (toDisk && target) {
            const bytes = await fileToBytes(file)
            const name = assetFileName(file.name, file.type)
            const want = assetRelPath(resolveAssetDir(prefs.assetDir, titleRef.current), name)
            const saved = await writeAssetFile(target, want, bytes)
            if (!saved) continue
            ed.chain().focus().insertImage({ rel: saved, alt: name }).run()
          } else {
            const dataUrl = await fileToDataUrl(file)
            ed.chain().focus().insertImage({ rel: dataUrl, alt: file.name }).run()
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
      pushToast(toDisk ? `已插入 ${inserted} 张原图到资源目录` : `已内联插入 ${inserted} 张图片`)
      scheduleSave()
    },
    [currentDoc?.root, prefs.imageMode, prefs.assetDir, pushToast, scheduleSave],
  )

  /* ---------------- 编辑器实例 ----------------
     deps = [activeId, booted]：切换文档时销毁重建，
     顺带清空 undo 历史，避免 Ctrl+Z 把上一篇的内容恢复出来。 */
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
        refreshAll(ed)
        scheduleSave()
      },
      onSelectionUpdate: ({ editor: ed }) => {
        syncActive(ed)
        applyTypewriter(ed)
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
    refreshAll(editor)

    if (pendingTitleFocus.current) {
      pendingTitleFocus.current = false
      titleInputRef.current?.focus()
      titleInputRef.current?.select()
    } else if (pendingEditorFocus.current) {
      pendingEditorFocus.current = false
      editor.commands.focus('start')
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor])

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
        const record = createMemoryDoc(file.title, markdownToHtml(file.content))
        return { ...record, id: file.id, createdAt: file.mtime, updatedAt: file.mtime }
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
      setPrefs((p) => (p.panel === 'docs' ? p : { ...p, panel: 'docs' }))

      const target = wantRoot

      if (!target) {
        const doc = createMemoryDoc(uniqueTemporaryTitle(docsRef.current), '<p></p>')
        docsRef.current = [...docsRef.current, doc]
        setDocs(docsRef.current)
        activeIdRef.current = doc.id
        setActiveId(doc.id)
        setSaveState('idle')
        void writeDraftFile(doc.id, doc.title, '')
        pendingTitleFocus.current = true
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
          ...newDocRecord(meta.title, '<p></p>', meta.root, meta.path),
          createdAt: meta.mtime,
          updatedAt: meta.mtime,
        }
        docsRef.current = [...docsRef.current, record]
        setDocs(docsRef.current)
        setActiveRoot(meta.root)
        activeIdRef.current = record.id
        setActiveId(record.id)
        setSaveState('idle')
        pendingTitleFocus.current = true
        pushToast('已新建文档')
      })()
    },
    [flushSave, pushToast],
  )

  const createFolder = useCallback(
    async (root: string, parent: string, name: string) => {
      const folder = await createWorkspaceFolder(root, parent, name)
      if (!folder) {
        pushToast('新建文件夹失败，请检查名称或目录权限')
        return
      }
      setFolders((prev) => [...prev.filter((item) => !(item.root === folder.root && item.path === folder.path)), folder])
      pushToast(`已新建文件夹「${folder.name}」`)
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
      void writeDraftFile(target.id, target.title, htmlToMarkdown(target.html))
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
      const src = docsRef.current.find((d) => d.id === id)
      if (!src) return
      flushSave()

      if (!isOnDisk(src)) {
        const copy = createMemoryDoc(uniqueTemporaryTitle(docsRef.current, `${src.title} 副本`), src.html)
        docsRef.current = [...docsRef.current, copy]
        setDocs(docsRef.current)
        activeIdRef.current = copy.id
        setActiveId(copy.id)
        setSaveState('idle')
        void writeDraftFile(copy.id, copy.title, htmlToMarkdown(copy.html))
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
        await writeDocFile(meta.root, meta.path, htmlToMarkdown(src.html))
        const record: DocRecord = {
          ...newDocRecord(meta.title, src.html, meta.root, meta.path),
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
    const md = docToMarkdown(editor.getJSON())
    const name = `${safeFileName(titleRef.current)}.md`
    if (await saveTextNative(name, md)) pushToast('已导出 Markdown 文件')
  }, [editor, pushToast])

  const handleCopyMd = useCallback(async () => {
    const md = docToMarkdown(editor.getJSON())
    let ok = false
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(md)
        ok = true
      }
    } catch {
      ok = false
    }
    pushToast(ok ? 'Markdown 已复制到剪贴板' : '复制失败')
  }, [editor, pushToast])

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
          ...newDocRecord(meta.title, markdownToHtml(item.text), meta.root, meta.path),
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
      editor.chain().focus().setTextSelection(item.pos + 1).scrollIntoView().run()
      setActiveHeading(activeIndexFor(headingsRef.current, item.pos + 1))
    },
    [editor],
  )

  /* ---------------- 全局快捷键 ---------------- */
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const mod = event.metaKey || event.ctrlKey
      if (!mod) return
      const key = event.key.toLowerCase()

      if (event.key === '/') {
        event.preventDefault()
        setShowHelp((v) => !v)
      } else if (event.altKey && key === 'n') {
        event.preventDefault()
        createDoc(null)
      } else if (key === 's') {
        event.preventDefault()
        manualSave()
      } else if (event.shiftKey && event.altKey && key === 'e') {
        // 必须在 Shift+E 之前判断，否则会被上面的分支吃掉
        event.preventDefault()
        void handleExportAll()
      } else if (event.shiftKey && key === 'e') {
        event.preventDefault()
        void handleExport()
      } else if (event.shiftKey && key === 'c') {
        event.preventDefault()
        void handleCopyMd()
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
  }, [createDoc, handleExport, handleExportAll, handleCopyMd, manualSave])

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

  const minutes = Math.max(1, Math.round(stats.words / 300))
  const sidebarVisible = prefs.sidebar && !prefs.focus
  const onDisk = Boolean(currentDoc && isOnDisk(currentDoc))
  const workspaceLabel = useMemo(
    () => (roots.length > 0 ? roots.map((r) => r.name).join(' · ') : '未打开目录'),
    [roots],
  )

  if (!booted) return <div className="boot" />

  return (
    <div className={'app' + (prefs.focus ? ' is-focus' : '')}>
      {/* 顶栏 */}
      <header className="topbar">
        <div className="brand">
          <img className="brand-logo" src={appIcon} alt="" />
          <span className="brand-name">{APP_NAME}</span>
        </div>

        <input
          ref={titleInputRef}
          className="doc-title"
          value={title}
          placeholder="未命名文档"
          aria-label="文档标题"
          onChange={(e) => {
            const next = e.target.value
            const id = activeIdRef.current
            const nextDocs = docsRef.current.map((d) => (d.id === id ? { ...d, title: next } : d))
            docsRef.current = nextDocs
            setDocs(nextDocs)
            scheduleSave()
          }}
        />

        <div className="topbar-spacer" />

        <div className="topbar-actions">
          <button
            type="button"
            className={'btn' + (prefs.sidebar ? ' is-active' : '')}
            title="侧栏：文档列表与大纲"
            onClick={() => setPrefs((p) => ({ ...p, sidebar: !p.sidebar }))}
          >
            <PanelLeft size={17} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={'btn' + (prefs.focus ? ' is-active' : '')}
            title="专注模式：隐藏一切干扰，只高亮当前段落"
            onClick={() => setPrefs((p) => ({ ...p, focus: !p.focus }))}
          >
            <FocusIcon size={17} strokeWidth={2} />
          </button>
          <button
            type="button"
            className={'btn' + (prefs.typewriter ? ' is-active' : '')}
            title="打字机模式：光标始终保持在视线上方 2/5 处"
            onClick={() => setPrefs((p) => ({ ...p, typewriter: !p.typewriter }))}
          >
            <MoveVertical size={17} strokeWidth={2} />
          </button>

          <div className="divider-v" />

          {(!prefs.autoSave || !onDisk) && (
            <button
              type="button"
              className={'btn' + (saveState === 'dirty' ? ' is-active' : '')}
              title={onDisk ? '保存当前文档 (Ctrl/⌘ + S)' : '选择位置保存文档 (Ctrl/⌘ + S)'}
              disabled={!currentDoc || saveState === 'saving'}
              onClick={() => void manualSave()}
            >
              <Save size={17} strokeWidth={2} />
            </button>
          )}
          <button type="button" className="btn" title="导出当前文档为 .md (Ctrl/⌘ + Shift + E)" onClick={() => void handleExport()}>
            <Download size={17} strokeWidth={2} />
          </button>
          <button type="button" className="btn" title="复制当前文档的 Markdown (Ctrl/⌘ + Shift + C)" onClick={() => void handleCopyMd()}>
            <Copy size={17} strokeWidth={2} />
          </button>
          <div className="divider-v" />

          <button type="button" className="btn" title="设置：目录与图片的存储方式" onClick={() => setShowSettings(true)}>
            <SettingsIcon size={17} strokeWidth={2} />
          </button>
          <button type="button" className="btn" title="快捷键 (Ctrl/⌘ + /)" onClick={() => setShowHelp(true)}>
            <Keyboard size={17} strokeWidth={2} />
          </button>
          <button
            type="button"
            className="btn"
            title={THEMES[theme].appearance === 'light' ? '切换为极简深色' : '切换为亮色'}
            onClick={() => setTheme((current) => (THEMES[current].appearance === 'light' ? DEFAULT_DARK_THEME : 'light'))}
          >
            {THEMES[theme].appearance === 'light' ? <Moon size={17} strokeWidth={2} /> : <Sun size={17} strokeWidth={2} />}
          </button>
        </div>
      </header>

      <div className="body">
        {/* 侧栏：文档列表 / 大纲 */}
        <aside className={'sidebar' + (sidebarVisible ? '' : ' is-hidden')} aria-hidden={!sidebarVisible}>
          <div className="sidebar-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={prefs.panel === 'docs'}
              className={'sidebar-tab' + (prefs.panel === 'docs' ? ' is-active' : '')}
              onClick={() => setPrefs((p) => ({ ...p, panel: 'docs' }))}
            >
              文档
              <span className="sidebar-tab-count" title={`所有已打开目录，共 ${docs.length} 篇文档`}>
                {docs.length}
              </span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={prefs.panel === 'outline'}
              className={'sidebar-tab' + (prefs.panel === 'outline' ? ' is-active' : '')}
              onClick={() => setPrefs((p) => ({ ...p, panel: 'outline' }))}
            >
              大纲
            </button>
          </div>

          {prefs.panel === 'docs' ? (
            <DocsPanel
              docs={docs}
              roots={roots}
              folders={folders}
              activeId={activeId}
              onSelect={switchTo}
              onCreate={createDoc}
              onCreateFolder={(root, parent, name) => void createFolder(root, parent, name)}
              onExportFolder={(root, path) => void handleExportFolder(root, path)}
              onRename={renameDoc}
              onDelete={deleteDoc}
              onDuplicate={duplicateDoc}
              onReorder={reorderDocs}
              onImportFiles={(files, root, dir) => void handleFiles(files, root, dir)}
              onDetachRoot={(root) => void detachRoot(root)}
            />
          ) : (
            <Outline items={headings} activeIndex={activeHeading} onJump={jumpTo} />
          )}

        </aside>

        {/* 主编辑区 */}
        <main className="main">
          {!prefs.focus && <Toolbar editor={editor} onInsertImage={() => imageRef.current?.click()} />}
          <div className="scroll-area" ref={setScrollNode}>
            <div className="page">
              <div className="editor-shell">
                <EditorContent editor={editor} />
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

      {/* 浮层 */}
      <BubbleBar editor={editor} scrollEl={scrollEl} />
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
