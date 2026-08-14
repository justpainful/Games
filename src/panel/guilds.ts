import type { Prisma, RoleKind } from '@prisma/client'
import { prisma } from '../db/prisma.ts'
import { loadGames } from '../games/all.ts'
import { forgetGuild, guildConfig } from '../guilds/config.ts'
import { tuningView } from '../games/tunables.ts'

/**
 * إعدادات السيرفرات لمِقود.
 *
 * ————————————————— لماذا لا يعيد استعمال `src/dashboard/data.ts` —————————————————
 *
 * ذاك يجلب الرتب والقنوات بطلبات REST، ولذلك يحتاج `api/env.ts` وتوكنًا مضبوطًا
 * فيه، ويكاشئ النتيجة خمس دقائق حتى لا يُرجم ديسكورد بطلبين لكل فتح صفحة.
 * ومِقود يعيش **داخل عمليّة البوت**، فالرتب والقنوات في ذاكرة `client.guilds`
 * محدَّثة لحظيًّا من الجيتواي: بلا طلب، وبلا كاش يتأخّر خمس دقائق عن رتبة
 * أُنشئت الآن، وبلا اعتماد على أسرار لا يحتاجها.
 */

export type Choice = { id: string; name: string; color?: number }

export type GuildBrief = {
  id: string
  name: string
  icon: string | null
  members: number
}

export type Knob = {
  key: string
  name: string
  about: string
  min: number
  max: number
  unit: string
  value: number
}

export type GameSetting = {
  key: string
  name: string
  tagline: string
  enabled: boolean
  minPlayers: number
  maxPlayers: number
  /** ما تقبل هذه اللعبة ضبطه. الفارغ يعني لعبة بلا مقابض، فلا تُعرض لها شاشة. */
  tuning: Knob[]
}

export type GuildView = {
  guild: GuildBrief
  prefix: string
  prefixEnabled: boolean
  bareCommands: boolean
  gamesChannel: string | null
  leadersChannel: string | null
  nickname: string | null
  roles: Record<RoleKind, string[]>
  authorized: string[]
  games: GameSetting[]
  allRoles: Choice[]
  allChannels: Choice[]
}

async function guilds(): Promise<Map<string, GuildBrief>> {
  const out = new Map<string, GuildBrief>()
  try {
    const { client } = await import('../discord/client.ts')
    if (!client.isReady()) return out
    for (const guild of client.guilds.cache.values()) {
      out.set(guild.id, {
        id: guild.id,
        name: guild.name,
        icon: guild.iconURL({ size: 128 }),
        members: guild.memberCount,
      })
    }
  } catch {
    // خارج عمليّة البوت لا سيرفرات — الشاشة تقول «البوت غير متصل» لا تسقط
  }
  return out
}

export async function listGuilds(): Promise<GuildBrief[]> {
  return [...(await guilds()).values()].sort((a, b) => b.members - a.members)
}

/**
 * رتب السيرفر وقنواته من ذاكرة الجيتواي.
 *
 * `@everyone` مستبعد: معرّفه هو معرّف السيرفر نفسه، ومنحه دور «الإدارة» يعني
 * منح الجميع. وقائمة فيها خيار لا يجوز اختياره فخّ لا خيار.
 */
async function options(guildId: string): Promise<{ roles: Choice[]; channels: Choice[] }> {
  try {
    const { client } = await import('../discord/client.ts')
    const guild = client.guilds.cache.get(guildId)
    if (!guild) return { roles: [], channels: [] }

    const roles = [...guild.roles.cache.values()]
      .filter((role) => role.id !== guildId && !role.managed)
      .sort((a, b) => b.position - a.position)
      .map((role) => ({ id: role.id, name: role.name, color: role.color }))

    // النصية وحدها: إرسال لعبة إلى قناة صوتية لا معنى له
    const channels = [...guild.channels.cache.values()]
      .filter((channel) => channel.type === 0 || channel.type === 5)
      .sort((a, b) => ('rawPosition' in a && 'rawPosition' in b ? a.rawPosition - b.rawPosition : 0))
      .map((channel) => ({ id: channel.id, name: channel.name }))

    return { roles, channels }
  } catch {
    return { roles: [], channels: [] }
  }
}

