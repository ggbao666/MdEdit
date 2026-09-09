const PORT = 9446
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
const wsA = 'C:\\Users\\Administrator\\AppData\\Local\\Temp\\tiptora-wsA'

let target
for (let i = 0; i < 40; i += 1) {
  const list = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json()
  target = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl)
  if (target) break
  await sleep(400)
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => {
  ws.addEventListener('open', res)
  ws.addEventListener('error', rej)
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
const evaluate = async (expression) => {
  const out = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
  if (out?.exceptionDetails) console.log('[exc]', JSON.stringify(out.exceptionDetails).slice(0, 300))
  return out?.result?.value
}
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data)
  if (m.method === 'Runtime.exceptionThrown') {
    console.log('[throw]', (m.params.exceptionDetails?.exception?.description ?? '').slice(0, 400))
  }
  if (m.method === 'Runtime.consoleAPICalled') {
    const text = m.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 300)
    if (!text.includes('Electron Security Warning')) console.log('[console]', text)
  }
})
await send('Runtime.enable')

console.log('state =', await evaluate(`JSON.stringify(await window.tiptora.workspace.state())`))
console.log('hasButton =', await evaluate(`!!document.querySelector('.launcher-main')`))
console.log(
  'click =',
  await evaluate(`(() => { const b = document.querySelector('.launcher-main'); if (!b) return 'none'; b.click(); return 'ok' })()`),
)
await sleep(2500)
console.log('after click state =', await evaluate(`JSON.stringify(await window.tiptora.workspace.state())`))
console.log(
  'dom =',
  await evaluate(`JSON.stringify({
    launcher: !!document.querySelector('.launcher'),
    groups: Array.from(document.querySelectorAll('.docgroup-name')).map(e => e.textContent),
    toasts: Array.from(document.querySelectorAll('.toast')).map(e => e.textContent),
  })`),
)
console.log('manual attach =', await evaluate(`JSON.stringify(await window.tiptora.workspace.attach(${JSON.stringify(wsA)}))`))
ws.close()
