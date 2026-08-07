import { randomBytes } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { config } from '../api/env.ts'
import { hmac, safeEqual } from '../api/jwt.ts'
import type { WebUser } from './types.ts'

/**
 * دخول الويب بديسكورد.
 *
 * الفرق الجوهري عن `src/api/oauth.ts`: هناك عميلٌ أصليّ يحمل الرمز بنفسه في
 * ترويسة `Authorization`، وهنا متصفّح. المتصفّح لا يحمل ترويسات نيابةً عنّا،
 * فالجلسة **كوكي**؛ ولأنه كوكي يرسله المتصفّح تلقائيًا مع أي طلب — بما فيه طلب
 * يبدأه موقع خبيث — صار لازمًا شيئان لم يكونا لازمين في الـ API:
 * `SameSite=Lax` على الكوكي، ورمز CSRF في كل نموذج (انظر `csrf.ts`).
 *
 * لا سرّ مكتوب في هذا الملف. كله من البيئة.
 */

const AUTHORIZE = 'https://discord.com/oauth2/authorize'
const API = 'https://discord.com/api/v10'
const SCOPES = 'identify guilds'

const STATE_TTL_MS = 10 * 60_000
/**
 * اثنتا عشرة ساعة. أقصر بكثير من رمز التطبيق (ثلاثون يومًا) عن قصد: جهاز
 * المستخدم في يده، أما جلسة المتصفّح فقد تبقى مفتوحة على حاسوب مشترك، وهي
 * جلسة **إدارية** تعدّل إعدادات سيرفرات لا تقرأ نقاطًا فقط.
 */
const SESSION_TTL_SECONDS = 12 * 60 * 60

export const COOKIE_NAME = 'dash_session'
export const COOKIE_PATH = '/dash'
const MAX_COOKIE_BYTES = 4096

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')

function env(name: string): string | undefined {
  const raw = process.env[name]?.trim()
  return raw ? raw : undefined
}

/**
 * سرّ مستقل عن سرّ رموز الجوال.
 *
 * لو وقّع الاثنان بنفس المفتاح لصار رمزُ تطبيقٍ مسروق صالحًا ككوكي داشبورد
 * (ترقية صلاحية بلا اختراق). حين لا يُضبط `DASH_SESSION_SECRET` نشتقّه بـ HMAC
 * من `API_JWT_SECRET` بلافتة ثابتة: فصلٌ نطاقي كامل بلا مطالبة المشغّل بسرّ ثانٍ،
 * ولا سرّ في المستودع في الحالتين.
 */
const sessionSecret = env('DASH_SESSION_SECRET') ?? hmac('dashboard:session:v1', config.jwt.secret)

/** سرّ توقيع رموز CSRF — مشتقّ كذلك، ولا يساوي سرّ الجلسة. */
export const csrfSecret = env('DASH_CSRF_SECRET') ?? hmac('dashboard:csrf:v1', config.jwt.secret)

const publicUrl = (env('DASH_PUBLIC_URL') ?? config.publicUrl).replace(/\/+$/, '')

/** لا بد أن يكون مسجَّلًا حرفيًا في Redirects ببوابة مطوّري ديسكورد. */
export const callbackUrl = `${publicUrl}/dash/callback`

/**
 * `Secure` يُشتقّ من العنوان لا من متغيّر بيئة.
 *
 * متغيّر مثل `DASH_INSECURE_COOKIE` كان سيصير مفتاحًا يُنسى مفتوحًا في الإنتاج.
 * localhost وحده يُعفى — وهناك لا شبكة يتنصّت عليها أحد.
 */
const secureCookie = !/^http:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?$/.test(publicUrl)

// ————————————————————— رمز الجلسة —————————————————————

export type SessionClaims = {
  /** يميّز رمز الداشبورد عن رمز التطبيق حتى لو تسرّب المفتاح يومًا */
  t: 'dash'
  sub: string
  /** معرّف الجلسة — منه يُشتقّ رمز CSRF */
  sid: string
  u: string
  d: string | null
  a: string | null
  iat: number
  exp: number
}

