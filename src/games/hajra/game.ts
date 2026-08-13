import type { DuelScene, PlayerView, StandingsScene } from '../../scenes/scene.ts'
import type { ButtonDef, GameResult, Press, Table } from '../define.ts'
import { defineGame, zeroScores } from '../define.ts'
import { pickOne, shuffle } from '../phases.ts'

/**
 * «حجرة» — حجرة ورقة مقص بنظام مواجهات.
 *
 * **سرّية الاختيار** هي كل اللعبة، ولها ثمن مدفوع عن قصد: الجولة تنتظر عدّادها
 * كاملًا ولا تُحسم بأول ضغطة. لو أنهينا الجولة عند اكتمال الاختيارين لعرف
 * المتأخّر أن الأول اختار، ولو أنهيناها بأول ضغطة لانكشف الاختيار. لذلك
 * `collectPresses` يجمع الضغطتين خلال النافذة كلها ثم تُكشفان معًا — وضغطة
 * ديسكورد لا يراها إلا صاحبها، فالسرّية محفوظة إلى لحظة الكشف.
 *
 * **نظام المواجهات**: اللاعبون يُخلطون ثم يُزاوَجون اثنين اثنين. الفائز يصعد،
 * والعدد الفردي يعني أن الأخير يعبر الدور بلا مواجهة (bye) بدل إقصائه بلا لعب.
 * كل مواجهة أفضل من ثلاث (أول من يبلغ فوزين).
 */

type Hand = 'rock' | 'paper' | 'scissors'

const HANDS: readonly Hand[] = ['rock', 'paper', 'scissors']

const HAND_NAME: Record<Hand, string> = {
  rock: 'حجرة',
  paper: 'ورقة',
  scissors: 'مقص',
}

/** ماذا يهزم ماذا. */
const BEATS: Record<Hand, Hand> = {
  rock: 'scissors',
  paper: 'rock',
  scissors: 'paper',
}

/** يقرأها قالب المواجهة صندوقًا متقطّعًا بلا لون. */
const HIDDEN = '؟'

const WINS_NEEDED = 2
/** سقف جولات المواجهة — التعادلات لا تُحسب، وبلا سقف تدور المواجهة بلا نهاية. */
const MATCH_CAP = 5
const PICK_MS = 12_000
const MAX_MISSES = 2
const BREATH_MS = 3_000

const BUTTONS: ButtonDef[] = HANDS.map((hand) => ({
  id: `hand:${hand}`,
  label: HAND_NAME[hand],
  style: 'plain' as const,
}))

function handOf(pressId: string): Hand | null {
  const key = pressId.startsWith('hand:') ? pressId.slice('hand:'.length) : ''
  return HANDS.find((hand) => hand === key) ?? null
}

function chosen(presses: Press[], userId: string): Hand | null {
  const press = presses.find((p) => p.userId === userId)
  return press ? handOf(press.id) : null
}

async function play(table: Table): Promise<GameResult> {
  // لقطة قبل أي `drop`: المنسحب يبقى في الترتيب النهائي بنقاطه التي كسبها
  const roster = [...table.players]
  const scores = zeroScores(roster)
  if (roster.length < 2) return { winnerId: null, scores }

  let alive = shuffle(roster)

  while (alive.length > 1 && !table.aborted) {
    const next: PlayerView[] = []

    for (let i = 0; i < alive.length; i += 2) {
      if (table.aborted) break
      const a = alive[i]
      if (!a) continue
      const b = alive[i + 1]

      if (!b) {
        next.push(a)
        await table.say(`<@${a.id}> يعبر الدور بلا مواجهة — العدد فردي.`)
        continue
      }

      const winner = await match(table, a, b, scores)
      if (!winner) return { winnerId: null, scores }
      next.push(winner)
      await table.sleep(BREATH_MS)
    }

    if (table.aborted) break
    alive = next
  }

  const champion = alive.length === 1 ? alive[0] : null
  return await finish(table, roster, scores, champion ?? null)
}

