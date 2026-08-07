import { once, TtlCache } from '../api/cache.ts'
import { prisma } from '../db/prisma.ts'
import { discordGet, oauthTokenFor } from './auth.ts'
import type { Access, ManagedGuild, WebUser } from './types.ts'

/**
 * من يملك تعديل هذا السيرفر.
 *
 * **هذا الملف هو كل الأمن في الداشبورد.** الجلسة تثبت «من أنت» فقط؛ لا شيء
 * فيها يقول أيّ سيرفر يخصّك. ولأن معرّف السيرفر يأتي من المسار — أي من
 * المستخدم — فإن أي مسار لا يمرّ من هنا يعني أن معرفة الـ id وحدها تكفي
 * لتعديل إعدادات أي سيرفر في العالم. لذلك `access` تُستدعى في **كل** طلب،
 * عرضًا وكتابةً، لا مرة واحدة عند الدخول.
 *
 * شرطان معًا:
 *  1. `MANAGE_GUILD` في ذلك السيرفر — أو ملكيته.
 *  2. البوت موجود في السيرفر (تقاطع مع جدول `Guild`).
 */

/** بِت `MANAGE_GUILD` في أذونات ديسكورد. */
const MANAGE_GUILD = 0x20n

/** معرّفات ديسكورد أرقام من 17 إلى 20 خانة. */
export function isSnowflake(value: string): boolean {
  return /^\d{17,20}$/.test(value)
}

/** صفّ من `/users/@me/guilds` بعد التحقّق من أنواعه. */
export type GuildGrant = {
  id: string
  name: string
  iconHash: string | null
  permissions: bigint
  owner: boolean
}

/**
 * المالك يمرّ دائمًا: ديسكورد يعطيه كل الأذونات ضمنًا، لكن بعض الردود القديمة
 * تُرجع `permissions` منقوصة له، والاعتماد على البِت وحده يقفل الباب في وجه
 * صاحب السيرفر نفسه.
 */
export function canManage(grant: GuildGrant): boolean {
  return grant.owner || (grant.permissions & MANAGE_GUILD) === MANAGE_GUILD
}

/** تحويل خام إلى `GuildGrant` — كل حقل يُفحص، ولا يُصدَّق شيء من الشبكة. */
export function asGrant(value: unknown): GuildGrant | null {
  if (typeof value !== 'object' || value === null) return null
  const row = value as Record<string, unknown>
  const id = row['id']
  const name = row['name']
  if (typeof id !== 'string' || !isSnowflake(id)) return null
  if (typeof name !== 'string') return null

  const rawPermissions = row['permissions']
  let permissions = 0n
  if (typeof rawPermissions === 'string' && /^\d{1,25}$/.test(rawPermissions)) {
    permissions = BigInt(rawPermissions)
  } else if (typeof rawPermissions === 'number' && Number.isSafeInteger(rawPermissions)) {
    permissions = BigInt(rawPermissions)
  }

  const icon = row['icon']
  return {
    id,
    name,
    iconHash: typeof icon === 'string' ? icon : null,
    permissions,
    owner: row['owner'] === true,
  }
}

/**
 * السيرفرات التي يحقّ له إدارتها — بما فيها ما لا بوت فيه.
 *
 * لا نحذف عديمة البوت هنا: الصفحة تعرضها بزرّ دعوة، وإخفاؤها يجعل المستخدم
 * يظنّ أن سيرفره اختفى. `botPresent=false` يمنع الكتابة لاحقًا عبر `accessFrom`.
 */
export function manageable(
  grants: readonly GuildGrant[],
  botGuilds: ReadonlySet<string>,
): ManagedGuild[] {
  return grants
    .filter(canManage)
    .map((grant) => ({
      id: grant.id,
      name: grant.name,
      iconHash: grant.iconHash,
      botPresent: botGuilds.has(grant.id),
    }))
    .sort((a, b) => {
      if (a.botPresent !== b.botPresent) return a.botPresent ? -1 : 1
      return a.name.localeCompare(b.name, 'ar')
    })
}

/**
 * القرار خالصًا: نفس المدخلات تعطي نفس النتيجة بلا شبكة ولا قاعدة بيانات.
 * هذا ما يجعل قلب الأمن قابلًا للاختبار في `scripts/dash-check.ts`.
 */
