import { randomBytes } from 'node:crypto'
import { rememberAccount, rememberTokens } from './access.ts'
import { exchangeCode, userMe } from './discord.ts'
import { config, isAllowedRedirect } from './env.ts'
import { redirect, safeQuery, text, type Ctx } from './http.ts'
import { hmac, safeEqual, signToken } from './jwt.ts'

/**
 * تسجيل الدخول بديسكورد.
 *
 * التطبيق لا يرى `client_secret` ولا يبادل الرمز بنفسه: أي سرّ يوضع في حزمة
 * تُوزَّع على الأجهزة هو سرّ منشور — استخراجه من الـ IPA عملية دقائق. التطبيق
 * يفتح `/auth/start` فقط، والخادم يتولى ديسكورد ويعيد رمز جلسة من عندنا.
 */

const AUTHORIZE = 'https://discord.com/oauth2/authorize'
const SCOPES = 'identify guilds'
const STATE_TTL_MS = 10 * 60_000

/**
 * `state` موقّع لا مخزّن.
 *
 * التخزين في الذاكرة يعني أن إعادة تشغيل الخادم أثناء تسجيل دخول مستخدم تُفشله،
 * وأن عدة عمليات خلف موازن حمل لا تتفق. التوقيع يحلّ الاثنين: الحالة تحمل
 * وجهتها وعمرها ونونس، والبصمة تثبت أنها صادرة عنّا — وهذا هو منع الـ CSRF
 * المطلوب: رمز ترخيص يصلنا بـ state لم نصدره نحن يُرفض.
 */
function makeState(redirectTo: string): string {
  const body = Buffer.from(
    JSON.stringify({
      r: redirectTo,
      n: randomBytes(12).toString('base64url'),
      e: Date.now() + STATE_TTL_MS,
    }),
  ).toString('base64url')
  return `${body}.${hmac(body, config.jwt.secret)}`
}

function readState(state: string): { redirectTo: string } | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  if (body === undefined || signature === undefined) return null
  if (!safeEqual(hmac(body, config.jwt.secret), signature)) return null

  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    if (typeof parsed !== 'object' || parsed === null) return null
    const row = parsed as Record<string, unknown>
    const redirectTo = row['r']
    const expires = row['e']
    if (typeof redirectTo !== 'string' || typeof expires !== 'number') return null
    if (expires <= Date.now()) return null
    // القائمة البيضاء تُفحص مرتين: عند الإصدار وعند الاستهلاك، فتغييرها يُبطل الجلسات المعلّقة
    if (!isAllowedRedirect(redirectTo)) return null
    return { redirectTo }
  } catch {
    return null
  }
}

export function authStart(ctx: Ctx): Promise<void> {
  const wanted = safeQuery(ctx.url, 'redirect') ?? config.redirects[0] ?? 'gamesapp://auth'
  if (!isAllowedRedirect(wanted)) {
    text(ctx.res, 400, 'وجهة العودة غير مسموح بها')
    return Promise.resolve()
  }

  // يُبنى بـ encodeURIComponent لا بـ URLSearchParams: الأخيرة تكتب المسافة `+`
  // بينما توثيق ديسكورد يفترض `%20` في النطاقات
  const query = Object.entries({
    client_id: config.discord.clientId,
    redirect_uri: config.callbackUrl,
    response_type: 'code',
    scope: SCOPES,
    state: makeState(wanted),
    // بلا هذا يعيد ديسكورد المستخدم فورًا بلا شاشة، فلا يرى ما يمنحه
    prompt: 'consent',
  })
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&')

  redirect(ctx.res, `${AUTHORIZE}?${query}`)
  return Promise.resolve()
}

/**
 * العودة إلى التطبيق برسالة خطأ بدل صفحة بيضاء لا يفهمها المستخدم.
 *
 * والسبب يُسجَّل هنا لا في التطبيق وحده. التطبيق يعرض «تعذّر تسجيل الدخول»
 * لأن المستخدم لا ينفعه اسم الطور الذي سقط فيه، لكن ذلك يترك من يصلح العطل
 * بلا خبر: ثلاثة أطوار مختلفة تخرج برسالة واحدة، فلا يُعرف أيّها وقع.
 */
function bounce(ctx: Ctx, redirectTo: string, reason: string): void {
  console.error(`[auth] فشل تسجيل الدخول: ${reason} · الوجهة ${redirectTo}`)
  const back = new URL(redirectTo)
  back.searchParams.set('error', reason)
  redirect(ctx.res, back.toString())
}

export async function authCallback(ctx: Ctx): Promise<void> {
  const state = safeQuery(ctx.url, 'state')
  const verified = state ? readState(state) : null
  if (!verified) {
    // بلا state صالح لا نعرف وجهة آمنة نعيده إليها، فنقف هنا
    text(ctx.res, 400, 'طلب تسجيل دخول غير صالح أو منتهٍ. أعد المحاولة من التطبيق.')
    return
  }

  const code = safeQuery(ctx.url, 'code')
  if (!code) {
    bounce(ctx, verified.redirectTo, 'denied')
    return
  }

  const tokens = await exchangeCode(code)
  if (!tokens) {
    bounce(ctx, verified.redirectTo, 'exchange_failed')
    return
  }

  const me = await userMe(tokens.accessToken)
  if (!me) {
    bounce(ctx, verified.redirectTo, 'profile_failed')
    return
  }

  rememberTokens(me.id, tokens)
  // الحفظ لا يمنع الدخول: قاعدة متعثّرة تُسقط الجلسة كلها بينما التوقيع لا
  // يحتاجها أصلًا، والرمز صالح بذاته. وسقوط الحفظ يُسجَّل ولا يُبتلع صامتًا.
  try {
    rememberAccount(me)
  } catch (err) {
    console.error('[auth] حفظ الحساب تعثّر، والدخول يمضي:', err)
  }

  console.log(`[auth] دخل ${me.id}`)
  const session = signToken(me.id, config.jwt.secret, config.jwt.ttlSeconds)
  const back = new URL(verified.redirectTo)
  back.searchParams.set('token', session)
  redirect(ctx.res, back.toString())
}
