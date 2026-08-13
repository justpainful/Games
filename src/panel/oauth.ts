import { randomBytes } from 'node:crypto'
import { hmac, safeEqual } from '../api/jwt.ts'

/**
 * دخول ديسكورد لمِقود.
 *
 * نسخة مستقلّة عن `src/api/oauth.ts` عمدًا. ذاك يقرأ `api/env.ts` وهو يرمي بلا
 * `API_JWT_SECRET`، فربطه هنا يعني أن لوحة التحكّم لا تفتح عند من لم يملأ
 * أسرار تطبيق الجوال. وهذا الملف يقرأ البيئة مباشرة، فإن نقص شيء أخفى الزر
 * وبقي باب رمز الاقتران مفتوحًا.
 *
 * وعنوان العودة يُبنى من **عنوان الطلب نفسه** لا من متغيّر ثابت: التطبيق
 * يُفتح مرّة على `localhost` ومرّة على عنوان الشبكة، والثابت يصحّ في واحد
 * ويكسر الآخر.
 */

const AUTHORIZE = 'https://discord.com/oauth2/authorize'
const TOKEN = 'https://discord.com/api/v10/oauth2/token'
const ME = 'https://discord.com/api/v10/users/@me'
const STATE_TTL_MS = 10 * 60_000

export type OauthKeys = { clientId: string; clientSecret: string }

/** `null` يعني: أخفِ زر ديسكورد ولا تعده بما لا يقدر عليه. */
export function keys(): OauthKeys | null {
  const clientId = (process.env['DISCORD_CLIENT_ID'] ?? process.env['DISCORD_APP_ID'] ?? '').trim()
  const clientSecret = (process.env['DISCORD_CLIENT_SECRET'] ?? '').trim()
  if (!clientId || !clientSecret) return null
  return { clientId, clientSecret }
}

export function makeState(redirectUri: string, secret: string): string {
  const body = Buffer.from(
    JSON.stringify({ u: redirectUri, n: randomBytes(12).toString('base64url'), e: Date.now() + STATE_TTL_MS }),
  ).toString('base64url')
  return `${body}.${hmac(body, secret)}`
}

/** يعيد عنوان العودة المحفوظ داخل الحالة، أو `null` إن لم تكن صادرة عنّا. */
export function readState(state: string, secret: string): string | null {
  const parts = state.split('.')
  if (parts.length !== 2) return null
  const [body, signature] = parts
  if (body === undefined || signature === undefined) return null
  if (!safeEqual(hmac(body, secret), signature)) return null

  try {
    const parsed: unknown = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'))
    const row = parsed as { u?: unknown; e?: unknown }
    if (typeof row.u !== 'string' || typeof row.e !== 'number') return null
    if (row.e <= Date.now()) return null
    return row.u
  } catch {
    return null
  }
}

export function authorizeUrl(clientId: string, redirectUri: string, state: string): string {
  const query = Object.entries({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: 'identify',
    state,
  })
    .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
    .join('&')
  return `${AUTHORIZE}?${query}`
}

export type DiscordMe = { id: string; username: string; global_name?: string | null }

export async function exchange(
  code: string,
  redirectUri: string,
  auth: OauthKeys,
): Promise<DiscordMe | null> {
  const body = new URLSearchParams({
    client_id: auth.clientId,
    client_secret: auth.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
  })

  const res = await fetch(TOKEN, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  }).catch(() => null)
  if (!res?.ok) {
    console.error(`[مقود] تبادل رمز ديسكورد فشل: ${res?.status ?? 'لا شبكة'}`)
    return null
  }

  const tokens = (await res.json().catch(() => null)) as { access_token?: string } | null
  if (!tokens?.access_token) return null

  const meRes = await fetch(ME, {
    headers: { authorization: `Bearer ${tokens.access_token}` },
  }).catch(() => null)
  if (!meRes?.ok) return null

  const me = (await meRes.json().catch(() => null)) as DiscordMe | null
  return me?.id ? me : null
}
