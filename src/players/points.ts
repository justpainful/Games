import { prisma } from '../db/prisma.ts'

/**
 * محافظ النقاط الثلاث كما في شاشة «نقاطي»:
 * الروليت منفصلة لأنها نقاط حظ لا مهارة، والجماعية عن الفردية لأن
 * لوحتَي الصدارة مختلفتان.
 */
export type Wallet = 'roulette' | 'team' | 'solo'

const FIELD: Record<Wallet, 'roulettePoints' | 'teamPoints' | 'soloPoints'> = {
  roulette: 'roulettePoints',
  team: 'teamPoints',
  solo: 'soloPoints',
}

export type PlayerPoints = {
  roulette: number
  team: number
  solo: number
  total: number
  gamesPlayed: number
  wins: number
}

export async function award(
  guildId: string,
  userId: string,
  wallet: Wallet,
  amount: number,
): Promise<void> {
  if (amount === 0) return
  const field = FIELD[wallet]
  await prisma.player.upsert({
    where: { guildId_userId: { guildId, userId } },
    create: { guildId, userId, [field]: amount },
    update: { [field]: { increment: amount } },
  })
}

/** يمنح دفعة واحدة في معاملة — يُستخدم في نهاية اللعبة لكل اللاعبين معًا. */
export async function awardMany(
  guildId: string,
  wallet: Wallet,
  scores: Map<string, number>,
): Promise<void> {
  const entries = [...scores].filter(([, n]) => n !== 0)
  if (entries.length === 0) return
  const field = FIELD[wallet]
  await prisma.$transaction(
    entries.map(([userId, amount]) =>
      prisma.player.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, [field]: amount },
        update: { [field]: { increment: amount } },
      }),
    ),
  )
}

export async function recordPlayed(
  guildId: string,
  userIds: string[],
  winnerId?: string | null,
): Promise<void> {
  if (userIds.length === 0) return
  await prisma.$transaction(
    userIds.map((userId) =>
      prisma.player.upsert({
        where: { guildId_userId: { guildId, userId } },
        create: { guildId, userId, gamesPlayed: 1, wins: userId === winnerId ? 1 : 0 },
        update: {
          gamesPlayed: { increment: 1 },
          ...(userId === winnerId ? { wins: { increment: 1 } } : {}),
        },
      }),
    ),
  )
}

export async function pointsOf(guildId: string, userId: string): Promise<PlayerPoints> {
  const row = await prisma.player.findUnique({ where: { guildId_userId: { guildId, userId } } })
  const roulette = row?.roulettePoints ?? 0
  const team = row?.teamPoints ?? 0
  const solo = row?.soloPoints ?? 0
  return {
    roulette,
    team,
    solo,
    total: roulette + team + solo,
    gamesPlayed: row?.gamesPlayed ?? 0,
    wins: row?.wins ?? 0,
  }
}

export type LeaderRow = { userId: string; points: number }

export async function leaderboard(
  guildId: string,
  wallet: Wallet | 'total',
  limit = 10,
): Promise<LeaderRow[]> {
  // المجموع لا يمكن ترتيبه بفهرس، فيُقرأ عدد محدود ثم يُرتّب في الذاكرة
  if (wallet === 'total') {
    const rows = await prisma.player.findMany({ where: { guildId }, take: 500 })
    return rows
      .map((r) => ({ userId: r.userId, points: r.roulettePoints + r.teamPoints + r.soloPoints }))
      .sort((a, b) => b.points - a.points)
      .slice(0, limit)
  }

  const field = FIELD[wallet]
  const rows = await prisma.player.findMany({
    where: { guildId },
    orderBy: { [field]: 'desc' },
    take: limit,
  })
  return rows.map((r) => ({ userId: r.userId, points: r[field] }))
}