export function accessFrom(
  grants: readonly GuildGrant[],
  botGuilds: ReadonlySet<string>,
  guildId: string,
): Access {
  if (!isSnowflake(guildId)) return { allowed: false, reason: 'معرّف سيرفر غير صالح.' }

  const grant = grants.find((row) => row.id === guildId)
  // نفس الرسالة لمن ليس عضوًا ولمن هو عضو بلا صلاحية: التمييز بينهما يكشف
  // للفضولي أن السيرفر موجود وأنه فيه
  if (!grant || !canManage(grant)) {
    return { allowed: false, reason: 'لا تملك صلاحية «إدارة السيرفر» هنا.' }
  }

  if (!botGuilds.has(guildId)) {
    return { allowed: false, reason: 'البوت ليس في هذا السيرفر — أضِفه أولًا ثم أعد المحاولة.' }
  }

  return {
    allowed: true,
    guild: { id: grant.id, name: grant.name, iconHash: grant.iconHash, botPresent: true },
  }
}

// ————————————————————— الجلب —————————————————————

const BOT_GUILDS_KEY = 'all'
const botGuildsCache = new TtlCache<string[]>(1, 60_000)
const botGuildsPending = new Map<string, Promise<string[]>>()

/** جدول `Guild` هو مصدر الحقيقة لوجود البوت، لا كاش الجيتواي. */
export function botGuildIds(): Promise<Set<string>> {
  const hit = botGuildsCache.get(BOT_GUILDS_KEY)
  if (hit !== undefined) return Promise.resolve(new Set(hit))

  return once(botGuildsPending, BOT_GUILDS_KEY, async () => {
    const rows = await prisma.guild.findMany({ select: { id: true } })
    const ids = rows.map((row) => row.id)
    botGuildsCache.set(BOT_GUILDS_KEY, ids)
    return ids
  }).then((ids) => new Set(ids))
}

const grantsCache = new TtlCache<GuildGrant[]>(2000, 60_000)
const grantsPending = new Map<string, Promise<GuildGrant[] | null>>()

/**
 * `null` = لا رمز OAuth صالح لهذا المستخدم (أعيد تشغيل الخادم، أو سحب الإذن).
 *
 * لا مسار بديل بتوكن البوت هنا — على عكس الـ API. البوت يستطيع أن يخبرنا بعضوية
 * المستخدم لكنه لا يرى **أذونات** المستخدم إلا بحساب الأدوار يدويًا، وحساب خاطئ
 * في هذا الموضع بالذات يعني منح صلاحية إدارة لمن لا يملكها. الفشل الآمن هو أن
 * نطلب تسجيل دخول جديدًا.
 */
export function grantsFor(user: WebUser): Promise<GuildGrant[] | null> {
  const hit = grantsCache.get(user.id)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(grantsPending, user.id, async () => {
    const token = await oauthTokenFor(user.id)
    if (!token) return null

    const body = await discordGet('/users/@me/guilds?limit=200', `Bearer ${token}`)
    if (!Array.isArray(body)) return null

    const grants = body.map(asGrant).filter((grant): grant is GuildGrant => grant !== null)
    grantsCache.set(user.id, grants)
    return grants
  })
}

/** يُستدعى بعد أي تغيير قد يبدّل الصورة (خروج، تبديل حساب). */
export function forgetGrants(userId: string): void {
  grantsCache.forget(userId)
}

/** السيرفرات الصالحة للعرض في `/dash` — مع `botPresent`. */
export async function managedGuilds(user: WebUser): Promise<ManagedGuild[]> {
  const grants = await grantsFor(user)
  if (!grants) return []
  return manageable(grants, await botGuildIds())
}

/** الفحص الوحيد. يسبق كل عرض وكل كتابة. */
export async function access(user: WebUser, guildId: string): Promise<Access> {
  if (!isSnowflake(guildId)) return { allowed: false, reason: 'معرّف سيرفر غير صالح.' }

  const grants = await grantsFor(user)
  if (!grants) {
    return { allowed: false, reason: 'انتهت جلستك مع ديسكورد — سجّل الدخول من جديد.' }
  }
  return accessFrom(grants, await botGuildIds(), guildId)
}
