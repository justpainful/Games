import { matches } from '../../arabic.ts'
import type { Scene } from '../../scenes/scene.ts'
import { dealer, loadData } from '../data.ts'
import type { ChatInput, GameResult, Table } from '../define.ts'
import { defineGame, zeroScores } from '../define.ts'
import { finish } from '../typing.ts'

/**
 * «خمّن» وحدها من ألعاب الكتابة لا تركب `typing()`: قيمتها في أن التلميحات
 * تُكشف واحدًا بعد الآخر داخل الجولة الواحدة، ومن يخمّن من أول تلميح يستحق
 * نقطته أكثر ممن انتظر آخرها. هذا يحتاج حلقة داخل الجولة، لا سؤالًا واحدًا.
 */

type Riddle = { answer: string; hints: string[] }

const ROUNDS = 8
/** نافذة كل تلميح — ثلاثة تلميحات تعني جولة تقارب ستًا وثلاثين ثانية */
const HINT_MS = 12_000
const BREATH_MS = 2_500

let deal: (() => Riddle) | undefined
function next(): Riddle {
  deal ??= dealer(loadData<Riddle>(import.meta.url, 'data.json'))
  return deal()
}

/** ملف البيانات يُؤلَّف بيد بشر — نحرس ضد صف بلا تلميحات بدل أن نُسقط اللعبة. */
function hintsOf(riddle: Riddle): string[] {
  const raw = Array.isArray(riddle.hints) ? riddle.hints : []
  const clean = raw.filter((hint) => typeof hint === 'string' && hint.trim().length > 0)
  return clean.length > 0 ? clean : ['بلا تلميح — خمّن على حظّك']
}

async function play(table: Table): Promise<GameResult> {
  const scores = zeroScores(table.players)

  for (let round = 1; round <= ROUNDS; round++) {
    if (table.aborted) break

    const riddle = next()
    const hints = hintsOf(riddle)
    const revealed: string[] = []
    let hit: ChatInput | null = null

    for (let step = 0; step < hints.length; step++) {
      revealed.push(hints[step]!)

      const scene: Scene = {
        kind: 'round',
        game: table.brief,
        prompt: revealed.join(' — '),
        hint: `تلميح ${step + 1} من ${hints.length}`,
        index: round,
        total: ROUNDS,
      }

      const last = step === hints.length - 1
      const at = Math.floor(Date.now() / 1000) + Math.round(HINT_MS / 1000)
      const text = `**الجولة ${round}/${ROUNDS}** — خمّن واكتب إجابتك في الشات. ${
        last ? 'تنتهي الجولة' : 'التلميح التالي'
      } <t:${at}:R>`

      // أول تلميح رسالة جديدة، وما بعده تحديث لها — كل تلميح برسالة مستقلة
      // يغرق القناة بثلاث صور في الجولة الواحدة.
      if (step === 0) await table.show(scene, { text })
      else await table.update(scene, { text })

      hit = await table.waitChat(HINT_MS, (input) => {
        if (!scores.has(input.userId)) return false
        return matches(input.text, riddle.answer)
      })

      if (hit || table.aborted) break
    }

    if (table.aborted) break

    if (hit) {
      scores.set(hit.userId, (scores.get(hit.userId) ?? 0) + 1)
      await table.say(`<@${hit.userId}> خمّنها صح — **${riddle.answer}**`)
    } else {
      await table.say(`انتهى الوقت. الإجابة كانت **${riddle.answer}**`)
    }

    if (round < ROUNDS) await table.sleep(BREATH_MS)
  }

  return finish(table, scores)
}

export default defineGame({
  key: 'khammen',
  name: 'خمن',
  aliases: ['خمّن'],
  tagline: 'تلميح بعد تلميح حتى تنكشف',
  howTo:
    'في كل جولة يظهر تلميح، ومن يعرف الإجابة يكتبها في الشات. ' +
    'إن لم يعرفها أحد ظهر تلميح جديد إلى جانبه، وهكذا حتى تنتهي التلميحات. ' +
    'النقطة لأول من يخمّن، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play,
})
