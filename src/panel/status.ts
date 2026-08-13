import { loadGames } from '../games/all.ts'
import { allSessions } from '../games/running.ts'

/**
 * حالة البوت الحيّة كما تُعرض في الشاشة الأولى.
 *
 * ————————————————— لماذا كل استيراد كسول —————————————————
 *
 * `discord/client.ts` يسحب `settings.ts` وهو يرمي بلا `DISCORD_TOKEN`، و
 * `db/prisma.ts` يفتح وصلة عند الاستيراد. ومِقود يجب أن يفتح ويقول «البوت
 * غير متصل» بدل أن يسقط هو نفسه: لوحة تحكّم تموت مع ما تراقبه لا تنفع في
 * اللحظة التي يُحتاج فيها إليها.
 */

export type Status = {
  bot: {
    online: boolean
    tag: string | null
    id: string | null
    avatar: string | null
    pingMs: number | null
    upSeconds: number | null
    guilds: number
    members: number
  }
  games: { count: number; running: number }
  db: { ok: boolean; ms: number | null; error: string | null }
  host: {
    node: string
    platform: string
    rssMb: number
    upSeconds: number
    pid: number
  }
  live: LiveSession[]
}

export type LiveSession = {
  game: string
  guildId: string
  guildName: string | null
  channelId: string
  channelName: string | null
  hostId: string
  startedAt: number
  attempts: number
}

let gameCount = 0

async function botFacts(): Promise<Status['bot'] & { guildNames: Map<string, string> }> {
  const empty = {
    online: false,
    tag: null,
    id: null,
    avatar: null,
    pingMs: null,
    upSeconds: null,
    guilds: 0,
    members: 0,
    guildNames: new Map<string, string>(),
  }

  try {
    const { client } = await import('../discord/client.ts')
    if (!client.isReady()) return empty

    const names = new Map<string, string>()
    let members = 0
    for (const guild of client.guilds.cache.values()) {
      names.set(guild.id, guild.name)
      members += guild.memberCount
    }

    return {
      online: true,
      tag: client.user.tag,
      id: client.user.id,
      avatar: client.user.displayAvatarURL({ size: 128 }),
      // ping قبل أول heartbeat يكون -1، وعرضه رقمًا سالبًا يربك أكثر مما يفيد
      pingMs: client.ws.ping >= 0 ? Math.round(client.ws.ping) : null,
      upSeconds: client.uptime === null ? null : Math.floor(client.uptime / 1000),
      guilds: client.guilds.cache.size,
      members,
      guildNames: names,
    }
  } catch {
    return empty
  }
}

async function dbFacts(): Promise<Status['db']> {
  const started = Date.now()
  try {
    const { prisma } = await import('../db/prisma.ts')
    await prisma.$queryRaw`SELECT 1`
    return { ok: true, ms: Date.now() - started, error: null }
  } catch (err) {
    return { ok: false, ms: null, error: err instanceof Error ? err.message.slice(0, 160) : 'خطأ' }
  }
}

export async function status(): Promise<Status> {
  if (gameCount === 0) gameCount = (await loadGames().catch(() => [])).length

  const [bot, db] = await Promise.all([botFacts(), dbFacts()])
  const { guildNames, ...botOut } = bot

  const live = allSessions().map((session) => ({
    game: session.game.name,
    guildId: session.guildId,
    guildName: guildNames.get(session.guildId) ?? null,
    channelId: session.channelId,
    channelName: null,
    hostId: session.hostId,
    startedAt: session.startedAt,
    attempts: session.attempts,
  }))

  return {
    bot: botOut,
    games: { count: gameCount, running: live.length },
    db,
    host: {
      node: process.version,
      platform: process.platform,
      rssMb: Math.round(process.memoryUsage().rss / 1024 / 1024),
      upSeconds: Math.floor(process.uptime()),
      pid: process.pid,
    },
    live,
  }
}