export async function guildView(guildId: string): Promise<GuildView | null> {
  const brief = (await guilds()).get(guildId)
  if (!brief) return null

  const [saved, defs, lists, row] = await Promise.all([
    guildConfig(guildId),
    loadGames(),
    options(guildId),
    prisma.guild.findUnique({ where: { id: guildId }, select: { leadersChannel: true } }),
  ])

  return {
    guild: brief,
    prefix: saved.prefix,
    prefixEnabled: saved.prefixEnabled,
    bareCommands: saved.bareCommands,
    gamesChannel: saved.gamesChannel,
    leadersChannel: row?.leadersChannel ?? null,
    nickname: saved.nickname,
    roles: {
      ADMIN: [...saved.roles.ADMIN],
      GAMES: [...saved.roles.GAMES],
      POINTS: [...saved.roles.POINTS],
    },
    authorized: [...saved.authorized],
    games: defs.map((def) => ({
      key: def.key,
      name: def.name,
      tagline: def.tagline,
      // اللعبة مفعّلة ما لم يُعطّلها السيرفر صراحةً
      enabled: saved.games.get(def.key)?.enabled ?? true,
      minPlayers: def.players.min,
      maxPlayers: def.players.max,
      tuning: tuningView(def, saved),
    })),
    allRoles: lists.roles,
    allChannels: lists.channels,
  }
}

// ————————————————————— الكتابة —————————————————————

export type Change =
  | { kind: 'prefix'; value: string }
  | { kind: 'prefixEnabled'; value: boolean }
  | { kind: 'bareCommands'; value: boolean }
  | { kind: 'gamesChannel'; value: string | null }
  | { kind: 'leadersChannel'; value: string | null }
  | { kind: 'nickname'; value: string | null }
  | { kind: 'role'; role: RoleKind; roleId: string; value: boolean }
  | { kind: 'authorized'; userId: string; value: boolean }
  | { kind: 'game'; gameKey: string; value: boolean }
  | { kind: 'knob'; gameKey: string; field: string; value: number }

const KINDS: readonly RoleKind[] = ['ADMIN', 'GAMES', 'POINTS']
const SNOWFLAKE = /^\d{15,25}$/

/**
 * يقرأ فعلًا من JSON بلا أن يصدّق شيئًا منه.
 *
 * كل معرّف يُقاس بشكل السنوفليك، وكل مفتاح لعبة يُطابق ما على القرص. بدون ذلك
 * يزرع طلب واحد صفوفًا لا نهائية في `GameConfig` بمفاتيح مخترعة، وتصير جداول
 * السيرفر مكبًّا لما يُرسل إليها.
 */
export async function readChange(body: unknown): Promise<Change | null> {
  if (typeof body !== 'object' || body === null) return null
  const row = body as Record<string, unknown>
  const kind = row['kind']
  const value = row['value']

  const text = (max: number): string | null => {
    if (typeof value !== 'string') return null
    const trimmed = value.trim()
    return trimmed.length === 0 || trimmed.length > max ? null : trimmed
  }
  const flag = typeof value === 'boolean' ? value : null
  const idOrNull = (): string | null | undefined => {
    if (value === null || value === '') return null
    return typeof value === 'string' && SNOWFLAKE.test(value) ? value : undefined
  }

  switch (kind) {
    case 'prefix': {
      const prefix = text(5)
      return prefix ? { kind: 'prefix', value: prefix } : null
    }
    case 'prefixEnabled':
      return flag === null ? null : { kind: 'prefixEnabled', value: flag }
    case 'bareCommands':
      return flag === null ? null : { kind: 'bareCommands', value: flag }
    case 'gamesChannel': {
      const id = idOrNull()
      return id === undefined ? null : { kind: 'gamesChannel', value: id }
    }
    case 'leadersChannel': {
      const id = idOrNull()
      return id === undefined ? null : { kind: 'leadersChannel', value: id }
    }
    case 'nickname': {
      if (value === null || value === '') return { kind: 'nickname', value: null }
      const name = text(32)
      return name ? { kind: 'nickname', value: name } : null
    }
    case 'role': {
      const role = KINDS.find((known) => known === row['role'])
      const roleId = row['roleId']
      if (!role || typeof roleId !== 'string' || !SNOWFLAKE.test(roleId) || flag === null) return null
      return { kind: 'role', role, roleId, value: flag }
    }
    case 'authorized': {
      const userId = row['userId']
      if (typeof userId !== 'string' || !SNOWFLAKE.test(userId) || flag === null) return null
      return { kind: 'authorized', userId, value: flag }
    }
    case 'game': {
      const gameKey = row['gameKey']
      if (typeof gameKey !== 'string' || flag === null) return null
      const known = new Set((await loadGames()).map((game) => game.key))
      return known.has(gameKey) ? { kind: 'game', gameKey, value: flag } : null
    }
    case 'knob': {
      // المقبض يُطابق ما تعلنه اللعبة نفسها، لا ما يُرسل. وبدون ذلك يصير عمود
      // الإعدادات مكبًّا لحقول لا يقرؤها أحد — وهو بالضبط ما كان عليه قبل هذا.
      const gameKey = row['gameKey']
      const field = row['field']
      if (typeof gameKey !== 'string' || typeof field !== 'string') return null
      if (typeof value !== 'number' || !Number.isFinite(value)) return null

      const game = (await loadGames()).find((one) => one.key === gameKey)
      const knob = game?.tunables?.find((one) => one.key === field)
      if (!knob) return null

      const clamped = Math.min(knob.max, Math.max(knob.min, Math.round(value)))
      return { kind: 'knob', gameKey, field, value: clamped }
    }
    default:
      return null
  }
}

