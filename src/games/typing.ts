import { matches } from '../arabic.ts'
import { EMOJI } from '../design/emoji.ts'
import type { PlayerView, Scene } from '../scenes/scene.ts'
import type { GameResult, Table, Tunable } from './define.ts'
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

/**
 * مقابض ألعاب الكتابة.
 *
 * واحدة مشتركة لا نسخة لكل لعبة: العقد نفسه في كلّها — جولات ومهلة — وتكرارها
 * ثلاث عشرة مرّة يعني ثلاثة عشر مدًى تتفرّق عند أول تعديل.
 */
export const TYPING_KNOBS: readonly Tunable[] = [
  {
    key: 'rounds',
    name: 'عدد الجولات',
    about: 'كم جولة في الفعالية. اللعبة المفتوحة جولة واحدة دائمًا مهما ضُبط هذا.',
    min: 1,
    max: 30,
    unit: 'جولة',
    fallback: DEFAULT_ROUNDS,
  },
  {
    key: 'roundSeconds',
    name: 'مدة الجولة',
    about: 'كم ثانية للإجابة قبل أن تنتهي الجولة.',
    min: 5,
    max: 180,
    unit: 'ثانية',
    fallback: DEFAULT_ROUND_MS / 1000,
  },
]


export function typing(opts: TypingOptions) {

  return async function play(table: Table): Promise<GameResult> {
    /**
     * اللعبة المفتوحة جولة واحدة، والفعالية عدد اللعبة.
     *
     * الفرق ليس في الرقم بل في العقد: اللعبة تُفتح لمن في القناة بلا انضمام،
     * فبقاؤها عشر جولات يحتجز القناة عشر دقائق لمن لم يطلبها. وجولة واحدة
     * تنتهي بنفسها، ومن أرادها ثانيةً كتب أمرها.
     *
     * و`table.open` يعلو على `opts.rounds` ولا يتنازل لها. كل لعبة مفتوحة
     * تعلن عشر جولات في تعريفها، فلو كان تفضيلها هو الحاكم لما تغيّر شيء
     * إطلاقًا: تبقى اللعبة عشر جولات، وتصير كل جولة فعالية عشرَ جولات فتنهار
     * المناوبة التي قامت عليها الفعالية. والعدد المعلن يخدم الفعالية وحدها.
     */
    /**
     * ما ضبطه السيرفر يعلو على ما كتبته اللعبة، وكلاهما يخضع لـ`table.open`.
     *
     * و`tune` تعيد صفرًا حين لا يضبط السيرفر شيئًا، والصفر خارج مدى المقبض،
     * فالسقوط إلى الافتراضيّ لا يحتاج نوعًا اختياريًّا ولا فحصًا لوجوده.
     */
    const asked = table.tune('rounds')
    const rounds = table.open ? 1 : asked > 0 ? asked : (opts.rounds ?? DEFAULT_ROUNDS)
    const askedSeconds = table.tune('roundSeconds')
    const roundMs = askedSeconds > 0 ? askedSeconds * 1000 : (opts.roundMs ?? DEFAULT_ROUND_MS)
    const single = rounds === 1

    /**
     * في اللعبة المفتوحة لا روستر مسبق: من أجاب صحيحًا دخل السجلّ حينها.
     *
     * `zeroScores` تبني الخريطة من `table.players`، وهي فارغة هنا لأن أحدًا
     * لم ينضم. ولو بقي الشرط `scores.has(userId)` كما هو لرُفض كل من كتب،
     * فتخرج اللعبة صامتة لا يفوز فيها أحد.
     */
    const scores = zeroScores(table.players)
    /** من شارك فعلًا: يبدأ بالمنضمّين، ويكبر بمن يجيب في الطاولة المفتوحة. */
    const roster = new Map(table.players.map((p) => [p.id, p]))

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
        // اللاعبون فقط في الفعالية — المتفرّجون لا يسرقون الجولة.
        // وفي اللعبة المفتوحة لا متفرّجين أصلًا: من في القناة لاعب.
        if (!table.open && !scores.has(input.userId)) return false
        return opts.check
          ? opts.check(input.text, q)
          : matches(input.text, q.answer, q.accept)
      })

      if (table.aborted) break

      if (hit) {
        if (!roster.has(hit.userId)) {
          roster.set(hit.userId, {
            id: hit.userId,
            name: hit.name ?? 'لاعب',
            avatar: hit.avatar ?? null,
          })
        }
        scores.set(hit.userId, (scores.get(hit.userId) ?? 0) + 1)
      }

      /**
       * الجولة الواحدة تُعلن مرة واحدة.
       *
       * كانت تُعلن مرتين: سطر «جاوب صح» ثم صورة نتيجة نهائية تقول الشيء نفسه
       * عن الشخص نفسه بعده بثانيتين. وذلك مقبول في عشر جولات لأن الصورة تلخّص
       * سباقًا، وثقيل في جولة واحدة لأن لا شيء ليُلخَّص. وفي الفعالية يتضاعف
       * الثقل: كل جولة صورة.
       */
      if (!single) {
        await table.say(
          hit
            ? `<@${hit.userId}> جاوب صح — **${q.answer}**`
            : `انتهى الوقت. الإجابة كانت **${q.answer}**`,
        )
      } else {
        await announce(table, hit?.userId ?? null, q.answer, scores.get(hit?.userId ?? '') ?? 0)
      }

      if (round < rounds) await table.sleep(BREATH_MS)
    }

    if (single) return settle(scores)
    return finish(table, scores, [...roster.values()])
  }
}

