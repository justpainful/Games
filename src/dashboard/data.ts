import type { GameDef } from '../games/define.ts'
import { once, TtlCache } from '../api/cache.ts'
import { memberProfile } from '../api/discord.ts'
import { config } from '../api/env.ts'
import { loadGames } from '../games/all.ts'
import { guildConfig } from '../guilds/config.ts'
import { leaderboard, pointsOf } from '../players/points.ts'
import { discordGet } from './auth.ts'
import type {
  ChannelOption,
  GameSettingView,
  GuildSettingsView,
  LeaderView,
  ManagedGuild,
  RoleOption,
} from './types.ts'

/**
 * بناء نماذج العرض.
 *
 * الصفحات لا تلمس قاعدة البيانات ولا ديسكورد: تأخذ `GuildSettingsView` جاهزًا
 * فتصير قابلة للمعاينة بمعطيات وهمية. وكل ما يأتي من ديسكورد هنا (الرولات
 * والقنوات) مكشوف في **كل** فتح صفحة، فبلا كاش يعني ذلك طلبين لديسكورد لكل
 * ضغطة تبويب — و429 خلال دقائق.
 */

// ————————————————————— الألعاب —————————————————————

let gamesOnce: Promise<GameDef[]> | null = null

/** `loadGames` تمسح القرص وتستورد وحدات — مرة واحدة لعمر العملية تكفي. */
export function games(): Promise<GameDef[]> {
  gamesOnce ??= loadGames()
  return gamesOnce
}

/**
 * المفاتيح المسموح بها.
 *
 * مصدرها الوحيد هو ما على القرص. لو أخذنا `gameKey` من النموذج بلا هذه القائمة
 * لصار بإمكان أي طلب أن يزرع صفوفًا لا نهائية في `GameConfig` بمفاتيح مخترعة.
 */
export async function gameKeys(): Promise<Set<string>> {
  return new Set((await games()).map((game) => game.key))
}

// ————————————————————— رولات السيرفر وقنواته —————————————————————

const rolesCache = new TtlCache<RoleOption[]>(500, 5 * 60_000)
const rolesPending = new Map<string, Promise<RoleOption[]>>()
const channelsCache = new TtlCache<ChannelOption[]>(500, 5 * 60_000)
const channelsPending = new Map<string, Promise<ChannelOption[]>>()

function botAuth(): string | null {
  return config.discord.botToken ? `Bot ${config.discord.botToken}` : null
}

