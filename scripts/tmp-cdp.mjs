import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const PORT = 9446
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const tmp = os.tmpdir()
const wsA = path.join(tmp, 'tiptora-wsA')
const wsB = path.join(tmp, 'tiptora-wsB')

let target
for (let i = 0; i < 40; i += 1) {
  try {
    const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
    target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
    if (target) break
  } catch {}
  await sleep(500)
}
if (!target) {
  console.log('NO_TARGET')
  process.exit(1)
}

console.log('target =', target.url)
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
})
console.log('ws open, readyState =', ws.readyState)
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.exceptionThrown') {
    console.log('[throw]', (m.params.exceptionDetails?.exception?.description ?? m.params.exceptionDetails?.text ?? '').slice(0, 400))
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)
    if (!text.includes('Electron Security Warning')) console.log('[console]', text)
  }
})
let id = 0
const send = (method, params = {}) =>
  new Promise((res) => {
    id += 1
    const cur = id
    ws.addEventListener('message', function on(ev) {
      const m = JSON.parse(ev.data)
      if (m.id === cur) {
        ws.removeEventListener('message', on)
        res(m.result)
      }
    })
    ws.send(JSON.stringify({ id: cur, method, params }))
  })

await send('Runtime.enable')

const evaluate = async (expression) => {
  const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  return out?.result?.value
}