/** مواجهة واحدة — `null` تعني أن اللعبة أُوقفت وسطها. */
async function match(
  table: Table,
  a: PlayerView,
  b: PlayerView,
  scores: Map<string, number>,
): Promise<PlayerView | null> {
  let scoreA = 0
  let scoreB = 0
  const misses = new Map<string, number>([
    [a.id, 0],
    [b.id, 0],
  ])

  for (let round = 1; round <= MATCH_CAP; round++) {
    if (table.aborted) return null
    if (scoreA >= WINS_NEEDED || scoreB >= WINS_NEEDED) break

    const hidden = scene(table, a, b, HIDDEN, HIDDEN, scoreA, scoreB, 'اختاروا سرًا', round)
    const opts = {
      text:
        `<@${a.id}> و<@${b.id}> — اختاروا الآن. ` +
        `لا يرى أحد اختيار الآخر حتى ينتهي العدّاد <t:${deadline()}:R>`,
      buttons: BUTTONS,
    }
    if (round === 1) await table.show(hidden, opts)
    else await table.update(hidden, opts)

    const presses = await table.collectPresses(
      PICK_MS,
      (p) => handOf(p.id) !== null && (p.userId === a.id || p.userId === b.id),
    )
    if (table.aborted) return null

    const pickA = chosen(presses, a.id)
    const pickB = chosen(presses, b.id)

    if (!pickA) misses.set(a.id, (misses.get(a.id) ?? 0) + 1)
    if (!pickB) misses.set(b.id, (misses.get(b.id) ?? 0) + 1)

    let verdict: string
    if (pickA && pickB) {
      if (pickA === pickB) {
        verdict = 'تعادل — تُعاد الجولة بلا احتساب'
      } else if (BEATS[pickA] === pickB) {
        scoreA++
        scores.set(a.id, (scores.get(a.id) ?? 0) + 1)
        verdict = `${HAND_NAME[pickA]} تغلب ${HAND_NAME[pickB]}`
      } else {
        scoreB++
        scores.set(b.id, (scores.get(b.id) ?? 0) + 1)
        verdict = `${HAND_NAME[pickB]} تغلب ${HAND_NAME[pickA]}`
      }
    } else if (pickA) {
      scoreA++
      scores.set(a.id, (scores.get(a.id) ?? 0) + 1)
      verdict = `${b.name} ما اختار — الجولة لخصمه`
    } else if (pickB) {
      scoreB++
      scores.set(b.id, (scores.get(b.id) ?? 0) + 1)
      verdict = `${a.name} ما اختار — الجولة لخصمه`
    } else {
      verdict = 'لم يختر أحد — تُعاد الجولة'
    }

    await table.update(
      scene(
        table,
        a,
        b,
        pickA ? HAND_NAME[pickA] : 'ما اختار',
        pickB ? HAND_NAME[pickB] : 'ما اختار',
        scoreA,
        scoreB,
        verdict,
        round,
      ),
      { text: verdict },
    )

    // المتخلّف عن جولتين ينسحب — وإلا علّق خصمَه في مواجهة لا تنتهي
    const quitter = [a, b].find((p) => (misses.get(p.id) ?? 0) >= MAX_MISSES)
    if (quitter) {
      const other = quitter.id === a.id ? b : a
      table.drop(quitter.id)
      await table.say(`<@${quitter.id}> انسحب بالتأخّر — تصعد <@${other.id}>`)
      return other
    }

    if (table.aborted) return null
    await table.sleep(BREATH_MS)
  }

  if (scoreA !== scoreB) {
    const winner = scoreA > scoreB ? a : b
    await table.say(`فاز <@${winner.id}> بالمواجهة ${Math.max(scoreA, scoreB)}–${Math.min(scoreA, scoreB)}`)
    return winner
  }

  // تعادل حتى السقف: قرعة معلنة بدل تمديد لا ينتهي
  const drawn = pickOne([a, b]) ?? a
  await table.say(`تعادلت المواجهة حتى آخر جولة — القرعة رفعت <@${drawn.id}>`)
  return drawn
}

function deadline(): number {
  return Math.floor(Date.now() / 1000) + Math.round(PICK_MS / 1000)
}

function scene(
  table: Table,
  a: PlayerView,
  b: PlayerView,
  labelA: string,
  labelB: string,
  scoreA: number,
  scoreB: number,
  verdict: string,
  round: number,
): DuelScene {
  return {
    kind: 'duel',
    game: table.brief,
    left: { player: a, label: labelA, score: scoreA },
    right: { player: b, label: labelB, score: scoreB },
    verdict,
    round: { index: round, total: MATCH_CAP },
  }
}

async function finish(
  table: Table,
  roster: PlayerView[],
  scores: Map<string, number>,
  champion: PlayerView | null,
): Promise<GameResult> {
  // بعد أمر الإيقاف لا بطل ولا مشهد نهائي — الصورة بعد الإيقاف تربك القناة
  if (table.aborted) return { winnerId: null, scores }

  const rows: StandingsScene['rows'] = roster
    .map((player) => ({ player, score: scores.get(player.id) ?? 0 }))
    .sort((x, y) => y.score - x.score)

  await table.show(
    { kind: 'standings', game: table.brief, rows, heading: 'النتيجة النهائية' },
    {
      text: champion
        ? `**بطل الجولة** <@${champion.id}>`
        : 'انتهت اللعبة بلا بطل.',
    },
  )

  return { winnerId: champion?.id ?? null, scores }
}

export default defineGame({
  key: 'hajra',
  mode: 'event',
  name: 'حجرة',
  aliases: ['حجرة ورقة مقص', 'حجره'],
  tagline: 'حجرة ورقة مقص — والاختيار سرّ',
  howTo:
    'اللاعبون يُخلطون ويُزاوَجون مواجهات ثنائية، والفائز يصعد حتى يبقى واحد. ' +
    'في كل جولة يضغط كل لاعب اختياره ولا يراه خصمه، وتُكشف الاختيارات معًا عند انتهاء العدّاد. ' +
    'الحجرة تكسر المقص، والمقص يقص الورقة، والورقة تلفّ الحجرة. أول من يفوز بجولتين يأخذ المواجهة.',
  players: { min: 2, max: 8 },
  wallet: 'solo',
  play,
})