function row(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function num(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0
}

/**
 * رولات السيرفر الحقيقية.
 *
 * `@everyone` يُستبعد: معرّفه هو معرّف السيرفر نفسه، ومنحه دور «الإدارة» يعني
 * منح الجميع. قائمة تحوي خيارًا لا يجوز اختياره هي فخّ لا خيار.
 */
export function guildRoles(guildId: string): Promise<RoleOption[]> {
  const hit = rolesCache.get(guildId)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(rolesPending, guildId, async () => {
    const auth = botAuth()
    if (!auth) return []

    const body = await discordGet(`/guilds/${guildId}/roles`, auth)
    if (!Array.isArray(body)) return []

    const out: { option: RoleOption; position: number }[] = []
    for (const entry of body) {
      const item = row(entry)
      if (!item) continue
      const id = item['id']
      const name = item['name']
      if (typeof id !== 'string' || typeof name !== 'string') continue
      if (id === guildId) continue
      out.push({ option: { id, name, color: num(item['color']) }, position: num(item['position']) })
    }

    const roles = out.sort((a, b) => b.position - a.position).map((entry) => entry.option)
    rolesCache.set(guildId, roles)
    return roles
  })
}

/** قنوات نصية فقط — إرسال لعبة إلى قناة صوتية لا معنى له. */
const TEXTY = new Set([0, 5])

export function guildChannels(guildId: string): Promise<ChannelOption[]> {
  const hit = channelsCache.get(guildId)
  if (hit !== undefined) return Promise.resolve(hit)

  return once(channelsPending, guildId, async () => {
    const auth = botAuth()
    if (!auth) return []

    const body = await discordGet(`/guilds/${guildId}/channels`, auth)
    if (!Array.isArray(body)) return []

    const out: { option: ChannelOption; position: number }[] = []
    for (const entry of body) {
      const item = row(entry)
      if (!item) continue
      const id = item['id']
      const name = item['name']
      if (typeof id !== 'string' || typeof name !== 'string') continue
      if (!TEXTY.has(num(item['type']))) continue
      out.push({ option: { id, name }, position: num(item['position']) })
    }

    const channels = out.sort((a, b) => a.position - b.position).map((entry) => entry.option)
    channelsCache.set(guildId, channels)
    return channels
  })
}

/** يُستدعى إن تغيّرت رولات السيرفر أو قنواته خارج الداشبورد. */
export function forgetGuildLists(guildId: string): void {
  rolesCache.forget(guildId)
  channelsCache.forget(guildId)
}

// ————————————————————— الإعدادات —————————————————————

function asSettings(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

/**
 * الصفحة الكاملة لسيرفر واحد.
 *
 * يأخذ `ManagedGuild` لا `guildId`: هذا يجعل استدعاءه بلا فحص صلاحية مستحيلًا
 * عمليًا، لأن الشيء الوحيد الذي يُنتج `ManagedGuild` هو `guard.access`.
 */
export async function guildSettings(guild: ManagedGuild): Promise<GuildSettingsView> {
  const [saved, defs, allRoles, allChannels] = await Promise.all([
    guildConfig(guild.id),
    games(),
    guildRoles(guild.id),
    guildChannels(guild.id),
  ])

  const gameViews: GameSettingView[] = defs.map((def) => {
    const stored = saved.games.get(def.key)
    return {
      key: def.key,
      name: def.name,
      tagline: def.tagline,
      // اللعبة مفعّلة ما لم يُعطّلها السيرفر صراحةً
      enabled: stored?.enabled ?? true,
      imageUrl: stored?.imageUrl ?? null,
      settings: asSettings(stored?.settings),
    }
  })

  return {
    guild,
    prefix: saved.prefix,
    prefixEnabled: saved.prefixEnabled,
    bareCommands: saved.bareCommands,
    gamesChannel: saved.gamesChannel,
    nickname: saved.nickname,
    roles: {
      ADMIN: [...saved.roles.ADMIN],
      GAMES: [...saved.roles.GAMES],
      POINTS: [...saved.roles.POINTS],
    },
    authorized: [...saved.authorized],
    games: gameViews,
    allRoles,
    allChannels,
  }
}

// ————————————————————— الصدارة —————————————————————

/**
 * صفوف الصدارة بأسماء وأفتارات حقيقية.
 *
 * `memberProfile` مكاشة داخليًا ويوحّد الطلبات المتزامنة، فخمسة وعشرون صفًا لا
 * تعني خمسة وعشرين طلبًا لديسكورد إلا في أول فتح.
 */
export async function leaders(guildId: string, limit = 25): Promise<LeaderView[]> {
  const top = await leaderboard(guildId, 'total', Math.min(Math.max(limit, 1), 100))

  return Promise.all(
    top.map(async (entry) => {
      const [points, profile] = await Promise.all([
        pointsOf(guildId, entry.userId),
        memberProfile(guildId, entry.userId),
      ])
      return {
        userId: entry.userId,
        // من غادر السيرفر ولم يعد له ملف يبقى ظاهرًا بمعرّفه — حذفه من الجدول
        // يجعل مجموع النقاط لا يطابق ما يراه اللاعبون
        displayName: profile?.displayName ?? entry.userId,
        avatarHash: profile?.avatarHash ?? null,
        roulette: points.roulette,
        team: points.team,
        solo: points.solo,
        total: points.total,
        gamesPlayed: points.gamesPlayed,
        wins: points.wins,
      }
    }),
  )
}
