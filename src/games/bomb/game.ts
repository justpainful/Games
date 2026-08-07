import { normalize } from '../../arabic.ts'
import type { PlayerView, RoundScene, StandingsScene } from '../../scenes/scene.ts'
import type { GameResult, Table } from '../define.ts'
import { defineGame } from '../define.ts'
import { dealer } from '../data.ts'
import { awaitTyped } from '../turns.ts'

/**
 * «بومب» — القنبلة تُمرَّر.
 *
 * يظهر مقطع من حرفين، وعلى صاحب الدور أن يكتب كلمة عربية تحويه قبل أن تنفجر
 * مهلته وإلا خرج. آخر الباقين يفوز.
 *
 * **لماذا لا يوجد قاموس؟** التحقق هنا شكلي: كلمة عربية، ثلاثة أحرف فأكثر،
 * تحوي المقطع، ولم تُستخدم في هذه اللعبة. قاموس عربي كامل غير متاح، وقاموس
 * ناقص أسوأ من لا شيء لأنه يرفض كلمات صحيحة أمام الجميع فيفقد اللاعبون الثقة.
 * الشروط الأربعة تمنع العبث الظاهر (حرف مكرّر، لصق نفس الكلمة، لاتيني)،
 * وما بقي تضبطه رقابة اللاعبين بعضهم على بعض في القناة الصوتية.
 *
 * **المقاطع مختارة بيد لا مولّدة**: مقطع عشوائي من كلمة عشوائية يُخرج مقاطع
 * لا كلمة لها («ضظ»)، فتموت اللعبة على لاعب لا ذنب له. هذه القائمة كل مقطع
 * فيها له عشرات الكلمات.
 *
 * **المهلة تضيق كل دورة**: بلا ذلك تدور القنبلة إلى الأبد بين لاعبين متمكّنين.
 * الضيق هو ما ينهي اللعبة، لا سقف الدورات (السقف حارس أخير فقط).
 */

const FRAGMENTS: readonly string[] = [
  'سل', 'كت', 'در', 'رس', 'مل', 'كل', 'حم', 'شم', 'قل', 'بح',
  'طر', 'عل', 'نم', 'سم', 'زر', 'ثل', 'خب', 'صد', 'عب', 'رب',
  'تب', 'جم', 'سف', 'شج', 'نج', 'فل', 'سن', 'حب', 'قط', 'غر',
  'زل', 'سب', 'دن', 'حل', 'بل', 'كر', 'سر', 'طب', 'خض', 'بس',
  'شر', 'فر', 'نص', 'هر', 'صل', 'عم', 'لب', 'سك', 'تر', 'دم',
  'زن', 'جل', 'خل', 'هد', 'ود', 'مر', 'نب', 'تم', 'ضر', 'صف',
  'كن', 'هل', 'نس', 'رح', 'سط', 'عد', 'غل', 'بر', 'فت', 'زي',
  'قر', 'خر', 'عر', 'طف', 'سع', 'لم', 'نت', 'جد', 'حد', 'نف',
  'با', 'ما', 'را', 'كا', 'تا', 'نا', 'لا', 'يا', 'وا', 'سا',
]

/** الحروف العربية وحدها بعد التطبيع — لا لاتيني ولا أرقام ولا مسافات. */
const ARABIC_WORD = /^[ء-ي]{3,}$/

const MAX_ROUNDS = 20
const START_MS = 24_000
const STEP_MS = 2_000
const FLOOR_MS = 8_000
const BREATH_MS = 2_000
/** الاسم داخل تلميح الصورة يُقصّ — تلميح بعرض اسم طويل يتجاوز البطاقة. */
const NAME_CAP = 18

let deal: (() => string) | undefined
function nextFragment(): string {
  deal ??= dealer(FRAGMENTS)
  return deal()
}

function turnMs(round: number): number {
  return Math.max(FLOOR_MS, START_MS - (round - 1) * STEP_MS)
}

function short(name: string): string {
  const letters = [...name]
  return letters.length <= NAME_CAP ? name : `${letters.slice(0, NAME_CAP).join('')}…`
}

function accepted(text: string, fragment: string, used: Set<string>): boolean {
  const word = normalize(text)
  if (!ARABIC_WORD.test(word)) return false
  if (!word.includes(fragment)) return false
  return !used.has(word)
}

