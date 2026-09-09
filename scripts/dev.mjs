/**
 * 一条命令启动桌面版：起 vite dev server → 编译主进程 → 拉起 Electron。
 *
 *   npm run dev:all
 *   npm start          // shortcut kept for compatibility
 *
 * 关掉窗口（或 Ctrl+C）后三样一起收干净，不留后台进程。
 * 已经开着 dev server 只想重启窗口的话用 `npm run electron:dev`。
 */
import { spawn, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'vite'
import electronPath from 'electron'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const { productName } = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'))
const log = (msg) => console.log(`\x1b[36m[${productName}]\x1b[0m ${msg}`)

/** 编译 electron/ 下的主进程与 preload，并补上 CJS 标记 */
function compileMain() {
  const tsc = join(ROOT, 'node_modules', 'typescript', 'lib', 'tsc.js')
  const compiled = spawnSync(process.execPath, [tsc, '-p', 'electron/tsconfig.json'], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  if (compiled.status !== 0) return false

  const marked = spawnSync(process.execPath, [join(ROOT, 'scripts', 'electron-cjs.mjs')], {
    cwd: ROOT,
    stdio: 'inherit',
  })
  return marked.status === 0
}

let server
let electronProcess
let closing = false

async function shutdown(code) {
  if (closing) return
  closing = true
  if (electronProcess && electronProcess.exitCode === null && electronProcess.signalCode === null) {
    electronProcess.kill()
  }
  try {
    await server?.close()
  } catch {
    /* 已经关了 */
  }
  process.exit(code)
}

process.on('SIGINT', () => void shutdown(0))
process.on('SIGTERM', () => void shutdown(0))

/* ---------- 1. 渲染进程：vite dev server ---------- */
server = await createServer({
  root: ROOT,
  configFile: join(ROOT, 'vite.config.ts'),
  server: { port: 5173, strictPort: false },
})
await server.listen()

const devUrl = server.resolvedUrls?.local?.[0] ?? `http://127.0.0.1:${server.config.server.port}`
log(`dev server → ${devUrl}`)

/* ---------- 2. 主进程：tsc → dist-electron ---------- */
if (!compileMain()) {
  log('主进程编译失败')
  await shutdown(1)
}
log('主进程编译完成')

/* ---------- 3. Electron 窗口 ---------- */
// 环境里若带着 ELECTRON_RUN_AS_NODE=1，electron 会退化成纯 Node（不起窗口），必须先摘掉
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
env.VITE_DEV_URL = devUrl

log('启动 Electron…')
// 多余的参数原样透传给 Electron，比如 `npm start -- --remote-debugging-port=9222`
const extraArgs = process.argv.slice(2)
const exitCode = await new Promise((resolve) => {
  electronProcess = spawn(electronPath, [ROOT, ...extraArgs], { cwd: ROOT, stdio: 'inherit', env })
  electronProcess.once('error', (error) => {
    console.error(error)
    resolve(1)
  })
  electronProcess.once('exit', (code, signal) => resolve(code ?? (signal ? 1 : 0)))
})

await shutdown(exitCode)
