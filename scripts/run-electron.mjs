import { spawnSync } from 'node:child_process'
import electronPath from 'electron'

/**
 * 直接跑 electron 时，如果环境里带了 ELECTRON_RUN_AS_NODE=1，
 * Electron 会退化成纯 Node 进程（require('electron') 只拿到可执行文件路径字符串），
 * 主进程一上来就崩。这里在派生前把它摘掉。
 */
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE

const args = process.argv.slice(2)
const result = spawnSync(electronPath, args, { stdio: 'inherit', env })

process.exit(result.status ?? 1)