async function play(table: Table): Promise<GameResult> {
  const roster = [...table.players]
  if (roster.length < 2) return { winnerId: null }

  const alive = [...roster]
  const survived = new Map<string, number>(roster.map((p) => [p.id, 0]))
  const used = new Set<string>()

  let index = 0
  let round = 1

  await table.say('القنبلة تدور. اكتب كلمة عربية تحوي المقطع قبل أن تنفجر عليك.')

  while (alive.length > 1 && round <= MAX_ROUNDS && !table.aborted) {
    if (index >= alive.length) {
      index = 0
      round++
      continue
    }

    const player = alive[index]
    if (!player) {
      index++
      continue
    }

    const fragment = nextFragment()
    const ms = turnMs(round)
    const at = Math.floor(Date.now() / 1000) + Math.round(ms / 1000)

    await table.show(scene(table, fragment, player, round), {
      text: `<@${player.id}> القنبلة عندك! كلمة تحوي **${fragment}** — تنفجر <t:${at}:R>`,
    })

    const word = await awaitTyped(table, player.id, ms, (text) => accepted(text, fragment, used))
    if (table.aborted) break

    if (word) {
      used.add(normalize(word))
      survived.set(player.id, (survived.get(player.id) ?? 0) + 1)
      await table.say(`<@${player.id}> نجا بـ **${word.trim()}** — القنبلة للتالي.`)
      index++
    } else {
      alive.splice(index, 1)
      table.drop(player.id)
      await table.say(
        `انفجرت على <@${player.id}> — خرج من اللعبة. الباقون: ${alive.length}`,
      )
      // لا زيادة للمؤشّر: من كان بعده أخذ مكانه في الصف
    }

    if (alive.length > 1 && !table.aborted) await table.sleep(BREATH_MS)
  }

  return await finish(table, roster, alive, survived)
}

function scene(table: Table, fragment: string, player: PlayerView, round: number): RoundScene {
  return {
    kind: 'round',
    game: table.brief,
    prompt: fragment,
    hint: `الدور على ${short(player.name)} — ${Math.round(turnMs(round) / 1000)} ثانية`,
    index: round,
    total: MAX_ROUNDS,
  }
}

async function finish(
  table: Table,
  roster: PlayerView[],
  alive: PlayerView[],
  survived: Map<string, number>,
): Promise<GameResult> {
  // بعد أمر الإيقاف لا فائز ولا مشهد نهائي
  if (table.aborted) return { winnerId: null, scores: new Map(survived) }

  const rows: StandingsScene['rows'] = roster
    .map((player) => ({ player, score: survived.get(player.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)

  // آخر الباقين هو الفائز. لو بلغنا السقف وما زال أكثر من واحد، يفوز صاحب
  // أكثر الكلمات — وعند تساويه مع غيره فلا فائز، كبقية الألعاب.
  let winner: PlayerView | null = alive.length === 1 ? alive[0] ?? null : null
  if (!winner && alive.length > 1) {
    const best = Math.max(...alive.map((p) => survived.get(p.id) ?? 0))
    const tops = alive.filter((p) => (survived.get(p.id) ?? 0) === best)
    winner = tops.length === 1 ? tops[0] ?? null : null
  }

  const scores = new Map(survived)
  if (winner) scores.set(winner.id, (scores.get(winner.id) ?? 0) + 2)

  await table.show(
    { kind: 'standings', game: table.brief, rows, heading: 'النتيجة النهائية' },
    {
      text: winner
        ? `**آخر الباقين** <@${winner.id}> — نجا بـ ${survived.get(winner.id) ?? 0} كلمة`
        : 'انتهت اللعبة بلا فائز واضح.',
    },
  )

  return { winnerId: winner?.id ?? null, scores }
}

export default defineGame({
  key: 'bomb',
  name: 'بومب',
  aliases: ['قنبلة', 'بومب بارتي'],
  tagline: 'اكتب كلمة تحوي المقطع قبل أن تنفجر',
  howTo:
    'القنبلة تدور على اللاعبين واحدًا واحدًا. يظهر مقطع من حرفين، وعلى صاحب الدور أن يكتب في الشات ' +
    'كلمة عربية من ثلاثة أحرف فأكثر تحوي المقطع ولم تُستخدم من قبل. ' +
    'من لم يكتب قبل انتهاء مهلته انفجرت عليه وخرج، والمهلة تضيق كل دورة. آخر الباقين يفوز.',
  players: { min: 3, max: 15 },
  wallet: 'solo',
  play,
})
