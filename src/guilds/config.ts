import type { RoleKind } from '@prisma/client'
import { prisma } from '../db/prisma.ts'
import { settings } from '../settings.ts'

/**
 * إعدادات السيرفر مع كاش في الذاكرة.
 *
 * تُقرأ في مسار **كل رسالة** لمعرفة البريفكس، فاستعلام قاعدة بيانات هنا يعني
 * استعلامًا لكل حرف يكتبه أي مستخدم في أي سيرفر. الكاش يُبطَل عند الكتابة فقط.
 */
export type GuildConfig = {
  id: string
  prefix: string
  prefixEnabled: boolean
  gamesChannel: string | null
  nickname: string | null
  roles: Record<RoleKind, Set<string>>
  authorized: Set<string>
  games: Map<string, { enabled: boolean; imageUrl: string | null; settings: unknown }>
}

const cache = new Map<string, GuildConfig>()

export async function guildConfig(guildId: string): Promise<GuildConfig> {
  const hit = cache.get(guildId)
  if (hit) return hit

  const row = await prisma.guild.upsert({
    where: { id: guildId },
    create: { id: guildId, prefix: settings.defaultPrefix },
    update: {},
    include: { roles: true, authorized: true, games: true },
  })

  const config: GuildConfig = {
    id: row.id,
    prefix: row.prefix,
    prefixEnabled: row.prefixEnabled,
    gamesChannel: row.gamesChannel,
    nickname: row.nickname,
    roles: {
      ADMIN: new Set(row.roles.filter((r) => r.kind === 'ADMIN').map((r) => r.roleId)),
      GAMES: new Set(row.roles.filter((r) => r.kind === 'GAMES').map((r) => r.roleId)),
      POINTS: new Set(row.roles.filter((r) => r.kind === 'POINTS').map((r) => r.roleId)),
    },
    authorized: new Set(row.authorized.map((a) => a.userId)),
    games: new Map(
      row.games.map((g) => [g.gameKey, { enabled: g.enabled, imageUrl: g.imageUrl, settings: g.settings }]),
    ),
  }

  cache.set(guildId, config)
  return config
}

/** يُستدعى بعد أي كتابة تمسّ إعدادات السيرفر. */
export function forgetGuild(guildId: string): void {
  cache.delete(guildId)
}

/** اللعبة مفعّلة ما لم يُعطّلها السيرفر صراحةً. */
export function isGameEnabled(config: GuildConfig, gameKey: string): boolean {
  return config.games.get(gameKey)?.enabled ?? true
}
