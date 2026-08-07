import { loadGames } from '../games/all.ts'
import type { GameDef } from '../games/define.ts'
import { leaderboard, pointsOf, type Wallet } from '../players/points.ts'
import { accountOf, assertMember, visibleGuilds } from './access.ts'
import { memberProfile } from './discord.ts'
import { HttpError, json, requireUser, safeQuery, type Ctx, type Router } from './http.ts'
import { isSoloable } from './solo.ts'

/**
 * مسارات القراءة.
 *
 * الأشكال هنا مقيّدة بنماذج Swift في `ios/Games/Models/Account.swift` حرفيًا:
 * أي إعادة تسمية حقل هنا تكسر فك الترميز في التطبيق بصمت وتنتهي بـ
 * `Failure.decoding` أمام المستخدم. المفكّك في التطبيق يستعمل
 * `convertFromSnakeCase`، والمفاتيح بلا شرطة سفلية تمرّ كما هي — لذلك نرسل
 * camelCase مباشرة.
 */

const WALLETS: readonly (Wallet | 'total')[] = ['solo', 'team', 'roulette', 'total']

const MAX_ROWS = 100
const DEFAULT_ROWS = 25

/** الكتالوج يُقرأ من القرص مرة واحدة — `loadGames` تفتح ثمانية وعشرين ملفًا. */
let catalog: Promise<GameDef[]> | null = null

export function games(): Promise<GameDef[]> {
  catalog ??= loadGames()
  return catalog
}

async function me(ctx: Ctx): Promise<void> {
  const userId = requireUser(ctx)
  const [account, guilds] = await Promise.all([accountOf(userId), visibleGuilds(userId)])
  json(ctx.res, 200, { account, guilds })
}

async function points(ctx: Ctx): Promise<void> {
  const userId = requireUser(ctx)
  const guildId = ctx.params['guildId'] ?? ''
  await assertMember(userId, guildId)

  const wallets = await pointsOf(guildId, userId)
  // `total` تُحسب في Swift من الثلاثة — إرسالها هنا يفتح باب تعارض القيمتين
  json(ctx.res, 200, {
    roulette: wallets.roulette,
    team: wallets.team,
    solo: wallets.solo,
    gamesPlayed: wallets.gamesPlayed,
    wins: wallets.wins,
  })
}

async function leaders(ctx: Ctx): Promise<void> {
  const userId = requireUser(ctx)
  const guildId = ctx.params['guildId'] ?? ''
  await assertMember(userId, guildId)

  const asked = safeQuery(ctx.url, 'wallet', 16) ?? 'total'
  const wallet = WALLETS.find((known) => known === asked)
  if (!wallet) throw new HttpError(400, 'المحفظة غير معروفة — solo أو team أو roulette أو total')

  const askedLimit = Number(safeQuery(ctx.url, 'limit', 8) ?? DEFAULT_ROWS)
  const limit = Number.isFinite(askedLimit)
    ? Math.min(Math.max(Math.trunc(askedLimit), 1), MAX_ROWS)
    : DEFAULT_ROWS

  const rows = await leaderboard(guildId, wallet, limit)

  // الأسماء والأفتارات من الكاش؛ الطلبات المتوازية تُدمج داخل `memberProfile`
  const named = await Promise.all(
    rows.map(async (row, index) => {
      const profile = await memberProfile(guildId, row.userId)
      return {
        id: row.userId,
        displayName: profile?.displayName ?? row.userId,
        avatarHash: profile?.avatarHash ?? null,
        points: row.points,
        rank: index + 1,
      }
    }),
  )

  json(ctx.res, 200, named)
}

async function catalogRoute(ctx: Ctx): Promise<void> {
  requireUser(ctx)
  const all = await games()
  json(
    ctx.res,
    200,
    all.map((game) => ({
      key: game.key,
      name: game.name,
      aliases: game.aliases ?? [],
      tagline: game.tagline,
      howTo: game.howTo,
      minPlayers: game.players.min,
      maxPlayers: game.players.max,
      wallet: game.wallet,
      /** ما يمكن بدؤه من التطبيق وحده اليوم — بقيّتها تنتظر اللوبي الجماعي */
      soloable: isSoloable(game.key),
    })),
  )
}

export function mount(router: Router): void {
  router.get('/me', me)
  router.get('/points/:guildId', points)
  router.get('/leaders/:guildId', leaders)
  router.get('/games', catalogRoute)
}
