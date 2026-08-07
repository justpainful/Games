import { matches } from '../../arabic.ts'
import { dealer, loadData } from '../data.ts'
import { defineGame, zeroScores, type GameResult, type Table } from '../define.ts'
import { finish } from '../typing.ts'

/**
 * كت — إقصاء متتالٍ.
 *
 * تختلف عن بقية ألعاب الكتابة في أن الجولة لا تنتهي بأول إجابة صحيحة: كل من
 * أجاب ينجو، ومن سكت يخرج. لذلك لا تستخدم `typing()` بل تدير جولاتها بنفسها.
 */

type Trivia = { question: string; answer: string; accept?: string[] }

let deal: (() => Trivia) | undefined
function next(): Trivia {
  deal ??= dealer(loadData<Trivia>(import.meta.url, '../maarifa/data.json'))
  return deal()
}

const ROUND_MS = 22_000
const BREATH_MS = 2_500
/**
 * حارسان ضد اللعبة التي لا تنتهي.
 *
 * الجولة التي لا يجيب فيها أحد تُلغى ولا يخرج أحد — وهو السلوك العادل، لكنه
 * يعني أن `alive` لا ينقص أبدًا لو صمت الجميع، فتدور الحلقة إلى ما لا نهاية.
 * `MAX_ROUNDS` سقف مطلق، و`MAX_SILENT` ينهيها بعد ثلاث جولات صامتة متتالية.
 */
const MAX_ROUNDS = 40
const MAX_SILENT = 3

async function play(table: Table): Promise<GameResult> {
  const scores = zeroScores(table.players)
  let alive = table.players.map((p) => p.id)
  let round = 0
  let silent = 0

  while (alive.length > 1 && round < MAX_ROUNDS && silent < MAX_SILENT && !table.aborted) {
    round++
    const q = next()
    const aliveNow = new Set(alive)

    await table.show(
      {
        kind: 'round',
        game: table.brief,
        prompt: q.question,
        hint: `الباقون: ${alive.length} — من لا يجيب يخرج`,
        index: round,
        total: round + alive.length - 1,
      },
      {
        text:
          `**جولة الإقصاء ${round}** — أجب لتنجو. ينتهي <t:${
            Math.floor(Date.now() / 1000) + Math.round(ROUND_MS / 1000)
          }:R>\n` + `الباقون: ${alive.map((id) => `<@${id}>`).join('، ')}`,
      },
    )

    const answers = await table.collectChat(ROUND_MS, (input) => {
      if (!aliveNow.has(input.userId)) return false
      return matches(input.text, q.answer, q.accept)
    })

    if (table.aborted) break

    const survivors = new Set(answers.map((a) => a.userId))
    const out = alive.filter((id) => !survivors.has(id))

    // لو سقط الجميع في نفس الجولة تُلغى الجولة ولا تُفرَّغ اللعبة من لاعبيها
    if (survivors.size === 0) {
      silent++
      const left = MAX_SILENT - silent
      await table.say(
        `ما أجاب أحد. الإجابة **${q.answer}** — الجولة ملغاة ولا أحد يخرج.` +
          (left > 0 ? `` : ' تنتهي اللعبة لتوقّف الإجابات.'),
      )
      if (left > 0) await table.sleep(BREATH_MS)
      continue
    }
    silent = 0

    for (const id of survivors) scores.set(id, (scores.get(id) ?? 0) + 1)
    alive = alive.filter((id) => survivors.has(id))
    for (const id of out) table.drop(id)

    await table.say(
      out.length > 0
        ? `الإجابة **${q.answer}**. خرج: ${out.map((id) => `<@${id}>`).join('، ')}`
        : `الإجابة **${q.answer}**. نجا الجميع.`,
    )

    if (alive.length > 1) await table.sleep(BREATH_MS)
  }

  const last = alive[0]
  if (last && !table.aborted) await table.say(`**البطل** <@${last}> — آخر الباقين.`)

  return finish(table, scores)
}

export default defineGame({
  key: 'kt',
  name: 'كت',
  tagline: 'أجب لتنجو — من يسكت يخرج',
  howTo:
    'في كل جولة يظهر سؤال، ومن يجيب إجابة صحيحة قبل انتهاء الوقت ينجو، ومن لا يجيب يخرج. ' +
    'تستمر الجولات حتى يبقى لاعب واحد وهو البطل. إذا لم يجب أحد تُلغى الجولة ولا يخرج أحد.',
  players: { min: 3, max: 25 },
  wallet: 'solo',
  play,
})
