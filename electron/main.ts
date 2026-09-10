import { app, BrowserWindow, dialog, ipcMain, Menu, protocol, shell } from 'electron'
import { readFileSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, rm, rmdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve, sep } from 'node:path'

const isDev = !app.isPackaged
const packageInfo = JSON.parse(readFileSync(join(app.getAppPath(), 'package.json'), 'utf8')) as {
  name: string
  productName?: string
}
const APP_NAME = packageInfo.productName || packageInfo.name
app.setName(APP_NAME)
/** 开发态连 vite dev server，生产态读 dist 的静态产物 */
const DEV_URL = process.env.VITE_DEV_URL ?? 'http://127.0.0.1:5173'

/**
 * 自定义协议：把工作区里的图片交给渲染进程显示。
 * 用 tiptora://asset?r=<目录>&p=<相对路径> 而不是 file://，这样开发态（http 源）
 * 和生产态（file 源）都能加载，也不受 file:// 的同源限制。
 */
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'tiptora',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true, bypassCSP: true },
  },
])

let mainWindow: BrowserWindow | null = null

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 760,
    minHeight: 520,
    title: APP_NAME,
    icon: app.isPackaged ? undefined : join(process.cwd(), 'build', 'icon.ico'),
    backgroundColor: '#0f1512',
    autoHideMenuBar: false,
    show: false,
    webPreferences: {
      preload: join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  })

  mainWindow.once('ready-to-show', () => mainWindow?.show())

  // 外部链接交给系统浏览器，不要在应用内跳走
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http')) void shell.openExternal(url)
    return { action: 'deny' }
  })

  if (isDev) {
    void mainWindow.loadURL(DEV_URL)
  } else {
    void mainWindow.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  }
}

/* ============================================================
   工作区：可以同时挂载多个目录，文档就是里面的 .md 文件
   ============================================================ */

/** 当前挂载的目录（顺序即侧栏分组顺序） */
let roots: string[] = []
/** 最近使用过的目录，用于「在文件管理器中显示」 */
let activeRoot: string | null = null
/** 上次会话挂载过的目录，仅用于启动时的「打开上次」入口 */
let lastRoots: string[] = []

const configFile = (): string => join(app.getPath('userData'), 'workspace.json')

async function restoreWorkspace(): Promise<void> {
  try {
    const raw = await readFile(configFile(), 'utf8')
    const parsed = JSON.parse(raw) as { roots?: unknown }
    const list = Array.isArray(parsed.roots) ? parsed.roots.filter((x): x is string => typeof x === 'string') : []
    // 目录可能已被移动或删除，逐个校验
    const alive: string[] = []
    for (const dir of list) {
      try {
        const info = await stat(dir)
        if (info.isDirectory()) alive.push(dir)
      } catch {
        /* 失效的目录直接丢掉 */
      }
    }
    lastRoots = alive
  } catch {
    /* 第一次启动，没有记录 */
  }
}

/** 只持久化当前挂载的目录；下次启动时它就成了 lastRoots */
async function persistWorkspace(): Promise<void> {
  try {
    await mkdir(app.getPath('userData'), { recursive: true })
    await writeFile(configFile(), JSON.stringify({ roots }), 'utf8')
  } catch {
    /* 忽略 */
  }
}

function infoOf(dir: string): WorkspaceInfo {
  return { root: dir, name: basename(dir) }
}

function stateOf(): WorkspaceState {
  return {
    roots: roots.map(infoOf),
    last: lastRoots.map(infoOf),
  }
}

async function attach(dir: string): Promise<WorkspaceState> {
  try {
    const info = await stat(dir)
    if (!info.isDirectory()) return stateOf()
  } catch {
    return stateOf()
  }
  if (!roots.includes(dir)) roots = [...roots, dir]
  activeRoot = dir
  await persistWorkspace()
  return stateOf()
}

/**
 * 弹出系统目录选择框并挂载。
 * 没传父窗口也能弹（启动阶段还没有窗口）。
 */
async function pickWorkspace(win?: BrowserWindow | null): Promise<WorkspaceState | null> {
  const options: Electron.OpenDialogOptions = {
    title: '选择文档文件夹',
    properties: ['openDirectory', 'createDirectory'],
  }
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return await attach(result.filePaths[0])
}

/** 只接受相对路径，且不允许 .. 逃逸出工作区 */
function safeRel(rel: unknown): string | null {
  if (typeof rel !== 'string' || !rel.trim()) return null
  if (/^([a-zA-Z]:)?[\\/]/.test(rel)) return null
  const norm = rel.replace(/\\/g, '/').replace(/^\/+/, '')
  if (norm.split('/').some((part) => part === '..')) return null
  return norm
}

