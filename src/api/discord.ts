import { once, TtlCache } from './cache.ts'
import { config } from './env.ts'

/**
 * كل ما يلمس REST API الخاص بديسكورد.
 *
 * لا `discord.js` هنا: المكتبة كلها بُنيت حول الجيتواي والكاش الحيّ، وخادم الـ
 * API لا يحتاج أيًّا منهما — يحتاج أربعة نداءات HTTP. استيرادها يعني ربط عملية
 * الويب بدورة حياة اتصال دائم ليس لها فيه ناقة.
 */

const BASE = 'https://discord.com/api/v10'

export type DiscordUser = {
  id: string
  username: string
  global_name: string | null
  avatar: string | null
}

export type DiscordGuild = {
  id: string
  name: string
  icon: string | null
}

/** ما يحتاجه صف الصدارة — لا أكثر. */
export type Profile = {
  displayName: string
  /** هاش أفتار **المستخدم** لا العضو: عنوان الـ CDN في التطبيق مبني على /avatars/{userId} */
  avatarHash: string | null
}

export type OAuthTokens = {
  accessToken: string
  refreshToken: string | null
  expiresAt: number
}

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** يحترم 429 مرة واحدة ثم يستسلم — الحلقة اللانهائية أسوأ من الفشل الظاهر. */
async function request(url: string, init: RequestInit, attempt = 0): Promise<Response> {
  const res = await fetch(url, init)
  if (res.status === 429 && attempt < 2) {
    const wait = Number(res.headers.get('retry-after') ?? '1')
    await sleep(Math.min(Number.isFinite(wait) ? wait : 1, 5) * 1000)
    return request(url, init, attempt + 1)
  }
  return res
}