/**
 * إعلان الجولة الواحدة: سطر واحد وزر معطّل يحمل النقطة.
 *
 * بلا صورة عمدًا. الصورة تخدم مقارنة بين لاعبين أو لوحة تتبدّل، وليس هنا أيٌّ
 * منهما: اسم واحد ورقم واحد. وإرسالها يكلّف رندرًا ورفعًا ونصف شاشة عند من
 * يقرأ من جواله، مقابل معلومة تسعها كلمتان.
 *
 * والنقطة على زر لا داخل النص: الرقم في وسط الجملة يُقرأ مع الكلام ويضيع،
 * وعلى زرٍّ يقف وحده فيُرى قبل أن يُقرأ.
 */
async function announce(
  table: Table,
  winnerId: string | null,
  answer: string,
  points: number,
): Promise<void> {
  if (!winnerId) {
    await table.say(`${EMOJI.st_timer} خلص الوقت وما جاوب أحد · الجواب **${answer}**`)
    return
  }

  await table.say(`${EMOJI.win_check} <@${winnerId}> سبق الجميع · الجواب **${answer}**`, {
    buttons: [
      {
        id: 'points:earned',
        label: pointsLabel(points),
        style: 'plain',
        disabled: true,
        emoji: EMOJI.win_star,
      },
    ],
  })
}

/** تمييز العدد: نقطة، نقطتان، ثم نقاط. «1 نقاط» يقرأها العربي خطأً مطبعيًا. */
function pointsLabel(points: number): string {
  if (points === 1) return 'نقطة'
  if (points === 2) return 'نقطتان'
  return `${points} نقاط`
}

/** نتيجة الجولة الواحدة بلا مشهد: الإعلان صدر مع الجولة نفسها. */
function settle(scores: Map<string, number>): GameResult {
  const best = [...scores.entries()].sort((a, b) => b[1] - a[1])[0]
  const winnerId = best && best[1] > 0 ? best[0] : null
  return { winnerId, scores }
}

/** ترتيب نهائي + مشهد الصدارة. مشترك بين كل ألعاب الكتابة. */
export async function finish(
  table: Table,
  scores: Map<string, number>,
  roster?: PlayerView[],
): Promise<GameResult> {
  // الطاولة المفتوحة لا روستر لها في `table.players`، فيُمرَّر من جمعته الجولة
  const rows = (roster ?? table.players)
    .map((player) => ({ player, score: scores.get(player.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)

  const top = rows[0]
  // التعادل على الصدارة لا فائز فيه — إعلان فائز عشوائي يفسد اللعبة
  const tied = rows.filter((r) => r.score === top?.score).length > 1
  const winnerId = top && top.score > 0 && !tied ? top.player.id : null

  await table.show(
    { kind: 'standings', game: table.brief, rows, heading: 'النتيجة النهائية' },
    {
      // هذا السطر يخدم كل ألعاب الكتابة، فوجهه هو وجه الفوز في البوت كلّه
      text: winnerId
        ? `${EMOJI.win_trophy} **الفائز** <@${winnerId}> بـ ${top?.score} نقطة`
        : `${EMOJI.st_users} انتهت اللعبة بلا فائز واضح.`,
    },
  )

  return { winnerId, scores }
}