export function newSessionId(): string {
  return randomBytes(16).toString('base64url')
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

/**
 * الهوية كاملة داخل الرمز لا في خريطة ذاكرة.
 *
 * لو كان الاسم والأفتار في الذاكرة وحدها لظهر المستخدم بلا اسم بعد كل إعادة
 * تشغيل، أو لاحتاج كل عرض صفحة نداءً لديسكورد. الحقول الأربعة عامة أصلًا
 * (يراها كل من في السيرفر)، فلا شيء حسّاس يُحمَل في الكوكي.
 */
export function signSession(
  user: WebUser,
  sid: string,
  ttlSeconds: number = SESSION_TTL_SECONDS,
): string {
  const now = Math.floor(Date.now() / 1000)
  const claims: SessionClaims = {
    t: 'dash',
    sub: user.id,
    sid,
    u: user.username,
    d: user.displayName,
    a: user.avatarHash,
    iat: now,
    exp: now + ttlSeconds,
  }
  const body = `${HEADER}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`
  return `${body}.${hmac(body, sessionSecret)}`
}

/** البصمة أولًا: لا يُفكّ ولا يُصدَّق أي بايت قبل إثبات أنه صادر عنّا. */
export function verifySession(token: string): SessionClaims | null {
  if (token.length === 0 || token.length > MAX_COOKIE_BYTES) return null

  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, payload, signature] = parts
  if (head === undefined || payload === undefined || signature === undefined) return null

  if (!safeEqual(hmac(`${head}.${payload}`, sessionSecret), signature)) return null

  const header = asRecord(decodeSegment(head))
  // لا نصدّق `alg` القادم من الرمز نفسه — هجمة alg=none / خلط الخوارزميات
  if (!header || header['alg'] !== 'HS256') return null

  const claims = asRecord(decodeSegment(payload))
  if (!claims) return null
  if (claims['t'] !== 'dash') return null

  const sub = claims['sub']
  const sid = claims['sid']
  const username = claims['u']
  const iat = claims['iat']
  const exp = claims['exp']
  if (typeof sub !== 'string' || sub.length === 0) return null
  if (typeof sid !== 'string' || sid.length === 0) return null
  if (typeof username !== 'string' || username.length === 0) return null
  if (typeof iat !== 'number' || typeof exp !== 'number') return null
  if (exp * 1000 <= Date.now()) return null

  const displayName = claims['d']
  const avatarHash = claims['a']
  return {
    t: 'dash',
    sub,
    sid,
    u: username,
    d: typeof displayName === 'string' ? displayName : null,
    a: typeof avatarHash === 'string' ? avatarHash : null,
    iat,
    exp,
  }
}

// ————————————————————— الكوكي —————————————————————

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  if (!header || header.length > 8192) return out

  for (const piece of header.split(';')) {
    const at = piece.indexOf('=')
    if (at <= 0) continue
    const name = piece.slice(0, at).trim()
    const value = piece.slice(at + 1).trim()
    if (name.length > 0 && out[name] === undefined) out[name] = value
  }
  return out
}

/**
 * `HttpOnly` يمنع جافاسكربت من قراءتها (فلا تسرقها ثغرة XSS في صفحة)،
 * و`SameSite=Lax` يمنع المتصفّح من إرفاقها في POST قادم من موقع آخر —
 * وهو خط الدفاع الأول قبل رمز CSRF، لا بديلًا عنه.
 */
