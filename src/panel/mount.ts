import type { IncomingMessage, ServerResponse } from 'node:http'
import { authorizeUrl, exchange, keys, makeState, readState } from './oauth.ts'
import {
  clearTries,
  clientIp,
  currentCode,
  issue,
  noteTry,
  panelSecret,
  readUser,
  rotateCode,
  tooManyTries,
  type PanelUser,
} from './session.ts'
import { status } from './status.ts'

/**
 * موجّه التحكّم المحلي — كل ما تحت `/ctl`.
 *
 * ————————————————— لماذا JSON وحده ولا صفحة ويب —————————————————
 *
 * السطح هنا تطبيق SwiftUI أصلي لا متصفّح. وإضافة صفحة ويب بجانبه تعني سطحين
 * يتفرّقان: يُضاف زرّ في أحدهما وينسى في الآخر، وينتهي الأمر بلوحتين ناقصتين
 * بدل واحدة كاملة. فهذا الملف يخدم البيانات وحدها، والشكل كله في التطبيق.
 *
 * ————————————————— لماذا لا يعيد استعمال `src/api` —————————————————
 *
 * ذاك يخدم لاعبين على أجهزتهم: مصادقته بـ Bearer، وصلاحيّاته لكل عضو، ويفشل
 * إقلاعه بلا أسرار OAuth. وهذا يخدم صاحب البوت على شبكته: مصادقته برمز اقتران
 * يُطبع في الطرفيّة، وصلاحيّته الكاملة، ويقلع بلا إعداد. خلطهما يعني إما
 * إضعاف الأول أو تعطيل الثاني.
 */

function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
    'cache-control': 'no-store',
  })
  res.end(payload)
}

/** جسم الطلب بحدّ أعلى — طلب بلا نهاية يملأ الذاكرة بلا أن يفعل شيئًا. */
async function readBody(req: IncomingMessage, max = 64 * 1024): Promise<unknown> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > max) throw new Error('too big')
    chunks.push(buf)
  }
  if (size === 0) return {}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** عنوان هذا الطلب كما يراه المتصفّح — أساس عنوان عودة ديسكورد. */
function originOf(req: IncomingMessage): string {
  return `http://${req.headers.host ?? 'localhost'}`
}

export async function handleControl(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const route = url.pathname.replace(/^\/ctl\/?/, '').replace(/\/+$/, '')

  // ————————————————— بلا مصادقة —————————————————

  /**
   * بطاقة التعريف: من هذا الخادم وأي بوت يقود.
   *
   * مفتوحة عمدًا، ولا تحمل شيئًا سرّيًا. التطبيق يناديها بعد أن يجد الخادم
   * على الشبكة ليعرض «Games — على هذا الجهاز» قبل الدخول، فلا يطلب رمزًا
   * لخادم لا يعرف صاحبه أنه هو.
   */
  if (route === 'hello') {
    const now = await status()
    json(res, 200, {
      service: 'miqwad',
      version: 1,
      bot: now.bot.tag,
      botId: now.bot.id,
      online: now.bot.online,
      guilds: now.bot.guilds,
      discordLogin: keys() !== null,
    })
    return true
  }

  if (route === 'auth/start') {
    const auth = keys()
    if (!auth) {
      json(res, 503, { error: 'دخول ديسكورد غير مضبوط على هذا الجهاز' })
      return true
    }
    const redirectUri = `${originOf(req)}/ctl/auth/callback`
    res.writeHead(302, {
      location: authorizeUrl(auth.clientId, redirectUri, makeState(redirectUri, panelSecret())),
    })
    res.end()
    return true
  }

  if (route === 'auth/callback') {
    await finishDiscordLogin(req, res, url)
    return true
  }

  if (route === 'pair' && req.method === 'POST') {
    await pair(req, res)
    return true
  }

  // ————————————————— بعدها لا شيء بلا رمز —————————————————

  const user = readUser(req)
  if (!user) {
    json(res, 401, { error: 'غير مسجّل' })
    return true
  }

  if (route === 'me') {
    json(res, 200, { user, discordLogin: keys() !== null })
    return true
  }

  if (route === 'status') {
    json(res, 200, await status())
    return true
  }

  return false
}

async function pair(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const from = clientIp(req)
  if (tooManyTries(from)) {
    json(res, 429, { error: 'محاولات كثيرة. انتظر دقيقة.' })
    return
  }

  const body = (await readBody(req).catch(() => null)) as { code?: unknown } | null
  const given = typeof body?.code === 'string' ? body.code.replace(/\D/g, '') : ''

  if (given.length !== 6 || given !== currentCode()) {
    noteTry(from)
    json(res, 401, { error: 'الرمز غير صحيح.' })
    return
  }

  clearTries(from)
  const next = rotateCode()
  console.log(`[مقود] اقترن جهاز من ${from} · الرمز الجديد: ${next}`)

  const user: PanelUser = { id: 'owner', via: 'code', name: 'المالك' }
  json(res, 200, { token: issue(user), user })
}

async function finishDiscordLogin(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<void> {
  const auth = keys()
  const state = url.searchParams.get('state') ?? ''
  const redirectUri = auth ? readState(state, panelSecret()) : null
  const code = url.searchParams.get('code') ?? ''

  /**
   * العودة إلى التطبيق بمخطّطه الخاص.
   *
   * جلسة `ASWebAuthenticationSession` تُغلق حين يصل المتصفّح إلى عنوان بمخطّط
   * التطبيق، وما تحمله في الاستعلام يصل إلى التطبيق. فالرمز يُسلَّم هنا لا في
   * صفحة يقرؤها المستخدم.
   */
  const back = (params: Record<string, string>): void => {
    const to = new URL('miqwad://auth')
    for (const [k, v] of Object.entries(params)) to.searchParams.set(k, v)
    res.writeHead(302, { location: to.toString() })
    res.end()
  }

  const bounce = (why: string): void => {
    console.error(`[مقود] دخول ديسكورد فشل: ${why}`)
    back({ error: why })
  }

  if (!auth || !redirectUri) return bounce('حالة غير صالحة')
  if (!code) return bounce('أُلغي الدخول')

  const me = await exchange(code, redirectUri, auth)
  if (!me) return bounce('تعذّر التحقق من ديسكورد')

  /**
   * المالك وحده.
   *
   * التطبيق يفتح كل مفاتيح البوت، وحساب ديسكورد أيًّا كان لا يكفي بابًا إليه.
   * فإن كان `BOT_OWNER_ID` مضبوطًا فهو الشرط، وإن لم يكن فالباب مغلق ويبقى
   * رمز الاقتران — والذي يقرأه جالس أمام الحاسب.
   */
  const owner = (process.env['BOT_OWNER_ID'] ?? '').trim()
  if (!owner || me.id !== owner) return bounce('هذا الحساب ليس مالك البوت')

  back({ token: issue({ id: me.id, via: 'discord', name: me.global_name ?? me.username }) })
}
