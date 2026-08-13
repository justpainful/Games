import { EMOJI } from '../../design/emoji.ts'
import type { BoardScene, PlayerView } from '../../scenes/scene.ts'
import type { ButtonDef, GameResult, Table } from '../define.ts'
import { defineGame, zeroScores } from '../define.ts'
import { rotate } from '../turns.ts'

/**
 * «اشبك» — أربعة في صف على لوحة 7×6.
 *
 * اثنتان وأربعون خانة تعني اثنين وأربعين زرًا، وديسكورد لا يعطي أكثر من
 * خمسة وعشرين. لذلك اللعبة تُلعب بالعمود لا بالخانة: سبعة أزرار فقط، ورأس
 * الأعمدة في الصورة يحمل نفس الأرقام. هذا ليس تنازلًا عن اللعبة — إسقاط
 * القرص في عمود هو القاعدة الأصلية، والخانة تُختار بالجاذبية لا باللاعب.
 *
 * علامتا الجهتين حرفان («ح» و«ص») لا لونان وحدهما: القرص الأحمر والأصفر
 * لا يفترقان عند عمى الألوان، والحرف داخل القرص هو ما يفرقهما.
 */

const COLS = 7
const ROWS = 6
const MARKS = ['ح', 'ص'] as const
const NEED = 4
const TURN_MS = 45_000
const MAX_MISSES = 2

/**
 * وقفة قصيرة بين نقلة وأخرى.
 *
 * كانت 2_500، وموضعها قبل رسم النقلة لا بعدها: يضغط اللاعب فتبقى اللوحة على
 * حالها ثانيتين ونصفًا ثم يسقط قرصه. الوقفة التي قُصد بها إتاحة رؤية ما حدث
 * كانت تؤخّر ظهوره. واللوحة هنا هي الرد، فلا شاشة نتيجة تُقرأ.
 */
const BREATH_MS = 400

/** اتجاهات الفحص الأربعة — كل خط يُفحص مرة واحدة من طرفه الأعلى/الأيسر. */
const WAYS: readonly (readonly [number, number])[] = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
]

const at = (row: number, col: number): number => row * COLS + col

/** أدنى خانة فارغة في العمود — الجاذبية، لا اختيار اللاعب. */
function landing(cells: (string | null)[], col: number): number | null {
  for (let row = ROWS - 1; row >= 0; row--) {
    if ((cells[at(row, col)] ?? null) === null) return at(row, col)
  }
  return null
}

function fourFrom(
  cells: (string | null)[],
  row: number,
  col: number,
  dRow: number,
  dCol: number,
): number[] | null {
  const mark = cells[at(row, col)] ?? null
  if (mark === null) return null

  const line = [at(row, col)]
  for (let step = 1; step < NEED; step++) {
    const r = row + dRow * step
    const c = col + dCol * step
    if (r < 0 || r >= ROWS || c < 0 || c >= COLS) return null
    if ((cells[at(r, c)] ?? null) !== mark) return null
    line.push(at(r, c))
  }
  return line
}

function winningLine(cells: (string | null)[]): number[] | null {
  for (let row = 0; row < ROWS; row++) {
    for (let col = 0; col < COLS; col++) {
      for (const [dRow, dCol] of WAYS) {
        const line = fourFrom(cells, row, col, dRow, dCol)
        if (line) return line
      }
    }
  }
  return null
}

/** الأرقام نفسها التي تحملها خانات إكس أو: طقم واحد لا طقمان. */
const NUMBERS = [
  EMOJI.num_1,
  EMOJI.num_2,
  EMOJI.num_3,
  EMOJI.num_4,
  EMOJI.num_5,
  EMOJI.num_6,
  EMOJI.num_7,
] as const

function columnButtons(cells: (string | null)[]): ButtonDef[] {
  return Array.from({ length: COLS }, (_, col) => ({
    id: `col:${col}`,
    label: String(col + 1),
    style: 'plain' as const,
    disabled: landing(cells, col) === null,
    ...(NUMBERS[col] ? { emoji: NUMBERS[col] } : {}),
  }))
}

function columnOf(pressId: string): number | null {
  const match = /^col:(\d+)$/.exec(pressId)
  if (!match?.[1]) return null
  const col = Number(match[1])
  return col >= 0 && col < COLS ? col : null
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

  const cells: (string | null)[] = Array.from({ length: COLS * ROWS }, () => null)
  const misses = new Map<string, number>([
    [first.id, 0],
    [second.id, 0],
  ])

  const turns = rotate([first, second])
  let quitter: PlayerView | null = null

  while (!table.aborted) {
    const current = turns.next().value
    if (!current) break

    await table.update(board(table, cells, sides, current, { note: 'أسقط قرصك قبل انتهاء المهلة' }), {
      text: `<@${current.id}> دورك. اضغط رقم العمود.`,
      buttons: columnButtons(cells),
    })

    const press = await table.waitPress(TURN_MS, (p) => {
      if (p.userId !== current.id) return false
      const col = columnOf(p.id)
      return col !== null && landing(cells, col) !== null
    })

    if (table.aborted) break

    if (!press) {
      const count = (misses.get(current.id) ?? 0) + 1
      misses.set(current.id, count)
      if (count >= MAX_MISSES) {
        quitter = current
        break
      }
      await table.say(
        `${EMOJI.time_low} <@${current.id}> ما أسقط قرصه في وقته، فالدور ينتقل للخصم.`,
      )
      continue
    }

    misses.set(current.id, 0)
    const col = columnOf(press.id)
    const slot = col === null ? null : landing(cells, col)
    if (slot === null) continue
    cells[slot] = markOf.get(current.id) ?? MARKS[0]

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
    cols: COLS,
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
  scores.set(winner.id, 2)

  await table.show(
    board(table, cells, sides, null, {
      ...(line ? { winning: line } : {}),
      note: reason ?? `فاز ${winner.name} بأربعة في صف`,
    }),
    { text: `${EMOJI.win_trophy} **الفائز** <@${winner.id}>${reason ? ` · ${reason}` : ''}` },
  )

  return { winnerId: winner.id, scores }
}

async function draw(
  table: Table,
  cells: (string | null)[],
  sides: BoardScene['sides'],
): Promise<GameResult> {
  await table.show(board(table, cells, sides, null, { note: 'تعادل — امتلأت اللوحة' }), {
    text: `${EMOJI.st_users} **تعادل** · امتلأت اللوحة بلا أربعة.`,
  })
  return { winnerId: null, scores: zeroScores(table.players) }
}

export default defineGame({
  key: 'eshbek',
  mode: 'event',
  name: 'اشبك',
  aliases: ['أشبك', 'اربعة في صف', 'وصلها'],
  tagline: 'أربعة أقراص في صف واحد',
  howTo:
    'لوحة من سبعة أعمدة وستة صفوف. في دورك اضغط رقم العمود فيسقط قرصك إلى أدنى خانة فارغة فيه. ' +
    'أول من يشبك أربعة أقراص في صف أفقي أو عمودي أو مائل يفوز. ' +
    'إن امتلأت اللوحة فهو تعادل، ومن يتأخّر دورين متتاليين ينسحب.',
  players: { min: 2, max: 2 },
  wallet: 'solo',
  play,
})
