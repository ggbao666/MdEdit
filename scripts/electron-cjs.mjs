import { mkdirSync, writeFileSync } from 'node:fs'

/**
 * 项目根 package.json 是 "type": "module"（Vite 需要），
 * 而 Electron 主进程被 tsc 编译成 CommonJS —— 直接跑会报
 * "exports is not defined in ES module scope"。
 * 在产物目录放一个 package.json 把它标记为 CJS 即可。
 */
mkdirSync('dist-electron', { recursive: true })
writeFileSync('dist-electron/package.json', JSON.stringify({ type: 'commonjs' }, null, 2) + '\n')
console.log('dist-electron/package.json → { "type": "commonjs" }')
