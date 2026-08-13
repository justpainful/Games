import { EMOJI } from '../design/emoji.ts'
import type { PlayerView } from '../scenes/scene.ts'
import type { GameDef, GameResult, Table } from './define.ts'

/**
 * فعالية: سلسلة جولات من ألعاب مفتوحة، لها فائز واحد فوق فائزي جولاتها.
 *
 * ————————————————— لماذا لا تُبنى فوق اللوبي —————————————————
 *
 * الفعالية هنا ليست لعبة طويلة، بل **إطار يشغّل ألعابًا**. ولذلك لا لوبي لها:
 * من يدخل القناة في منتصفها يشارك بالجولة التالية بلا استئذان، ومن يخرج لا
 * يوقف شيئًا. وهذا هو الفرق العملي بينها وبين مافيا: تلك تعرف أصحابها، وهذه
 * تعرف من أجاب.
 *
 * ————————————————— التوقّف على المشاركة لا الفوز —————————————————
 *
 * الشرط أن يبقى أحد **يحاول**، لا أن يفوز أحد. ولو قيست بالفوز لتوقّفت
 * الفعالية على سؤال صعب بينما عشرة يكتبون إجابات خاطئة، وذاك أنشط ما تكون.
 * فجولتان بلا محاولة واحدة تعنيان أن القناة خلت فعلًا.
 *
 * ————————————————— الدوران لا الخلط —————————————————
 *
 * الألعاب تتناوب جولة جولة لا تُشغَّل معًا: الجولة الأولى للأولى والثانية
 * للثانية ثم يعود الدور. وخلطها في جولة واحدة يفقد كل لعبة إيقاعها الذي
 * بُنيت عليه، ويجعل اللاعب لا يعرف ما يُنتظر منه.
 */

export type EventPlan = {
  games: GameDef[]
  /** يتوقّف عند بلوغ أيّهما أولًا */
  rounds?: number
  minutes?: number
  /**
   * أول من يبلغ هذا العدد يُنهي الفعالية بطلًا.
   *
   * وهو شرط مختلف عن الجولات والوقت: أولئك يقيسان طول الفعالية، وهذا يقيس
   * حسمها. وفعالية بلا هدف تنتهي بمن صادف أن كان أعلى عند انتهاء العدّاد،
   * وبهدفٍ تنتهي بمن بلغه — وبينهما فرق في شعور من يلعب.
   */
  target?: number
}

export type EventOutcome = {
  winner: PlayerView | null
  standings: { player: PlayerView; points: number }[]
  played: number
  stoppedBecause: 'rounds' | 'time' | 'idle' | 'target' | 'aborted'
}

/** جولتان متتاليتان بلا محاولة واحدة تُنهيان الفعالية. */
const IDLE_LIMIT = 2
const BREATH_MS = 3_000

export async function runEvent(
  table: Table,
  plan: EventPlan,
  play: (game: GameDef) => Promise<GameResult>,
): Promise<EventOutcome> {
  const totals = new Map<string, number>()
  const people = new Map<string, PlayerView>()
  const until = plan.minutes ? Date.now() + plan.minutes * 60_000 : null
  const maxRounds = plan.rounds ?? Infinity

  let played = 0
  let idle = 0
  let stoppedBecause: EventOutcome['stoppedBecause'] = 'rounds'
  let reached: string | null = null

  while (!table.aborted) {
    if (played >= maxRounds) {
      stoppedBecause = 'rounds'
      break
    }
    if (until !== null && Date.now() >= until) {
      stoppedBecause = 'time'
      break
    }
    if (idle >= IDLE_LIMIT) {
      stoppedBecause = 'idle'
      break
    }
    if (reached) {
      stoppedBecause = 'target'
      break
    }

    const game = plan.games[played % plan.games.length]
    if (!game) break

    await table.say(
      `${EMOJI.st_star} **الجولة ${played + 1}** · ${game.name}` +
        (plan.rounds ? ` من ${plan.rounds}` : '') +
        (until ? ` · تنتهي الفعالية <t:${Math.floor(until / 1000)}:R>` : ''),
    )

    const wroteBefore = table.attempts
    const result = await play(game)
    played += 1

    /**
     * المشاركة تُقاس بمن كتب لا بمن أصاب.
     *
     * كانت تُقاس بالنقاط، فجولة كتب فيها خمسة إجابات خاطئة تُحسب فارغة —
     * وقعت فعلًا: كُتبت إجابتان في جولة الأعلام ثم أعلنت الفعالية «ما حاول
     * أحد» وتوقّفت. والسؤال الصعب هو أكثر ما يُكتب فيه وأقلّ ما يُصاب.
     */
    const active = table.attempts > wroteBefore

    const scores = result.scores ?? new Map<string, number>()
    for (const [userId, points] of scores) {
      if (points <= 0) continue
      const next = (totals.get(userId) ?? 0) + points
      totals.set(userId, next)
      if (plan.target !== undefined && next >= plan.target && !reached) reached = userId
      const known = table.players.find((p) => p.id === userId)
      if (known && !people.has(userId)) people.set(userId, known)
    }

    idle = active ? 0 : idle + 1
    if (idle === 1 && !active) {
      await table.say(`${EMOJI.st_timer} ما حاول أحد هذه الجولة. جولة ثانية فاضية توقف الفعالية.`)
    }

    if (!table.aborted) await table.sleep(BREATH_MS)
  }

  if (table.aborted) stoppedBecause = 'aborted'

  const standings = [...totals.entries()]
    .map(([userId, points]) => ({
      player: people.get(userId) ?? { id: userId, name: 'لاعب', avatar: null },
      points,
    }))
    .sort((a, b) => b.points - a.points)

  // التعادل على الصدارة لا فائز فيه: فعالية طويلة تنتهي بقرعة تُفقد معناها
  const top = standings[0]
  const tied = standings.filter((row) => row.points === top?.points).length > 1
  const winner = top && !tied ? top.player : null

  return { winner, standings, played, stoppedBecause }
}

export const STOP_REASON: Record<EventOutcome['stoppedBecause'], string> = {
  rounds: 'اكتملت الجولات',
  time: 'انتهى وقت الفعالية',
  idle: 'ما حاول أحد جولتين متتاليتين',
  target: 'بلغ أحدهم نقاط الفوز',
  aborted: 'أُوقفت الفعالية',
}
