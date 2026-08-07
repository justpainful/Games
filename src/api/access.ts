import { prisma } from '../db/prisma.ts'
import { once, TtlCache } from './cache.ts'
import {
  botGuild,
  botUser,
  isMember,
  refreshTokens,
  userGuilds,
  userMe,
  type DiscordUser,
  type OAuthTokens,
} from './discord.ts'
import { HttpError } from './http.ts'

/**
 * من يرى ماذا.
 *
 * قاعدتان لا تُكسران:
 *  1. لا يُعرض للمستخدم إلا سيرفر **هو فيه والبوت فيه** — سيرفر بلا بوت يفتح
 *     شاشة نقاط فارغة بلا سبب ظاهر، وسيرفر ليس فيه المستخدم تسريب.
 *  2. أي مسار يأخذ `guildId` من العميل يمرّ على `assertMember` قبل لمس الجدول.
 */

export type AccountDTO = {
  id: string
  username: string
  displayName: string | null
  avatarHash: string | null
}

export type GuildDTO = {
  id: string
  name: string
  iconHash: string | null
}

/**
 * رموز OAuth في الذاكرة لا في قاعدة البيانات.
 *
 * تعديل الـ schema ممنوع هنا، والرمز قصير العمر أصلًا. فقدانه عند إعادة التشغيل
 * ليس عطلًا: المسار البديل أدناه يستخرج نفس المعلومة بتوكن البوت.
 */
const tokens = new Map<string, OAuthTokens>()
const accounts = new TtlCache<AccountDTO>(5000, 30 * 60_000)

export function rememberTokens(userId: string, value: OAuthTokens): void {
  tokens.set(userId, value)
}

export function rememberAccount(user: DiscordUser): void {
  accounts.set(user.id, {
    id: user.id,
    username: user.username,
    displayName: user.global_name,
    avatarHash: user.avatar,
  })
}

export function forgetUser(userId: string): void {
  tokens.delete(userId)
}

/**
 * يزرع قائمة سيرفرات المستخدم في الكاش.
 *
 * نظير `rememberAccount`: يوفّر رحلة لديسكورد حين نعرف الجواب أصلًا. يستعمله
 * `scripts/ws-play.ts` ليشغّل الخادم بلا شبكة ولا قاعدة بيانات. ليس بابًا
 * خلفيًا: لا يفتحه متغيّر بيئة ولا طلب HTTP — من يستطيع نداءه يستطيع تعديل
 * `assertMember` نفسها لأنه داخل العملية.
 */
export function rememberGuilds(userId: string, guilds: GuildDTO[]): void {
  guildsCache.set(userId, guilds)
}

async function accessTokenFor(userId: string): Promise<string | null> {
  const held = tokens.get(userId)
  if (!held) return null
  if (held.expiresAt > Date.now()) return held.accessToken

  if (!held.refreshToken) {
    tokens.delete(userId)
    return null
  }
  const renewed = await refreshTokens(held.refreshToken)
  if (!renewed) {
    tokens.delete(userId)
    return null
  }
  tokens.set(userId, renewed)
  return renewed.accessToken
}

// ————————————————————— السيرفرات —————————————————————

const BOT_GUILDS_KEY = 'all'
const botGuildsCache = new TtlCache<string[]>(1, 60_000)
const botGuildsPending = new Map<string, Promise<string[]>>()

/** السيرفرات التي يعرفها البوت — الجدول هو مصدر الحقيقة لا كاش الجيتواي. */
function knownGuildIds(): Promise<string[]> {
  const hit = botGuildsCache.get(BOT_GUILDS_KEY)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(botGuildsPending, BOT_GUILDS_KEY, async () => {
    const rows = await prisma.guild.findMany({ select: { id: true } })
    const ids = rows.map((row) => row.id)
    botGuildsCache.set(BOT_GUILDS_KEY, ids)
    return ids
  })
}

const guildsCache = new TtlCache<GuildDTO[]>(2000, 60_000)
const guildsPending = new Map<string, Promise<GuildDTO[]>>()

/**
 * التقاطع بين سيرفرات المستخدم وسيرفرات البوت.
 *
 * المسار الأول برمز المستخدم (نداء واحد يعطي الأسماء والأيقونات مجانًا).
 * المسار البديل — بعد إعادة تشغيل الخادم — يسأل البوت عن عضوية المستخدم في كل
 * سيرفر يعرفه، وهو أبطأ لكنه يبقي الشاشة تعمل بدل أن تصير فارغة بلا تفسير.
 */
export function visibleGuilds(userId: string): Promise<GuildDTO[]> {
  const hit = guildsCache.get(userId)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(guildsPending, userId, async () => {
    const known = new Set(await knownGuildIds())
    const token = await accessTokenFor(userId)

    let out: GuildDTO[] | null = null

    if (token) {
      const mine = await userGuilds(token)
      if (mine) {
        out = mine
          .filter((guild) => known.has(guild.id))
          .map((guild) => ({ id: guild.id, name: guild.name, iconHash: guild.icon }))
      }
    }

    if (!out) {
      const checked = await Promise.all(
        [...known].map(async (guildId) => {
          if (!(await isMember(guildId, userId))) return null
          const guild = await botGuild(guildId)
          return guild ? { id: guild.id, name: guild.name, iconHash: guild.icon } : null
        }),
      )
      out = checked.filter((guild): guild is GuildDTO => guild !== null)
    }

    out.sort((a, b) => a.name.localeCompare(b.name, 'ar'))
    guildsCache.set(userId, out)
    return out
  })
}

/** يرمي 403 إن لم يكن السيرفر ضمن ما يراه هذا المستخدم. */
export async function assertMember(userId: string, guildId: string): Promise<void> {
  if (!/^\d{5,25}$/.test(guildId)) throw new HttpError(400, 'معرّف سيرفر غير صالح')
  const guilds = await visibleGuilds(userId)
  if (!guilds.some((guild) => guild.id === guildId)) {
    throw new HttpError(403, 'لا تملك وصولًا لهذا السيرفر، أو البوت ليس فيه')
  }
}

// ————————————————————— الحساب —————————————————————

const accountPending = new Map<string, Promise<AccountDTO>>()

export function accountOf(userId: string): Promise<AccountDTO> {
  const hit = accounts.get(userId)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(accountPending, userId, async () => {
    const token = await accessTokenFor(userId)
    if (token) {
      const me = await userMe(token)
      if (me) {
        rememberAccount(me)
        return { id: me.id, username: me.username, displayName: me.global_name, avatarHash: me.avatar }
      }
    }

    const user = await botUser(userId)
    if (user) {
      rememberAccount(user)
      return {
        id: user.id,
        username: user.username,
        displayName: user.global_name,
        avatarHash: user.avatar,
      }
    }

    // آخر ملاذ: معرّف بلا اسم أفضل من 500 — الواجهة تعرض المعرّف ولا تنهار
    return { id: userId, username: userId, displayName: null, avatarHash: null }
  })
}
