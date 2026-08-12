import { prisma } from '../db/prisma.ts'
import { pointsOf } from '../players/points.ts'
import type { CardScene, PlayerView } from '../scenes/scene.ts'
import type { Command } from './commands.ts'
import { playerView } from './players.ts'

/**
 * «بطاقة» — هوية اللاعب وخريطة نشاطه وأربعة أرقام.
 *
 * مستقلة عن «نقاطي»: تلك جواب «كم نقطة عندي؟» ويُقرأ في لمحة، وهذه جواب
 * «من أنا في هذا السيرفر؟» وتُقرأ مرة وتُحفظ. دمجهما يعني شاشة تخدم سؤالين
 * فلا تخدم أيًّا منهما.
 */

/** عشرون أسبوعًا: عمود لكل أسبوع، فتُقرأ الخريطة كتقويم لا كشريط. */
const WEEKS = 20
const DAYS = WEEKS * 7

const card: Command = {
  name: 'بطاقة',
  aliases: ['بطاقتي', 'كارد'],
  description: 'بطاقتك: نشاطك اليومي ونقاطك وفوزك',
  async run(ctx) {
    const targetId = mentionedId(ctx.args) ?? ctx.member.id
    const member = await ctx.member.guild.members.fetch(targetId).catch(() => null)
    const player: PlayerView = member
      ? await playerView(member)
      : { id: targetId, name: 'لاعب غادر', avatar: null }

    const points = await pointsOf(ctx.guildId, targetId)
    const days = await activity(ctx.guildId, targetId)
    const played = days.reduce((sum, day) => sum + day.games, 0)

    const scene: CardScene = {
      kind: 'card',
      player,
      days,
      stats: [
        { value: String(points.total), label: 'نقطة' },
        { value: String(points.gamesPlayed), label: 'لعبة' },
        { value: String(points.wins), label: 'فوز' },
        { value: `${streak(days)}`, label: 'أيام متتالية' },
      ],
    }

    await ctx.scene(
      scene,
      `**${player.name}** · ${points.total} نقطة · ${points.gamesPlayed} لعبة · ` +
        `${points.wins} فوز · ${played} لعبة في آخر ${WEEKS} أسابيع`,
    )
  },
}

/**
 * كم لعبة لعبها كل يوم في آخر عشرة أسابيع.
 *
 * تُقرأ من `participants` في سجلّ المباريات، وهو حقل أُضيف متأخرًا: ما قبله
 * من مباريات لا يحمل أسماء من لعبوها، فتظهر أيامه فارغة. هذا نقص بيانات لا
 * خطأ عرض، ولا سبيل لاستنتاج مشاركة لم تُسجَّل.
 */
async function activity(
  guildId: string,
  userId: string,
): Promise<{ date: string; games: number }[]> {
  const since = new Date()
  since.setHours(0, 0, 0, 0)
  since.setDate(since.getDate() - (DAYS - 1))

  const matches = await prisma.matchRecord
    .findMany({
      where: { guildId, startedAt: { gte: since }, participants: { has: userId } },
      select: { startedAt: true },
    })
    .catch(() => [])

  const counts = new Map<string, number>()
  for (const match of matches) {
    const key = dayKey(match.startedAt)
    counts.set(key, (counts.get(key) ?? 0) + 1)
  }

  // كل يوم له خانة وإن كان صفرًا: الفراغ نفسه معلومة، وحذفه يكذب على العين
  const out: { date: string; games: number }[] = []
  for (let back = DAYS - 1; back >= 0; back--) {
    const day = new Date(since)
    day.setDate(since.getDate() + (DAYS - 1 - back))
    const key = dayKey(day)
    out.push({ date: key, games: counts.get(key) ?? 0 })
  }
  return out
}

/** أطول سلسلة أيام متتالية انتهت اليوم أو أمس. */
function streak(days: { games: number }[]): number {
  let count = 0
  for (let i = days.length - 1; i >= 0; i--) {
    if ((days[i]?.games ?? 0) > 0) count++
    // يوم واحد فارغ في آخر الشريط لا يكسر السلسلة: قد لا يكون اللاعب لعب بعد
    else if (i < days.length - 1) break
  }
  return count
}

function dayKey(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** `<@123>` أو `<@!123>` في أول وسيط. */
function mentionedId(args: string[]): string | null {
  const match = /^<@!?(\d{5,})>$/.exec(args[0] ?? '')
  return match?.[1] ?? null
}

export const cardCommands: Command[] = [card]
