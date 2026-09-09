import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const tmp = os.tmpdir()
const a = path.join(tmp, 'tiptora-wsA')
const b = path.join(tmp, 'tiptora-wsB')

for (const dir of [a, b]) fs.rmSync(dir, { recursive: true, force: true })
fs.mkdirSync(a, { recursive: true })
fs.mkdirSync(b, { recursive: true })
fs.writeFileSync(path.join(a, '甲文档.md'), '# 甲目录文档\n\n甲目录的正文。\n')
fs.writeFileSync(path.join(b, '乙文档一.md'), '# 乙一\n')
fs.writeFileSync(path.join(b, '乙文档二.md'), '# 乙二\n')

const cfg = path.join(process.env.APPDATA ?? '', 'tiptora')
fs.mkdirSync(cfg, { recursive: true })
fs.writeFileSync(path.join(cfg, 'workspace.json'), JSON.stringify({ roots: [a, b] }))
console.log('wsA =', a)
console.log('wsB =', b)
console.log('config =', fs.readFileSync(path.join(cfg, 'workspace.json'), 'utf8'))
