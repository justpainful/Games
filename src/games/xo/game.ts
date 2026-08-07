import type { BoardScene, PlayerView } from '../../scenes/scene.ts'
import type { GameResult, Table } from '../define.ts'
import { defineGame, zeroScores } from '../define.ts'
import { cellIndex, gridButtons, rotate } from '../turns.ts'

/**
 * «xo» — إكس أو على لوحة 3×3.
 *
 * الأزرار تحمل أرقام الخانات لا مواضعها: ديسكورد يرصّ الأزرار خمسة في الصف،
 * فتسع خانات تخرج صفّين (5+4) لا شبكة 3×3، ولو اعتمدنا على الشكل لضغط اللاعب
 * الخانة الخطأ. الرقم في الزر يطابق الرقم المطبوع في الخانة الفارغة، والمطابقة
 * بالرقم لا تنكسر مهما رصّ ديسكورد الأزرار.
 */

const MARKS = ['X', 'O'] as const
const TURN_MS = 45_000
/** تأخّران متتاليان = انسحاب. الأول يُتخطّى فقط، فقد ينقطع اتصال اللاعب لحظة. */
const MAX_MISSES = 2
const BREATH_MS = 2_500

const LINES: readonly (readonly number[])[] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8],
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8],
  [0, 4, 8],
  [2, 4, 6],
]

/** الصفّ الفائز إن وُجد — تُعاد فهارسه لتُبرزها اللوحة. */
function winningLine(cells: (string | null)[]): number[] | null {
  for (const line of LINES) {
    const [a, b, c] = line
    if (a === undefined || b === undefined || c === undefined) continue
    const mark = cells[a]
    if (mark && cells[b] === mark && cells[c] === mark) return [a, b, c]
  }
  return null
}

async function play(table: Table): Promise<GameResult> {
  const [first, second] = table.players
  if (!first || !second) return { winnerId: null }

  const sides: BoardScene['sides'] = [
    { mark: MARKS[0], player: first },
    { mark: MARKS[1], player: second },
  ]
  const markOf = new Map<string, string>([
    [first.id, MARKS[0]],
    [second.id, MARKS[1]],
  ])

  const cells: (string | null)[] = Array.from({ length: 9 }, () => null)
  const misses = new Map<string, number>([
    [first.id, 0],
    [second.id, 0],
  ])

  const turns = rotate([first, second])
  let quitter: PlayerView | null = null

  while (!table.aborted) {
    const current = turns.next().value
    if (!current) break

    await table.show(board(table, cells, sides, current), {
      text: `<@${current.id}> دورك — اضغط رقم الخانة.`,
      buttons: gridButtons(cells, { cols: 3, label: (i, value) => value ?? String(i + 1) }),
    })

    const press = await table.waitPress(TURN_MS, (p) => {
      if (p.userId !== current.id) return false
      const index = cellIndex(p.id)
      return index !== null && index < 9 && cells[index] === null
    })

    if (table.aborted) break

    if (!press) {
      const count = (misses.get(current.id) ?? 0) + 1
      misses.set(current.id, count)
      if (count >= MAX_MISSES) {
        quitter = current
        break
      }
      await table.say(`<@${current.id}> ما لعب في وقته — الدور ينتقل للخصم.`)
      continue
    }

    misses.set(current.id, 0)
    const index = cellIndex(press.id)
    if (index === null) continue
    cells[index] = markOf.get(current.id) ?? MARKS[0]

    const line = winningLine(cells)
    if (line) return await over(table, cells, sides, current, line)
    if (cells.every((c) => c !== null)) return await draw(table, cells, sides)

    await table.sleep(BREATH_MS)
  }

  if (quitter) {
    const other = quitter.id === first.id ? second : first
    return await over(table, cells, sides, other, null, `انسحب ${quitter.name} بالتأخّر`)
  }

  return { winnerId: null }
}

function board(
  table: Table,
  cells: (string | null)[],
  sides: BoardScene['sides'],
  turnOf: PlayerView | null,
  extra?: { winning?: number[]; note?: string },
): BoardScene {
  return {
    kind: 'board',
    game: table.brief,
    cells: [...cells],
    cols: 3,
    sides,
    turnOf,
    ...(extra?.winning ? { winning: extra.winning } : {}),
    ...(extra?.note ? { note: extra.note } : {}),
  }
}

async function over(
  table: Table,
  cells: (string | null)[],
  sides: BoardScene['sides'],
  winner: PlayerView,
  line: number[] | null,
  reason?: string,
): Promise<GameResult> {
  const scores = zeroScores(table.players)
  scores.set(winner.id, 1)

  await table.show(
    board(table, cells, sides, null, {
      ...(line ? { winning: line } : {}),
      note: reason ?? `فاز ${winner.name} بصفّ من ثلاث`,
    }),
    { text: `**الفائز** <@${winner.id}>${reason ? ` — ${reason}` : ''}` },
  )

  return { winnerId: winner.id, scores }
}

async function draw(
  table: Table,
  cells: (string | null)[],
  sides: BoardScene['sides'],
): Promise<GameResult> {
  await table.show(board(table, cells, sides, null, { note: 'تعادل — امتلأت اللوحة بلا صفّ' }), {
    text: '**تعادل** — امتلأت اللوحة بلا فائز.',
  })
  return { winnerId: null, scores: zeroScores(table.players) }
}

export default defineGame({
  key: 'xo',
  name: 'xo',
  aliases: ['اكس او', 'إكس أو', 'إكس-أو'],
  tagline: 'ثلاث خانات في صف واحد',
  howTo:
    'تُلعب بين شخصين على لوحة 3×3. في دورك اضغط رقم الخانة التي تريدها، ' +
    'ومن يجمع ثلاث خانات في صف أفقي أو عمودي أو قطري يفوز. ' +
    'إن امتلأت اللوحة بلا صفّ فهو تعادل، ومن يتأخّر دورين متتاليين ينسحب.',
  players: { min: 2, max: 2 },
  wallet: 'solo',
  play,
})