/**
 * 把「已挂载目录 + 相对路径」拼成绝对路径。
 * root 必须在 roots 里，杜绝渲染进程拿这个通道去读任意位置的文件。
 */
function absFor(root: unknown, rel: unknown): string | null {
  if (typeof root !== 'string' || !roots.includes(root)) return null
  const safe = safeRel(rel)
  if (!safe) return null
  const full = resolve(root, safe)
  if (full !== root && !full.startsWith(root + sep)) return null
  return full
}

const MD_EXT = ['.md', '.markdown']

function titleOf(fileName: string): string {
  const ext = extname(fileName).toLowerCase()
  return MD_EXT.includes(ext) ? fileName.slice(0, -ext.length) : fileName
}

/** 重名避让：name.md → name 2.md → name 3.md */
async function uniquePath(root: string, rel: string): Promise<string> {
  const ext = extname(rel)
  const base = rel.slice(0, rel.length - ext.length)
  let candidate = rel
  let i = 2
  while (true) {
    const full = absFor(root, candidate)
    if (!full) return rel
    try {
      await stat(full)
    } catch {
      return candidate
    }
    candidate = `${base} ${i}${ext}`
    i += 1
  }
}

async function toMeta(root: string, rel: string): Promise<DocFileMeta | null> {
  const full = absFor(root, rel)
  if (!full) return null
  const info = await stat(full)
  return { root, path: rel, title: titleOf(basename(rel)), mtime: info.mtimeMs, size: info.size }
}

interface FolderMeta {
  root: string
  /** 相对工作区根目录的 POSIX 风格路径 */
  path: string
  name: string
}

function skipFolder(name: string): boolean {
  const lower = name.toLowerCase()
  return name.startsWith('.') || lower === 'node_modules' || lower === 'assets' || lower.endsWith('.assets')
}

