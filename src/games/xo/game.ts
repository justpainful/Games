import type { BoardScene, PlayerView } from '../../scenes/scene.ts'
import type { GameResult, Table } from '../define.ts'
import { EMOJI } from '../../design/emoji.ts'
import { defineGame, zeroScores } from '../define.ts'
import { cellIndex, gridButtons, rotate } from '../turns.ts'

/**
 * «xo» — إكس أو على لوحة 3×3.
 *
* الأزرار تخرج شبكة 3×3 حقيقية: ديسكورد يسمح بخمسة صفوف في خمسة أزرار، والزر * يعلن صفّه في `gridButtons`. كان الرصّ التلقائي يخرجها 5+4 فتُقرأ شريطين لا * شبكة، وهو ما دفع اللعبة إلى الاعتماد على الرقم وحده.
 */

const MARKS = ['X', 'O'] as const
const TURN_MS = 45_000
/** تأخّران متتاليان = انسحاب. الأول يُتخطّى فقط، فقد ينقطع اتصال اللاعب لحظة. */
const MAX_MISSES = 2

/**
 * وقفة قصيرة بين نقلة وأخرى.
 *
 * كانت 2_500، وموضعها في الحلقة هو ما جعلها مؤذية: النوم يقع قبل رسم النقلة
 * لا بعدها. يضغط اللاعب فتبقى اللوحة على حالها ثانيتين ونصفًا ثم تظهر نقلته،
 * فالوقفة التي قُصد بها إتاحة رؤية ما حدث كانت تؤخّر ظهوره.
 *
 * وفي لعبة لوح لا شاشة نتيجة تُقرأ: اللوحة نفسها هي الرد. فالباقي هنا فاصل
 * يمنع تتابع مشهدين متشابهين بلا إحساس بالتغيّر، لا أكثر.
 */
const BREATH_MS = 400

/**
 * وجوه الأزرار: إيموجيات مرفوعة إلى التطبيق نفسه ومرسومة بألوان الهوية.
 *
 * مرّت هذه الأزرار بثلاثة أشكال. حملت «X» و«O» نصًّا، وهما حرفان لاتينيان وسط
 * واجهة عربية. ثم صارت أسهم اتجاه قياسية، وتلك يرسمها كل نظام تشغيل بأسلوبه
 * فيخرج الزر بثلاثة أشكال عند ثلاثة لاعبين — وهو ما يمنعه `design/icons.ts`
 * داخل المشاهد، والأزرار كانت الثغرة الباقية.
 *
 * والآن إيموجيات التطبيق: تُرفع مرة بـ`npm run gen:emojis` فتعمل في كل سيرفر
 * يدخله البوت بلا إعداد، وتُرسم بأحمر الهوية وأصفرها من `tokens.ts`.
 *
 * والأرقام بقيت وجه الخانة الفارغة لأن اللوحة في الصورة مرقّمة، فالمطابقة
 * بالرقم لا بالموضع. وصار الرقم مرسومًا بخط المشروع لا بخط النظام.
 */
const FACE: Record<string, string> = { X: EMOJI.xo_x, O: EMOJI.xo_o }

const SEATS = [
  EMOJI.num_1, EMOJI.num_2, EMOJI.num_3,
  EMOJI.num_4, EMOJI.num_5, EMOJI.num_6,
  EMOJI.num_7, EMOJI.num_8, EMOJI.num_9,
] as const

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

    await table.update(board(table, cells, sides, current), {
      text: `<@${current.id}> دورك. اضغط الخانة.`,
      buttons: gridButtons(cells, {
        cols: 3,
        // الإيموجي هو الوجه، والنص يبقى احتياطًا لو تعذّر عرضه
        emoji: (i, value) => FACE[value ?? ''] ?? SEATS[i],
        label: (i, value) => value ?? String(i + 1),
      }),
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
      await table.say(`${EMOJI.time_low} <@${current.id}> ما لعب في وقته، فالدور ينتقل للخصم.`)
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
    { text: `${EMOJI.win_trophy} **الفائز** <@${winner.id}>${reason ? ` · ${reason}` : ''}` },
  )

  return { winnerId: winner.id, scores }
}

async function draw(
  table: Table,
  cells: (string | null)[],
  sides: BoardScene['sides'],
): Promise<GameResult> {
  await table.show(board(table, cells, sides, null, { note: 'تعادل — امتلأت اللوحة بلا صفّ' }), {
    text: `${EMOJI.st_users} **تعادل** · امتلأت اللوحة بلا فائز.`,
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