/** يطبّق التغيير ويعيد سطرًا يُعرض للمستخدم. */
export async function applyChange(guildId: string, change: Change): Promise<string> {
  const set = async (data: Record<string, unknown>): Promise<void> => {
    await prisma.guild.update({ where: { id: guildId }, data })
  }

  switch (change.kind) {
    case 'prefix':
      await set({ prefix: change.value })
      forgetGuild(guildId)
      return `البادئة صارت ${change.value}`

    case 'prefixEnabled':
      await set({ prefixEnabled: change.value })
      forgetGuild(guildId)
      return change.value ? 'البادئة شغّالة' : 'البادئة مطفأة'

    case 'bareCommands':
      await set({ bareCommands: change.value })
      forgetGuild(guildId)
      return change.value ? 'الأوامر بلا بادئة شغّالة' : 'الأوامر بلا بادئة مطفأة'

    case 'gamesChannel':
      await set({ gamesChannel: change.value })
      forgetGuild(guildId)
      return change.value ? 'الألعاب صارت في قناة واحدة' : 'الألعاب تبدأ في أي قناة'

    case 'leadersChannel':
      // الرسالة المحفوظة تُمسح مع القناة: معرّف رسالة في قناة أخرى لا يُحرَّر،
      // فيبقى المؤقّت يحاول تحرير رسالة ميتة إلى الأبد
      await set({ leadersChannel: change.value, leadersMessage: null })
      forgetGuild(guildId)
      return change.value ? 'قناة الصدارة انضبطت' : 'قناة الصدارة أُلغيت'

    case 'nickname':
      await set({ nickname: change.value })
      forgetGuild(guildId)
      return change.value ? `اسم البوت صار ${change.value}` : 'رجع الاسم الأصلي'

    case 'role': {
      const where = { guildId_roleId_kind: { guildId, roleId: change.roleId, kind: change.role } }
      if (change.value) {
        await prisma.guildRole.upsert({
          where,
          create: { guildId, roleId: change.roleId, kind: change.role },
          update: {},
        })
      } else {
        await prisma.guildRole.deleteMany({
          where: { guildId, roleId: change.roleId, kind: change.role },
        })
      }
      forgetGuild(guildId)
      return change.value ? 'الرتبة أُضيفت' : 'الرتبة أُزيلت'
    }

    case 'authorized': {
      if (change.value) {
        await prisma.authorizedUser.upsert({
          where: { guildId_userId: { guildId, userId: change.userId } },
          create: { guildId, userId: change.userId },
          update: {},
        })
      } else {
        await prisma.authorizedUser.deleteMany({ where: { guildId, userId: change.userId } })
      }
      forgetGuild(guildId)
      return change.value ? 'صار مصرَّحًا له' : 'أُلغي تصريحه'
    }

    case 'knob': {
      // دمج لا استبدال: كل مقبض يُرسل وحده، وكتابة الكائن كاملًا تمحو أخواته
      const current = (await guildConfig(guildId)).games.get(change.gameKey)?.settings
      const before =
        typeof current === 'object' && current !== null && !Array.isArray(current)
          ? (current as Prisma.JsonObject)
          : {}
      const merged = { ...before, [change.field]: change.value } satisfies Prisma.InputJsonObject

      await prisma.gameConfig.upsert({
        where: { guildId_gameKey: { guildId, gameKey: change.gameKey } },
        create: { guildId, gameKey: change.gameKey, settings: merged },
        update: { settings: merged },
      })
      forgetGuild(guildId)
      return 'انضبط'
    }

    case 'game': {
      await prisma.gameConfig.upsert({
        where: { guildId_gameKey: { guildId, gameKey: change.gameKey } },
        create: { guildId, gameKey: change.gameKey, enabled: change.value },
        update: { enabled: change.value },
      })
      forgetGuild(guildId)
      return change.value ? 'اللعبة شُغّلت' : 'اللعبة أُطفئت'
    }
  }
}
