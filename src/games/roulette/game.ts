import type { PlayerView, WheelScene } from '../../scenes/scene.ts'
import { defineGame, zeroScores, type GameResult, type Table } from '../define.ts'
import { pickOne, shuffle } from '../phases.ts'

/**
 * روليت.
 *
 * وضعان: عجلة أسماء تختار لاعبًا، وعجلة فريقين تختار فريقًا. الثاني ليس لعبة
 * أخرى بل نفس العجلة بمشاركين مختلفين — لذلك يتقاسمان `WheelScene` نفسه بلا
 * أي فرع في القالب.
 *
 * العجلة تُعرض مرتين: مرة بلا اختيار ومرة بعد الوقوف. الفاصل بينهما ليس زينة —
 * هو ما يحوّل نتيجة فورية إلى لحظة، وهو كل متعة الروليت.
 */

const MODE_MS = 20_000
const SPIN_MS = 2_600

const TEAM_NAMES = ['الفريق الأحمر', 'الفريق الأصفر'] as const

export default defineGame({
  key: 'roulette',
  name: 'روليت',
  aliases: ['الروليت', 'العجلة'],
  tagline: 'عجلة تدور، والاسم الذي يقف عند المؤشّر يتحمّل النتيجة',
  howTo:
    'يدخل الجميع، ثم تختار وضع اللعب: عجلة أسماء تختار لاعبًا واحدًا عشوائيًا، ' +
    'أو روليت التيمات فتُقسَّم المجموعة فريقين ويقع الاختيار على فريق كامل.',
  players: { min: 2, max: 20 },
  wallet: 'roulette',
  play,
})

async function play(table: Table): Promise<GameResult> {
  const roster = [...table.players]
  const scores = zeroScores(roster)

  const teams = await askMode(table, roster)
  if (table.aborted) return { winnerId: null, scores }

  return teams ? await spinTeams(table, roster, scores) : await spinSolo(table, roster, scores)
}

/** القائد وحده يختار الوضع، ومهلة بلا ضغطة تعني الوضع العادي. */
async function askMode(table: Table, roster: PlayerView[]): Promise<boolean> {
  await table.show(wheel(table, roster, null, 'اختاروا وضع اللعب'), {
    text:
      `**روليت** — <@${table.host.id}> اختر الوضع من الأزرار. ` +
      `إن لم تختر خلال ${Math.round(MODE_MS / 1000)} ثانية تدور العجلة على الأسماء.`,
    buttons: [
      { id: 'mode:solo', label: 'عجلة الأسماء', style: 'start' },
      { id: 'mode:teams', label: 'روليت التيمات', style: 'plain' },
    ],
  })

  const press = await table.waitPress(
    MODE_MS,
    (p) => p.userId === table.host.id && p.id.startsWith('mode:'),
  )
  return press?.id === 'mode:teams'
}

/* ————— عجلة الأسماء ————— */

async function spinSolo(
  table: Table,
  roster: PlayerView[],
  scores: Map<string, number>,
): Promise<GameResult> {
  const chosen = pickOne(roster)
  if (!chosen) return { winnerId: null, scores }

  await table.update(wheel(table, roster, null, 'العجلة تدور...'), {
    text: '**تدور العجلة**...',
  })
  await table.sleep(SPIN_MS)
  if (table.aborted) return { winnerId: null, scores }

  scores.set(chosen.id, 1)
  await table.update(wheel(table, roster, chosen, 'وقفت العجلة'), {
    text: `وقفت العجلة على <@${chosen.id}> — **${chosen.name}**`,
  })

  return { winnerId: chosen.id, scores }
}

/* ————— روليت التيمات ————— */

async function spinTeams(
  table: Table,
  roster: PlayerView[],
  scores: Map<string, number>,
): Promise<GameResult> {
  const [first, second] = split(roster)

  // فريقان كمشاركين في العجلة: الاسم بدل الشخص، والقالب لا يعرف الفرق
  const faces: PlayerView[] = TEAM_NAMES.map((name, i) => ({
    id: `team:${i}`,
    name,
    avatar: null,
  }))

  await table.update(wheel(table, faces, null, 'العجلة تدور بين الفريقين'), {
    text:
      `**روليت التيمات**\n${TEAM_NAMES[0]}: ${mentions(first)}\n` +
      `${TEAM_NAMES[1]}: ${mentions(second)}`,
  })
  await table.sleep(SPIN_MS)
  if (table.aborted) return { winnerId: null, scores }

  const index = Math.random() < 0.5 ? 0 : 1
  const winners = index === 0 ? first : second
  const face = faces[index]
  for (const p of winners) scores.set(p.id, 1)

  await table.update(wheel(table, faces, face ?? null, 'وقفت العجلة'), {
    text: `وقفت العجلة على **${TEAM_NAMES[index]}** — ${mentions(winners)}`,
  })

  // فوز جماعي: لا فائز أوحد إلا إن كان الفريق لاعبًا واحدًا
  const only = winners.length === 1 ? winners[0] : undefined
  return { winnerId: only ? only.id : null, scores }
}

/** قسمة متوازنة: الفرق بين الفريقين لاعب واحد على الأكثر مهما كان العدد فرديًا. */
function split(roster: PlayerView[]): [PlayerView[], PlayerView[]] {
  const order = shuffle(roster)
  const half = Math.ceil(order.length / 2)
  return [order.slice(0, half), order.slice(half)]
}

/* ————— مشترك ————— */

function wheel(
  table: Table,
  players: PlayerView[],
  picked: PlayerView | null,
  note: string,
): WheelScene {
  return {
    kind: 'wheel',
    game: table.brief,
    players,
    picked,
    note,
  }
}

function mentions(players: PlayerView[]): string {
  return players.map((p) => `<@${p.id}>`).join('، ')
}