async function asJson(res: Response): Promise<unknown> {
  if (!res.ok) return null
  try {
    return await res.json()
  } catch {
    return null
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function asUser(value: unknown): DiscordUser | null {
  const row = record(value)
  if (!row) return null
  const id = row['id']
  const username = row['username']
  if (typeof id !== 'string' || typeof username !== 'string') return null
  const globalName = row['global_name']
  const avatar = row['avatar']
  return {
    id,
    username,
    global_name: typeof globalName === 'string' ? globalName : null,
    avatar: typeof avatar === 'string' ? avatar : null,
  }
}

function asGuild(value: unknown): DiscordGuild | null {
  const row = record(value)
  if (!row) return null
  const id = row['id']
  const name = row['name']
  if (typeof id !== 'string' || typeof name !== 'string') return null
  const icon = row['icon']
  return { id, name, icon: typeof icon === 'string' ? icon : null }
}

function botHeaders(): Record<string, string> | null {
  if (!config.discord.botToken) return null
  return { authorization: `Bot ${config.discord.botToken}` }
}

// ————————————————————— OAuth2 —————————————————————

function asTokens(value: unknown): OAuthTokens | null {
  const row = record(value)
  if (!row) return null
  const accessToken = row['access_token']
  if (typeof accessToken !== 'string') return null
  const refreshToken = row['refresh_token']
  const expiresIn = row['expires_in']
  return {
    accessToken,
    refreshToken: typeof refreshToken === 'string' ? refreshToken : null,
    // نطرح دقيقة أمانًا حتى لا نستعمل رمزًا ينتهي أثناء الطلب نفسه
    expiresAt: Date.now() + (typeof expiresIn === 'number' ? expiresIn - 60 : 600) * 1000,
  }
}

async function tokenRequest(body: URLSearchParams): Promise<OAuthTokens | null> {
  body.set('client_id', config.discord.clientId)
  body.set('client_secret', config.discord.clientSecret)

  const res = await request(`${BASE}/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body,
  })
  if (!res.ok) {
    // نطبع الحالة فقط — جسم الرد قد يحوي الرمز المرسل، ولا يُسجَّل
    console.error(`فشل تبادل الرمز مع ديسكورد: ${res.status}`)
    return null
  }
  return asTokens(await asJson(res))
}

export function exchangeCode(code: string): Promise<OAuthTokens | null> {
  return tokenRequest(
    new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: config.callbackUrl,
    }),
  )
}

export function refreshTokens(refreshToken: string): Promise<OAuthTokens | null> {
  return tokenRequest(
    new URLSearchParams({ grant_type: 'refresh_token', refresh_token: refreshToken }),
  )
}

export async function userMe(accessToken: string): Promise<DiscordUser | null> {
  const res = await request(`${BASE}/users/@me`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  return asUser(await asJson(res))
}

export async function userGuilds(accessToken: string): Promise<DiscordGuild[] | null> {
  const res = await request(`${BASE}/users/@me/guilds`, {
    headers: { authorization: `Bearer ${accessToken}` },
  })
  const body = await asJson(res)
  if (!Array.isArray(body)) return null
  return body.map(asGuild).filter((guild): guild is DiscordGuild => guild !== null)
}

// ————————————————————— بتوكن البوت —————————————————————

const guildCache = new TtlCache<DiscordGuild | null>(500, 10 * 60_000)
const guildPending = new Map<string, Promise<DiscordGuild | null>>()

/** بيانات سيرفر من البوت — تُستعمل حين لا يكون رمز المستخدم متاحًا. */
export function botGuild(guildId: string): Promise<DiscordGuild | null> {
  const hit = guildCache.get(guildId)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(guildPending, guildId, async () => {
    const headers = botHeaders()
    if (!headers) return null
    const res = await request(`${BASE}/guilds/${guildId}`, { headers })
    const guild = asGuild(await asJson(res))
    guildCache.set(guildId, guild)
    return guild
  })
}

const memberCache = new TtlCache<Profile | null>(2000, 5 * 60_000)
const memberPending = new Map<string, Promise<Profile | null>>()

/**
 * الاسم الظاهر والأفتار داخل سيرفر بعينه.
 *
 * ترتيب الأسماء يطابق ما يراه المستخدم في ديسكورد نفسه: اللقب في السيرفر، ثم
 * الاسم العالمي، ثم اسم المستخدم. عرض `username` مباشرة يملأ الصدارة بأسماء
 * مثل `k_9912` بدل الأسماء التي يعرفها اللاعبون.
 *
 * يعيد `null` حين يكون العضو خارج السيرفر ولا يمكن جلبه أصلًا.
 */
export function memberProfile(guildId: string, userId: string): Promise<Profile | null> {
  const key = `${guildId}:${userId}`
  const hit = memberCache.get(key)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(memberPending, key, async () => {
    const headers = botHeaders()
    if (!headers) return null

    const res = await request(`${BASE}/guilds/${guildId}/members/${userId}`, { headers })
    const member = record(await asJson(res))
    let profile: Profile | null = null

    if (member) {
      const user = asUser(member['user'])
      const nick = member['nick']
      if (user) {
        profile = {
          displayName:
            (typeof nick === 'string' && nick.trim() ? nick : null) ??
            user.global_name ??
            user.username,
          avatarHash: user.avatar,
        }
      }
    } else {
      // غادر السيرفر لكنه ما زال في جدول النقاط — نعرضه باسمه العالمي
      const user = await botUser(userId)
      if (user) profile = { displayName: user.global_name ?? user.username, avatarHash: user.avatar }
    }

    memberCache.set(key, profile)
    return profile
  })
}

/**
 * يزرع بطاقة عضو في الكاش بدل جلبها.
 * يستعمله `scripts/ws-play.ts` ليعرض أسماء حقيقية بلا توكن بوت ولا شبكة.
 */
export function rememberProfile(guildId: string, userId: string, profile: Profile): void {
  memberCache.set(`${guildId}:${userId}`, profile)
}

/** هل هذا المستخدم عضو في السيرفر؟ يُستعمل حين لا يوجد رمز OAuth محفوظ. */
export async function isMember(guildId: string, userId: string): Promise<boolean> {
  return (await memberProfile(guildId, userId)) !== null
}

const userCache = new TtlCache<DiscordUser | null>(2000, 10 * 60_000)
const userPending = new Map<string, Promise<DiscordUser | null>>()

export function botUser(userId: string): Promise<DiscordUser | null> {
  const hit = userCache.get(userId)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(userPending, userId, async () => {
    const headers = botHeaders()
    if (!headers) return null
    const res = await request(`${BASE}/users/${userId}`, { headers })
    const user = asUser(await asJson(res))
    userCache.set(userId, user)
    return user
  })
}

/** رابط أفتار جاهز للعرض — التطبيق لا يبني الروابط في مشاهد اللعب. */
export function avatarUrl(userId: string, hash: string | null, size = 128): string {
  if (hash) {
    const ext = hash.startsWith('a_') ? 'gif' : 'png'
    return `https://cdn.discordapp.com/avatars/${userId}/${hash}.${ext}?size=${size}`
  }
  // نفس معادلة ديسكورد للأفتار الافتراضي — لا دائرة فارغة لمن لم يضع صورة
  const index = /^\d+$/.test(userId) ? (BigInt(userId) >> 22n) % 6n : 0n
  return `https://cdn.discordapp.com/embed/avatars/${index}.png`
}