export function buildSessionCookie(value: string, maxAgeSeconds: number): string {
  return [
    `${COOKIE_NAME}=${value}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
    ...(secureCookie ? ['Secure'] : []),
  ].join('; ')
}

export function readClaims(req: IncomingMessage): SessionClaims | null {
  const raw = parseCookies(req.headers.cookie)[COOKIE_NAME]
  if (!raw) return null
  return verifySession(raw)
}

/** الهوية الحالية، أو `null` لمن لا جلسة له. */
export function readSession(req: IncomingMessage): WebUser | null {
  const claims = readClaims(req)
  if (!claims) return null
  return { id: claims.sub, username: claims.u, displayName: claims.d, avatarHash: claims.a }
}

/** معرّف الجلسة — يحتاجه `csrf.ts` وحده. */
export function readSessionId(req: IncomingMessage): string | null {
  return readClaims(req)?.sid ?? null
}

// ————————————————————— رموز OAuth —————————————————————

export type OAuthTokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
}

/**
 * في الذاكرة لا في قاعدة البيانات: تعديل الـ schema ليس ملكي، ورمزُ وصولٍ
 * مخزّن على القرص خصمٌ صافٍ. فقدانه بإعادة التشغيل يعني إعادة تسجيل دخول
 * واحدة، لا فقدان بيانات.
 */
const tokens = new Map<string, OAuthTokens>()

export function rememberOAuth(userId: string, value: OAuthTokens): void {
  tokens.set(userId, value)
}

export function forgetOAuth(userId: string): void {
  tokens.delete(userId)
}

export async function oauthTokenFor(userId: string): Promise<string | null> {
  const held = tokens.get(userId)
  if (!held) return null
  if (held.expiresAt > Date.now()) return held.accessToken

  if (!held.refreshToken) {
    tokens.delete(userId)
    return null
  }
  const renewed = await tokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: held.refreshToken }),
  )
  if (!renewed) {
    tokens.delete(userId)
    return null
  }
  tokens.set(userId, renewed)
  return renewed.accessToken
}

// ————————————————————— REST ديسكورد —————————————————————

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** يحترم 429 مرتين ثم يستسلم — الحلقة اللانهائية أسوأ من الفشل الظاهر. */
async function request(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status === 429 && attempt < 2) {
    const wait = Number(res.headers.get('retry-after') ?? '1')
    await sleep(Math.min(Number.isFinite(wait) ? wait : 1, 5) * 1000)
    return request(url, init, attempt + 1)
  }
  return res
}

/**
 * قراءة من REST ديسكورد. `authorization` كاملة (`Bearer …` أو `Bot …`) حتى
 * لا يخمّن النداءُ نوعَ الرمز.
 */
export async function discordGet(path: string, authorization: string): Promise<unknown> {
  const res = await request(`${API}${path}`, { headers: { authorization } })
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

function asTokens(value: unknown): OAuthTokens | null {
  const row = asRecord(value)
  if (!row) return null
  const accessToken = row['access_token']
  if (typeof accessToken !== 'string') return null
  const refreshToken = row['refresh_token']
  const expiresIn = row['expires_in']
  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
    // دقيقة أمان حتى لا نستعمل رمزًا ينتهي أثناء الطلب نفسه
    expiresAt: Date.now() + (typeof expiresIn === 'number' ? expiresIn - 60 : 600) * 1000,
  }
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens | null> {
  body.set('client_id', config.discord.clientId)
  body.set('client_secret', config.discord.clientSecret)

  const res = await request(`${API}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    // الحالة فقط — جسم الرد قد يحوي الرمز المرسل ولا يُسجَّل
    console.error(`الداشبورد: فشل تبادل رمز ديسكورد (${res.status})`)
    return null
  }
  return asTokens(await res.json().catch(() => null))
}

async function fetchMe(accessToken: string): Promise<WebUser | null> {
  const row = asRecord(await discordGet('/users/@me', `Bearer ${accessToken}`))
  if (!row) return null
  const id = row['id']
  const username = row['username']
  if (typeof id !== 'string' || typeof username !== 'string') return null
  const globalName = row['global_name']
  const avatar = row['avatar']
  return {
    id,
    username,
    displayName: typeof globalName === 'string' ? globalName : null,
    avatarHash: typeof avatar === 'string' ? avatar : null,
  }
}

// ————————————————————— الحالة الموقّعة —————————————————————

