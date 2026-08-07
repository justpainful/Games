import { matches } from '../arabic.ts'
import type { Scene } from '../scenes/scene.ts'
import type { GameResult, Table } from './define.ts'
import { zeroScores } from './define.ts'

/**
 * نمط ألعاب الكتابة — يخدم ثلاث عشرة لعبة من أصل ثمانٍ وعشرين.
 *
 * كلها نفس الدورة حرفيًا: سؤال يظهر، اللاعبون يكتبون في الشات، أول إجابة صحيحة
 * تأخذ النقطة. الفرق بين «جمع» و«عواصم» و«أعلام» ثلاث دوال فقط: من أين يأتي
 * السؤال، وكيف تُتحقّق الإجابة، وكيف تُكشف عند فوات الوقت.
 */

export type Question = {
  /** ما يُعرض كبيرًا في منتصف الشاشة */
  prompt: string
  /** الإجابة الصحيحة */
  answer: string
  /** إجابات بديلة مقبولة */
  accept?: string[]
  /** سطر صغير تحت السؤال */
  hint?: string
}

export type TypingOptions = {
  rounds?: number
  /** مهلة الجولة الواحدة */
  roundMs?: number
  /** يسحب سؤالًا جديدًا. يُستدعى مرة لكل جولة. */
  pick(): Question
  /**
   * تدقيق مخصّص يحلّ محل المقارنة الافتراضية.
   *
   * ضروري للألعاب التي **شكل** الإجابة فيها جزء من التحدي: `matches` تُسقط
   * المسافات، فلعبة «فكك» بلا هذا التدقيق يفوز فيها من ينسخ الكلمة المعروضة
   * كما هي بدل أن يفكّها حروفًا.
   */
  check?(raw: string, question: Question): boolean
}

const DEFAULT_ROUNDS = 10
const DEFAULT_ROUND_MS = 25_000
const BREATH_MS = 2_500

export function typing(opts: TypingOptions) {
  const rounds = opts.rounds ?? DEFAULT_ROUNDS
  const roundMs = opts.roundMs ?? DEFAULT_ROUND_MS

  return async function play(table: Table): Promise<GameResult> {
    const scores = zeroScores(table.players)

    for (let round = 1; round <= rounds; round++) {
      if (table.aborted) break

      const q = opts.pick()

      const scene: Scene = {
        kind: 'round',
        game: table.brief,
        prompt: q.prompt,
        ...(q.hint ? { hint: q.hint } : {}),
        index: round,
        total: rounds,
      }

      // الوقت المتبقي في نص الرسالة لا في الصورة: عميل ديسكورد يحدّثه مجانًا،
      // بينما إعادة رندر الصورة كل ثانية تضرب rate limits فورًا.
      await table.show(scene, {
        text: `**الجولة ${round}/${rounds}** — اكتب إجابتك في الشات. ينتهي <t:${
          Math.floor(Date.now() / 1000) + Math.round(roundMs / 1000)
        }:R>`,
      })

      const hit = await table.waitChat(roundMs, (input) => {
        // اللاعبون فقط — المتفرّجون لا يسرقون الجولة
        if (!scores.has(input.userId)) return false
        return opts.check
          ? opts.check(input.text, q)
          : matches(input.text, q.answer, q.accept)
      })

      if (table.aborted) break

      if (hit) {
        scores.set(hit.userId, (scores.get(hit.userId) ?? 0) + 1)
        await table.say(`<@${hit.userId}> جاوب صح — **${q.answer}**`)
      } else {
        await table.say(`انتهى الوقت. الإجابة كانت **${q.answer}**`)
      }

      if (round < rounds) await table.sleep(BREATH_MS)
    }

    return finish(table, scores)
  }
}

/** ترتيب نهائي + مشهد الصدارة. مشترك بين كل ألعاب الكتابة. */
export async function finish(table: Table, scores: Map<string, number>): Promise<GameResult> {
  const rows = table.players
    .map((player) => ({ player, score: scores.get(player.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)

  const top = rows[0]
  // التعادل على الصدارة لا فائز فيه — إعلان فائز عشوائي يفسد اللعبة
  const tied = rows.filter((r) => r.score === top?.score).length > 1
  const winnerId = top && top.score > 0 && !tied ? top.player.id : null

  await table.show(
    { kind: 'standings', game: table.brief, rows, heading: 'النتيجة النهائية' },
    {
      text: winnerId
        ? `**الفائز** <@${winnerId}> بـ ${top?.score} نقطة`
        : 'انتهت اللعبة بلا فائز واضح.',
    },
  )

  return { winnerId, scores }
}