const results = []
const ok = (name, pass, detail = '') => {
  results.push({ name, pass, detail })
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? '  → ' + detail : ''}`)
}

/* ---------- 阶段一：启动面板 ---------- */
/* ---------- 阶段零：把启动偏好重置为「询问」并重载 ---------- */
await evaluate(`(() => { localStorage.removeItem('tiptora:prefs'); return 1 })()`)
await send('Page.reload')
await sleep(1200)

await sleep(2500)
for (let i = 0; i < 30; i += 1) {
  const probe = await evaluate(`JSON.stringify({ app: !!document.querySelector('.app'), launcher: !!document.querySelector('.launcher'), body: document.body.innerHTML.length })`)
  console.log('probe', i, probe)
  if (probe && probe.includes('"app":true')) break
  await sleep(800)
}

let snap = JSON.parse(
  await evaluate(`JSON.stringify({
    launcher: !!document.querySelector('.launcher'),
    app: !!document.querySelector('.app'),
    lastText: document.querySelector('.launcher-main-text')?.textContent ?? null,
    groups: Array.from(document.querySelectorAll('.docgroup-name')).map(e => e.textContent),
  })`),
)
ok('启动不强制选目录，直接进界面', snap.app === true)
ok('有上次目录时弹出启动面板', snap.launcher === true)
ok('面板显示上次目录', /打开上次的目录/.test(snap.lastText ?? ''), snap.lastText)

/* ---------- 阶段二：打开上次的目录 ---------- */
await evaluate(`document.querySelector('.launcher-main').click(); return 1`)
await evaluate(`(async () => {
  for (let i = 0; i < 60; i++) {
    if (document.querySelectorAll('.docgroup').length >= 2) break
    await new Promise(r => setTimeout(r, 200))
  }
  return 1
})()`)

snap = JSON.parse(
  await evaluate(`JSON.stringify({
    groups: Array.from(document.querySelectorAll('.docgroup')).map(g => ({
      name: g.querySelector('.docgroup-name')?.textContent,
      count: g.querySelectorAll('.doclist-item').length,
      files: Array.from(g.querySelectorAll('.doclist-title')).map(e => e.textContent),
    })),
    status: document.querySelector('.status-right')?.textContent ?? '',
    itemHeight: document.querySelector('.doclist-item')?.getBoundingClientRect().height ?? 0,
    hasMeta: !!document.querySelector('.doclist-meta'),
  })`),
)
ok('侧栏按目录分组显示', snap.groups.length === 2, JSON.stringify(snap.groups.map((g) => g.name)))
ok('甲目录 1 篇', snap.groups[0]?.files.join(',') === '甲文档', JSON.stringify(snap.groups[0]?.files))
ok('乙目录 2 篇', snap.groups[1]?.files.join(',') === '乙文档一,乙文档二', JSON.stringify(snap.groups[1]?.files))
ok('状态栏显示两个目录名', /tiptora-wsA/.test(snap.status) && /tiptora-wsB/.test(snap.status), snap.status)
ok('列表项紧凑（单行高度 ≤ 34px）', snap.itemHeight > 0 && snap.itemHeight <= 34, `${snap.itemHeight}px`)
ok('不再显示摘要/时间等次要信息', snap.hasMeta === false)

/* ---------- 阶段三：在指定目录里新建文件 ---------- */
await evaluate(`document.querySelectorAll('.docgroup')[0].querySelector('.docgroup-actions button').click(); return 1`)
await sleep(1200)
const created = fs.readdirSync(wsA).filter((f) => f.endsWith('.md'))
ok('在甲目录新建文件落盘', created.length === 2 && created.some((f) => f.startsWith('未命名文档')), created.join(','))

/* ---------- 阶段四：切换文档 ---------- */
await evaluate(`document.querySelectorAll('.docgroup')[1].querySelectorAll('.doclist-item')[1].click(); return 1`)
await sleep(900)
const afterSwitch = JSON.parse(
  await evaluate(`JSON.stringify({
    title: document.querySelector('.doc-title')?.value,
    text: document.querySelector('.tiptap')?.textContent ?? '',
  })`),
)
ok('点击乙目录第二篇可切换', afterSwitch.title === '乙文档二', JSON.stringify(afterSwitch))

/* ---------- 阶段五：改成空白启动后重载 ---------- */
await evaluate(`(() => {
  const p = JSON.parse(localStorage.getItem('tiptora:prefs') ?? '{}')
  p.startup = 'none'
  localStorage.setItem('tiptora:prefs', JSON.stringify(p))
  return 1
})()`)
await send('Page.reload')
await sleep(1500)
await evaluate(`(async () => {
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('.app')) break
    await new Promise(r => setTimeout(r, 200))
  }
  await new Promise(r => setTimeout(r, 800))
  return 1
})()`)

snap = JSON.parse(
  await evaluate(`JSON.stringify({
    launcher: !!document.querySelector('.launcher'),
    app: !!document.querySelector('.app'),
    groups: Array.from(document.querySelectorAll('.docgroup-name')).map(e => e.textContent),
    items: Array.from(document.querySelectorAll('.doclist-title')).map(e => e.textContent),
    status: document.querySelector('.status-right')?.textContent ?? '',
  })`),
)
ok('空白启动不再弹面板，直接进界面', snap.app === true && snap.launcher === false)
ok('没有目录时给出可编辑的空白文档', snap.items.length === 1 && snap.items[0] === '未命名文档', JSON.stringify(snap))
ok('内存文档分组名为「未保存」', snap.groups[0] === '未保存', JSON.stringify(snap.groups))
ok('状态栏提示未保存到目录', /未保存到目录/.test(snap.status), snap.status)

/* ---------- 阶段六：进入后挂载目录 ---------- */
await evaluate(`(async () => {
  await window.tiptora.workspace.attach(${JSON.stringify(wsB)})
  return 1
})()`)
await evaluate(`(async () => { location.reload(); return 1 })()`)
await sleep(1800)
await evaluate(`(async () => {
  for (let i = 0; i < 60; i++) {
    if (document.querySelector('.app')) break
    await new Promise(r => setTimeout(r, 200))
  }
  await new Promise(r => setTimeout(r, 800))
  return 1
})()`)
snap = JSON.parse(
  await evaluate(`JSON.stringify({
    groups: Array.from(document.querySelectorAll('.docgroup-name')).map(e => e.textContent),
    files: Array.from(document.querySelectorAll('.doclist-title')).map(e => e.textContent),
  })`),
)
ok('挂载目录后侧栏出现该目录', snap.groups.includes('tiptora-wsB'), JSON.stringify(snap))
ok('文档来自该目录', snap.files.includes('乙文档一'), JSON.stringify(snap.files))

const failed = results.filter((r) => !r.pass)
console.log(`\n===== ${results.length - failed.length}/${results.length} PASS =====`)
ws.close()
if (failed.length) process.exitCode = 1
