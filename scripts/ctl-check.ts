// فحص خادم التحكّم بلا بوت ولا قاعدة بيانات:
//   npx tsx scripts/ctl-check.ts
import { startPanel } from '../src/panel/serve.ts'
import { currentCode } from '../src/panel/session.ts'
import { unadvertise } from '../src/panel/discovery.ts'

const PORT = 4599
const server = await startPanel(PORT)
const base = `http://127.0.0.1:${PORT}`

const show = async (label: string, res: Response): Promise<void> => {
  const text = await res.text()
  console.log(`${label} -> ${res.status} ${text.slice(0, 200)}`)
}

await show('hello           ', await fetch(`${base}/ctl/hello`))
await show('status(no token)', await fetch(`${base}/ctl/status`))
await show('pair(wrong)     ', await fetch(`${base}/ctl/pair`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: '000000' }),
}))

const paired = await fetch(`${base}/ctl/pair`, {
  method: 'POST', headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ code: currentCode() }),
})
const body = (await paired.json()) as { token: string }
console.log(`pair(right)      -> ${paired.status} token ${body.token.slice(0, 20)}…`)

const auth = { authorization: `Bearer ${body.token}` }
await show('me              ', await fetch(`${base}/ctl/me`, { headers: auth }))
await show('status          ', await fetch(`${base}/ctl/status`, { headers: auth }))
await show('forged token    ', await fetch(`${base}/ctl/status`, {
  headers: { authorization: 'Bearer nope.nope.nope' },
}))

server.close()
await unadvertise()
process.exit(0)