async function scanWorkspace(root: string): Promise<{ files: DocFileMeta[]; folders: FolderMeta[] }> {
  const files: DocFileMeta[] = []
  const folders: FolderMeta[] = []

  const walk = async (relDir: string): Promise<void> => {
    const dir = relDir ? absFor(root, relDir) : root
    if (!dir) return
    let entries
    try {
      entries = await readdir(dir, { withFileTypes: true })
    } catch {
      return
    }

    for (const entry of entries) {
      const rel = relDir ? `${relDir}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        if (skipFolder(entry.name)) continue
        folders.push({ root, path: rel, name: entry.name })
        await walk(rel)
      } else if (entry.isFile() && MD_EXT.includes(extname(entry.name).toLowerCase())) {
        const meta = await toMeta(root, rel)
        if (meta) files.push(meta)
      }
    }
  }

  await walk('')
  return { files, folders }
}

interface WorkspaceInfo {
  root: string
  name: string
}

interface WorkspaceState {
  roots: WorkspaceInfo[]
  last: WorkspaceInfo[]
}

interface DocFileMeta {
  /** 所属目录的绝对路径 */
  root: string
  /** 相对该目录的路径 */
  path: string
  title: string
  mtime: number
  size: number
}

const MIME: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.ico': 'image/x-icon',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.pdf': 'application/pdf',
}

/* ============================================================
   原生菜单
   ============================================================ */

function buildMenu(): Menu {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: '文件',
      submenu: [
        {
          label: '新建临时文档',
          accelerator: 'CmdOrCtrl+Alt+N',
          click: () => mainWindow?.webContents.send('menu:new-doc'),
        },
        {
          label: '打开文件…',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: () => mainWindow?.webContents.send('menu:open-file'),
        },
        {
          label: '打开目录…',
          accelerator: 'CmdOrCtrl+O',
          click: () => mainWindow?.webContents.send('menu:open-folder'),
        },
        { type: 'separator' },
        {
          label: '导出为 .md…',
          accelerator: 'CmdOrCtrl+Shift+E',
          click: () => mainWindow?.webContents.send('menu:export-md'),
        },
        {
          label: '导出全部为 ZIP…',
          accelerator: 'CmdOrCtrl+Shift+Alt+E',
          click: () => mainWindow?.webContents.send('menu:export-zip'),
        },
        { type: 'separator' },
        { role: 'quit', label: '退出' },
      ],
    },
    {
      label: '编辑',
      submenu: [
        { role: 'undo', label: '撤销' },
        { role: 'redo', label: '重做' },
        { type: 'separator' },
        { role: 'cut', label: '剪切' },
        { role: 'copy', label: '复制' },
        { role: 'paste', label: '粘贴' },
        { role: 'selectAll', label: '全选' },
      ],
    },
    {
      label: '视图',
      submenu: [
        { role: 'reload', label: '重新加载' },
        { role: 'toggleDevTools', label: '开发者工具' },
        { type: 'separator' },
        { role: 'resetZoom', label: '实际大小' },
        { role: 'zoomIn', label: '放大' },
        { role: 'zoomOut', label: '缩小' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: '全屏' },
      ],
    },
    {
      label: '帮助',
      submenu: [
        {
          label: '快捷键',
          accelerator: 'CmdOrCtrl+/',
          click: () => mainWindow?.webContents.send('menu:shortcuts'),
        },
        {
          label: `关于 ${APP_NAME}`,
          click: () => mainWindow?.webContents.send('menu:about'),
        },
      ],
    },
  ]
  return Menu.buildFromTemplate(template)
}

/* ============================================================
   IPC：原生文件保存
   ============================================================ */

type SavePayload = { suggestedName: string; content: string } | { suggestedName: string; bytes: number[] }

ipcMain.handle('save-file', async (_event, payload: SavePayload) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  if (!win) return false

  const isZip = 'bytes' in payload
  const result = await dialog.showSaveDialog(win, {
    title: isZip ? '导出全部文档' : '导出 Markdown',
    defaultPath: payload.suggestedName,
    filters: isZip
      ? [{ name: 'ZIP 压缩包', extensions: ['zip'] }]
      : [{ name: 'Markdown', extensions: ['md'] }],
  })

  if (result.canceled || !result.filePath) return false
  try {
    const data = isZip ? Buffer.from(payload.bytes) : Buffer.from(payload.content, 'utf8')
    await writeFile(result.filePath, data)
    return true
  } catch {
    return false
  }
})

ipcMain.handle('open-path', async (_event, filePath: string) => {
  await shell.openPath(filePath)
})

/* ============================================================
   IPC：工作区
   ============================================================ */

ipcMain.handle('ws:state', async () => stateOf())

ipcMain.handle('ws:open', async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  return await pickWorkspace(win)
})

ipcMain.handle('ws:openFile', async () => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  const options: Electron.OpenDialogOptions = {
    title: '打开 Markdown 文件',
    properties: ['openFile'],
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  }
  const result = win ? await dialog.showOpenDialog(win, options) : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null

  const filePath = result.filePaths[0]
  const root = dirname(filePath)
  const next = await attach(root)
  const file = await toMeta(root, basename(filePath))
  return file ? { state: next, file } : null
})

ipcMain.handle('ws:saveAs', async (_event, suggestedName: string, content: string) => {
  const win = BrowserWindow.getFocusedWindow() ?? mainWindow
  const clean = suggestedName.trim().replace(/[\\/:*?"<>|]/g, '') || '未命名文档'
  const options: Electron.SaveDialogOptions = {
    title: '保存 Markdown 文档',
    defaultPath: `${clean.replace(/\.(md|markdown)$/i, '')}.md`,
    filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
  }
  const result = win ? await dialog.showSaveDialog(win, options) : await dialog.showSaveDialog(options)
  if (result.canceled || !result.filePath) return null

  const filePath = MD_EXT.includes(extname(result.filePath).toLowerCase()) ? result.filePath : `${result.filePath}.md`
  try {
    await writeFile(filePath, content, 'utf8')
    const root = dirname(filePath)
    const next = await attach(root)
    const file = await toMeta(root, basename(filePath))
    return file ? { state: next, file } : null
  } catch {
    return null
  }
})

ipcMain.handle('ws:attach', async (_event, root: string) => await attach(root))

ipcMain.handle('ws:detach', async (_event, root: string) => {
  roots = roots.filter((r) => r !== root)
  if (activeRoot === root) activeRoot = roots[0] ?? null
  await persistWorkspace()
  return stateOf()
})

ipcMain.handle('ws:list', async () => {
  const metas: DocFileMeta[] = []
  for (const root of roots) {
    const batch = (await scanWorkspace(root)).files
    batch.sort((a, b) => a.title.localeCompare(b.title, 'zh-Hans-CN'))
    metas.push(...batch)
  }
  return metas
})

ipcMain.handle('ws:folders', async () => {
  const list: FolderMeta[] = []
  for (const root of roots) list.push(...(await scanWorkspace(root)).folders)
  return list
})

ipcMain.handle('ws:read', async (_event, root: string, rel: string) => {
  const full = absFor(root, rel)
  if (!full) return ''
  try {
    return await readFile(full, 'utf8')
  } catch {
    return ''
  }
})

ipcMain.handle('ws:write', async (_event, root: string, rel: string, content: string) => {
  const full = absFor(root, rel)
  if (!full) return false
  try {
    activeRoot = root
    await writeFile(full, content, 'utf8')
    return true
  } catch {
    return false
  }
})

ipcMain.handle('ws:create', async (_event, root: string, title: string, dir = '') => {
  if (!roots.includes(root)) return null
  const parent = dir ? safeRel(dir) : ''
  if (dir && !parent) return null
  const want = `${parent ? `${parent}/` : ''}${title.trim() || '未命名文档'}.md`
  const rel = await uniquePath(root, want)
  const full = absFor(root, rel)
  if (!full) return null
  try {
    activeRoot = root
    await writeFile(full, '', 'utf8')
    return await toMeta(root, rel)
  } catch {
    return null
  }
})

ipcMain.handle('ws:createFolder', async (_event, root: string, parent: string, rawName: string) => {
  if (!roots.includes(root)) return null
  const safeParent = parent ? safeRel(parent) : ''
  if (parent && !safeParent) return null
  const clean = rawName.trim().replace(/[\\/:*?"<>|]/g, '').replace(/^\.+$/, '') || '新建文件夹'
  const base = `${safeParent ? `${safeParent}/` : ''}${clean}`
  let rel = base
  let index = 2
  while (true) {
    const full = absFor(root, rel)
    if (!full) return null
    try {
      await stat(full)
      rel = `${base} ${index}`
      index += 1
    } catch {
      try {
        await mkdir(full)
        return { root, path: rel, name: basename(rel) } satisfies FolderMeta
      } catch {
        return null
      }
    }
  }
})

ipcMain.handle('ws:removeFolder', async (_event, root: string, rel: string) => {
  if (!roots.includes(root)) return 'invalid'
  const safe = safeRel(rel)
  if (!safe) return 'invalid'
  const full = absFor(root, safe)
  if (!full) return 'invalid'

  try {
    const entries = await readdir(full, { withFileTypes: true })
    if (entries.some((entry) => entry.isDirectory())) return 'has-subfolders'
    if (entries.some((entry) => !entry.isFile() || !MD_EXT.includes(extname(entry.name).toLowerCase()))) {
      return 'has-other-files'
    }

    // 逐个删除已确认的 Markdown 文件，再删除空目录；避免递归删除误伤随后出现的内容。
    for (const entry of entries) {
      const file = absFor(root, `${safe}/${entry.name}`)
      if (!file) return 'invalid'
      await rm(file)
    }
    await rmdir(full)
    return 'removed'
  } catch {
    return 'failed'
  }
})

ipcMain.handle('ws:rename', async (_event, root: string, from: string, to: string) => {
  if (!roots.includes(root)) return null
  const src = absFor(root, from)
  if (!src) return null

  const ext = extname(from).toLowerCase()
  const clean = (to || '').trim().replace(/[\\/:*?"<>|]/g, '') || '未命名文档'
  const slash = from.lastIndexOf('/')
  const parent = slash >= 0 ? from.slice(0, slash + 1) : ''
  const want = parent + (MD_EXT.includes(ext) ? `${clean}${ext}` : `${clean}.md`)
  const rel = want === from ? from : await uniquePath(root, want)
  const dst = absFor(root, rel)
  if (!dst) return null

  try {
    if (rel !== from) await rename(src, dst)
    // 顺带把「文档名.assets」资源目录一起改名，避免引用断掉
    const oldAssets = absFor(root, `${parent}${titleOf(basename(from))}.assets`)
    if (oldAssets) {
      try {
        await stat(oldAssets)
        const newAssets = absFor(root, `${parent}${titleOf(basename(rel))}.assets`)
        if (newAssets && newAssets !== oldAssets) await rename(oldAssets, newAssets)
      } catch {
        /* 没有资源目录就跳过 */
      }
    }
    activeRoot = root
    return await toMeta(root, rel)
  } catch {
    return null
  }
})

ipcMain.handle('ws:remove', async (_event, root: string, rel: string) => {
  const full = absFor(root, rel)
  if (!full) return false
  try {
    await rm(full, { force: true })
    // 只删「文档名.assets」这种专属目录，共享的 assets/ 不动
    const slash = rel.lastIndexOf('/')
    const parent = slash >= 0 ? rel.slice(0, slash + 1) : ''
    const assets = absFor(root, `${parent}${titleOf(basename(rel))}.assets`)
    if (assets) await rm(assets, { recursive: true, force: true })
    return true
  } catch {
    return false
  }
})

ipcMain.handle('ws:writeAsset', async (_event, root: string, rel: string, bytes: Uint8Array) => {
  if (!roots.includes(root)) return null
  const want = safeRel(rel)
  if (!want) return null
  const finalRel = await uniquePath(root, want)
  const full = absFor(root, finalRel)
  if (!full) return null
  try {
    activeRoot = root
    await mkdir(resolve(full, '..'), { recursive: true })
    await writeFile(full, Buffer.from(bytes))
    return finalRel
  } catch {
    return null
  }
})

ipcMain.handle('ws:readAsset', async (_event, root: string, rel: string) => {
  const full = absFor(root, rel)
  if (!full) return null
  try {
    const buf = await readFile(full)
    return new Uint8Array(buf)
  } catch {
    return null
  }
})

ipcMain.on('ws:reveal', (_event, root: string, rel: string) => {
  const full = absFor(root, rel)
  if (!full) return
  shell.showItemInFolder(full)
})

ipcMain.on('ws:revealFolder', (_event, root: string, rel: string) => {
  if (!roots.includes(root)) return
  const full = rel ? absFor(root, rel) : root
  if (full) void shell.openPath(full)
})

const draftFiles = new Map<string, string>()

function draftsDir(): string {
  return join(app.getPath('temp'), APP_NAME, 'drafts')
}

function draftPath(title: string): string {
  const safe = title.trim().replace(/[\\/:*?"<>|]/g, '') || '未命名文档'
  return join(draftsDir(), `${safe}.md`)
}

ipcMain.handle('draft:list', async () => {
  try {
    const currentDir = draftsDir()
    const legacyDirs = [
      join(app.getPath('temp'), 'Mdit', 'drafts'),
      join(app.getPath('temp'), 'Jianmo', 'drafts'),
      join(app.getPath('temp'), 'Tiptora', 'drafts'),
    ]
    await mkdir(currentDir, { recursive: true })
    const drafts: Array<{ id: string; title: string; content: string; mtime: number }> = []
    const seenTitles = new Set<string>()

    for (const dir of [currentDir, ...legacyDirs]) {
      let entries
      try {
        entries = await readdir(dir, { withFileTypes: true })
      } catch {
        continue
      }
      for (const entry of entries) {
        if (!entry.isFile() || !/\.md$/i.test(entry.name)) continue
        const title = basename(entry.name, extname(entry.name))
        if (seenTitles.has(title)) continue
        const file = join(dir, entry.name)
        const known = [...draftFiles.entries()].find(([, knownFile]) => knownFile === file)?.[0]
        const id = known ?? `draft:${encodeURIComponent(entry.name)}`
        const [content, info] = await Promise.all([readFile(file, 'utf8'), stat(file)])
        draftFiles.set(id, file)
        drafts.push({ id, title, content, mtime: info.mtimeMs })
        seenTitles.add(title)
      }
    }

    return drafts.sort((a, b) => a.mtime - b.mtime)
  } catch {
    return []
  }
})

ipcMain.handle('draft:write', async (_event, id: string, title: string, content: string) => {
  try {
    const file = draftPath(title)
    const previous = draftFiles.get(id)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, content, 'utf8')
    if (previous && previous !== file) await rm(previous, { force: true })
    draftFiles.set(id, file)
    return file
  } catch {
    return null
  }
})

ipcMain.handle('draft:remove', async (_event, id: string) => {
  try {
    const file = draftFiles.get(id)
    if (file) await rm(file, { force: true })
    draftFiles.delete(id)
    return true
  } catch {
    return false
  }
})

ipcMain.on('draft:reveal', (_event, id: string) => {
  const file = draftFiles.get(id)
  if (file) shell.showItemInFolder(file)
})

/* ============================================================
   生命周期
   ============================================================ */

const gotLock = app.requestSingleInstanceLock()
if (!gotLock) {
  app.quit()
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore()
      mainWindow.focus()
    }
  })

  void app.whenReady().then(async () => {
    await restoreWorkspace()

    protocol.handle('tiptora', async (request) => {
      try {
        const url = new URL(request.url)
        const root = url.searchParams.get('r') ?? ''
        const rel = url.searchParams.get('p') ?? ''
        const full = absFor(root, rel)
        if (!full) return new Response('Not found', { status: 404 })
        const data = await readFile(full)
        const type = MIME[extname(full).toLowerCase()] ?? 'application/octet-stream'
        return new Response(new Uint8Array(data), { status: 200, headers: { 'Content-Type': type } })
      } catch {
        return new Response('Error', { status: 500 })
      }
    })

    Menu.setApplicationMenu(buildMenu())
    createWindow()

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow()
    })
  })
}

app.on('window-all-closed', () => {
  // macOS 上关闭窗口不退出应用
  if (process.platform !== 'darwin') app.quit()
})