/** وجهة العودة داخل الداشبورد وحده — بلا هذا يصير `/dash/login` جسر open redirect. */
export function isSafeReturn(path: string): boolean {
  return /^\/dash(?:[/?#]|$)/.test(path) && !path.startsWith('/dash//')
}

function makeState(returnTo: string): string {
  const body = Buffer.from(
    JSON.stringify({
      r: returnTo,
      n: randomBytes(12).toString('base64url'),
      e: Date.now() + STATE_TTL_MS,
    }),
  ).toString('base64url')
  return `${body}.${hmac(body, sessionSecret)}`
}

/**
 * `state` موقّع لا مخزّن: يعمل عبر إعادات التشغيل وعبر عدة عمليات خلف موازن،
 * ويمنع أن يصلنا رمز ترخيص بحالة لم نُصدرها نحن.
 */
export function readState(state: string): { returnTo: string } | null {
  if (state.length > 2048) return null
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  if (body === undefined || signature === undefined) return null
  if (!safeEqual(hmac(body, sessionSecret), signature)) return null

  const parsed = asRecord(decodeSegment(body))
  if (!parsed) return null
  const returnTo = parsed['r']
  const expires = parsed['e']
  if (typeof returnTo !== 'string' || typeof expires !== 'number') return null
  if (expires <= Date.now()) return null
  if (!isSafeReturn(returnTo)) return null
  return { returnTo }
}

// ————————————————————— المعالجات —————————————————————

function urlOf(req: IncomingMessage): URL {
  return new URL(req.url ?? '/dash', publicUrl)
}

function sendText(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'cache-control': 'no-store',
  })
  res.end(body)
}

function sendRedirect(res: ServerResponse, location: string, cookie?: string): void {
  res.writeHead(302, {
    location,
    'cache-control': 'no-store',
    ...(cookie ? { 'set-cookie': cookie } : {}),
  })
  res.end()
}

/** `GET /dash/login` */
export function dashLogin(req: IncomingMessage, res: ServerResponse): void {
  const wanted = urlOf(req).searchParams.get('next') ?? '/dash'
  const returnTo = isSafeReturn(wanted) ? wanted : '/dash'

  // يُبنى بـ encodeURIComponent لا بـ URLSearchParams: الأخيرة تكتب المسافة `+`
  // بينما توثيق ديسكورد يفترض `%20` في النطاقات
  const query = Object.entries({
    client_id: config.discord.clientId,
    redirect_uri: callbackUrl,
    response_type: 'code',
    scope: SCOPES,
    state: makeState(returnTo),
    prompt: 'consent',
  })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')

  sendRedirect(res, `${AUTHORIZE}?${query}`)
}

/** `GET /dash/callback` */
export async function dashCallback(req: IncomingMessage, res: ServerResponse): Promise<void> {
  const url = urlOf(req)
  const state = url.searchParams.get('state') ?? ''
  const verified = readState(state)
  if (!verified) {
    sendText(res, 400, 'طلب تسجيل دخول غير صالح أو منتهٍ. ابدأ من /dash/login مرة أخرى.')
    return
  }

  const code = url.searchParams.get('code')
  if (!code || code.length > 512) {
    sendText(res, 400, 'رفضتَ الإذن أو انقطع الطلب. أعد المحاولة من /dash/login.')
    return
  }

  const granted = await tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl,
    }),
  )
  if (!granted) {
    sendText(res, 502, 'تعذّر إكمال تسجيل الدخول مع ديسكورد. حاول بعد قليل.')
    return
  }

  const me = await fetchMe(granted.accessToken)
  if (!me) {
    sendText(res, 502, 'تعذّر قراءة حسابك من ديسكورد. حاول بعد قليل.')
    return
  }

  rememberOAuth(me.id, granted)
  const token = signSession(me, newSessionId())
  sendRedirect(res, verified.returnTo, buildSessionCookie(token, SESSION_TTL_SECONDS))
}

/** `GET /dash/logout` */
export function dashLogout(req: IncomingMessage, res: ServerResponse): void {
  const claims = readClaims(req)
  if (claims) forgetOAuth(claims.sub)
  // نفس الاسم والمسار بعمر صفر — الكوكي لا يُحذف إلا بمسار مطابق
  sendRedirect(res, '/dash/login', buildSessionCookie('', 0))
}
