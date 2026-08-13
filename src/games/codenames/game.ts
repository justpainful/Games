import { normalize } from '../../arabic.ts'
import { EMOJI } from '../../design/emoji.ts'
import { numberFace, pickFace } from '../../design/faces.ts'
import type { CodenamesScene, Codeword, PlayerView } from '../../scenes/scene.ts'
import type { ButtonDef, GameResult, Press, Table } from '../define.ts'
import { defineGame, zeroScores } from '../define.ts'
import { shuffle } from '../phases.ts'
import { drawWords } from './words.ts'

/**
 * «كود نيمز» — سيّد يعطي كلمة ورقمًا، وفريقه يخمّن الكلمات.
 *
 * ————————————————— لماذا اللوح الخاص رسالة مخفية —————————————————
 *
 * لوح السيّد صورة لا نصّ، وفي نفس القناة لا في الخاص. الصورة لأن هويات الكلمات
 * تُقرأ بمواضعها: قائمة نصّية «قمر أحمر، بحر أزرق» تجبره على ترجمة كل اسم إلى
 * موضع قبل أن يفكّر في التلميح. والقناة لأن اللوح العام أمامه، فيقارن بينهما
 * بلا تنقّل، ولأن كثيرين يقفلون الخاص فتسقط رسالة الدور بصمت.
 *
 * ————————————————— لماذا التلميح يُكتب في الشات —————————————————
 *
 * التلميح كلمة حرّة، ولا يوجد في ديسكورد حقل نصّ إلا داخل نافذة تُفتح بضغطة.
 * والنافذة تخفي اللوح لحظة كتابة التلميح، وهي اللحظة الوحيدة التي يحتاج فيها
 * السيّد أن ينظر إلى اللوح. فالشات أصحّ هنا رغم أنه يكشف التلميح للجميع، وهو
 * ما يجب أن يُكشف أصلًا.
 *
 * ————————————————————— التلميح الممنوع —————————————————————
 *
 * كلمة على اللوح ممنوعة، والمقارنة بعد التطبيع فقط. ولا اشتقاق ولا جذور: فهم
 * الاشتقاق العربي يحتاج تحليلًا صرفيًا يخطئ في الحالات الطرفية، وخطؤه هنا
 * يرفض تلميحًا سليمًا فيوقف اللعبة. والباقي على اللاعبين، وهم أربعة يرون
 * التلميح لحظة كتابته.
 */

const CLUE_MS = 120_000
const GUESS_MS = 90_000
const BREATH_MS = 1_500

type Side = 'red' | 'blue'
type Cell = { word: string; side: Codeword; revealed: boolean }
type Board = { cells: Cell[]; cols: number }

/** الفريق الأول يبدأ فيأخذ كلمة زائدة، وإلا فاز من يلعب أولًا دائمًا. */
const LAYOUTS = {
  quick: { cols: 4, total: 16, first: 5, second: 4, assassin: 1 },
  classic: { cols: 5, total: 25, first: 9, second: 8, assassin: 1 },
} as const

function buildBoard(size: keyof typeof LAYOUTS, first: Side): Board {
  const plan = LAYOUTS[size]
  const words = drawWords(plan.total)
  const sides: Codeword[] = [
    ...Array.from({ length: plan.first }, () => first),
    ...Array.from({ length: plan.second }, () => (first === 'red' ? 'blue' : 'red') as Codeword),
    ...Array.from({ length: plan.assassin }, () => 'assassin' as Codeword),
  ]
  while (sides.length < plan.total) sides.push('neutral')

  const mixed = shuffle(sides)
  return {
    cols: plan.cols,
    cells: words.map((word, i) => ({ word, side: mixed[i] ?? 'neutral', revealed: false })),
  }
}

function remaining(board: Board, side: Side): number {
  return board.cells.filter((cell) => cell.side === side && !cell.revealed).length
}

function scene(
  table: Table,
  board: Board,
  turn: Side,
  clue: { word: string; count: number } | null,
  extra?: { master?: boolean; note?: string },
): CodenamesScene {
  return {
    kind: 'codenames',
    game: table.brief,
    cols: board.cols,
    cells: board.cells.map((cell) => ({ ...cell })),
    turn,
    clue,
    left: { red: remaining(board, 'red'), blue: remaining(board, 'blue') },
    ...(extra?.master ? { master: true } : {}),
    ...(extra?.note ? { note: extra.note } : {}),
  }
}

/**
 * زر لكل كلمة غير مكشوفة، وزر «كفى» لإنهاء الدور طوعًا.
 *
 * المكشوفة تبقى معطّلة لا تُحذف: حذفها يزحزح بقيّة الأزرار فيضغط اللاعب على
 * كلمة لم يقصدها، وقد صارت الأزرار تحت يده تعني غير ما تعنيه في الصورة.
 */
function wordButtons(board: Board): ButtonDef[] {
  const cells = board.cells.slice(0, 24)
  return [
    ...cells.map((cell, i) => ({
      id: `w:${i}`,
      label: cell.word.slice(0, 24),
      style: 'plain' as const,
      disabled: cell.revealed,
      row: Math.floor(i / board.cols),
      ...(numberFace(i + 1) ? { emoji: cell.revealed ? pickFace(i + 1) : numberFace(i + 1) } : {}),
    })),
    { id: 'done', label: 'كفى', style: 'stop' as const, emoji: EMOJI.st_stop, row: 4 },
  ]
}

function indexOf(pressId: string): number | null {
  const match = /^w:(\d+)$/.exec(pressId)
  return match?.[1] ? Number(match[1]) : null
}

/** التلميح المرفوض: كلمة على اللوح، أو أكثر من كلمة، أو بلا رقم. */
function readClue(text: string, board: Board): { word: string; count: number } | string {
  const parts = text.trim().split(/\s+/)
  if (parts.length !== 2) return 'التلميح كلمة واحدة ورقم، مثل: الفضاء 2'

  const [word, tail] = parts
  if (!word || !tail) return 'التلميح كلمة واحدة ورقم، مثل: الفضاء 2'

  const count = Number(tail.replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))))
  if (!Number.isInteger(count) || count < 1 || count > 9) return 'الرقم بين 1 و9'

  const flat = normalize(word)
  const clash = board.cells.find((cell) => !cell.revealed && normalize(cell.word) === flat)
  if (clash) return `«${clash.word}» على اللوح، فلا تصلح تلميحًا`

  return { word, count }
}

async function play(table: Table): Promise<GameResult> {
  const roster = shuffle(table.players)
  const half = Math.ceil(roster.length / 2)
  const teams: Record<Side, PlayerView[]> = {
    red: roster.slice(0, half),
    blue: roster.slice(half),
  }
  const masters: Record<Side, PlayerView | undefined> = {
    red: teams.red[0],
    blue: teams.blue[0],
  }
  if (!masters.red || !masters.blue) return { winnerId: null }

  const size = table.players.length >= 6 ? 'classic' : 'quick'
  let turn: Side = 'red'
  const board = buildBoard(size, turn)

  await table.show(scene(table, board, turn, null, { note: 'اضغط «شوف لوحي» إن كنت سيّدًا' }), {
    text:
      `${EMOJI.st_mask} **كود نيمز**\n` +
      `الأحمر: ${teams.red.map((p) => `<@${p.id}>`).join(' ')} · السيّد <@${masters.red.id}>\n` +
      `الأزرق: ${teams.blue.map((p) => `<@${p.id}>`).join(' ')} · السيّد <@${masters.blue.id}>`,
    buttons: [{ id: 'peek', label: 'شوف لوحي', style: 'start', emoji: EMOJI.st_eye }],
  })

  // نافذة يفتح فيها السيّدان لوحهما قبل أن تبدأ الجولة الأولى
  await servePeeks(table, board, turn, null, masters, 20_000)

  let winner: Side | null = null
  let loser: Side | null = null

  while (!table.aborted && winner === null) {
    const master = masters[turn]
    if (!master) break

    const clue = await askClue(table, board, turn, master, masters)
    if (table.aborted) break
    if (!clue) {
      await table.say(`${EMOJI.time_low} سيّد ${label(turn)} ما أعطى تلميحًا، والدور ينتقل.`)
      turn = other(turn)
      continue
    }

    const outcome = await runGuesses(table, board, turn, clue, masters)
    if (table.aborted) break
    if (outcome === 'assassin') {
      loser = turn
      winner = other(turn)
      break
    }

    if (remaining(board, 'red') === 0) winner = 'red'
    else if (remaining(board, 'blue') === 0) winner = 'blue'
    else turn = other(turn)
  }

  if (winner === null) return { winnerId: null }
  return await finish(table, board, winner, teams, loser)
}

const other = (side: Side): Side => (side === 'red' ? 'blue' : 'red')
const label = (side: Side): string => (side === 'red' ? 'الأحمر' : 'الأزرق')

/**
 * يستقبل ضغطات «شوف لوحي» مدةً محدودة ويردّ على كل سيّد بلوحه.
 *
 * وتُشغَّل بجانب كل انتظار آخر لا وحدها: السيّد قد يحتاج لوحه في أي لحظة، ولو
 * كان الزر يعمل في نافذته وحدها لصار عليه أن يتذكّر اللوح طوال الجولة.
 */
async function servePeeks(
  table: Table,
  board: Board,
  turn: Side,
  clue: { word: string; count: number } | null,
  masters: Record<Side, PlayerView | undefined>,
  ms: number,
): Promise<void> {
  const until = Date.now() + ms
  while (!table.aborted && Date.now() < until) {
    const press = await table.waitPress(Math.max(0, until - Date.now()), (p) => p.id === 'peek')
    if (!press) return
    await answerPeek(table, board, turn, clue, masters, press)
  }
}

async function answerPeek(
  table: Table,
  board: Board,
  turn: Side,
  clue: { word: string; count: number } | null,
  masters: Record<Side, PlayerView | undefined>,
  press: Press,
): Promise<void> {
  const side = (Object.keys(masters) as Side[]).find((s) => masters[s]?.id === press.userId)
  if (!side) {
    // غير السيّدين يضغط الزر بالتأكيد، والصمت يجعله يظنّه معطّلًا
    await table.reveal(press, scene(table, board, turn, clue), {
      text: 'هذا اللوح للسيّدين وحدهما. أنت تخمّن مع فريقك.',
    })
    return
  }
  await table.reveal(press, scene(table, board, turn, clue, { master: true }), {
    text: `لوحك يا سيّد ${label(side)}. لا تكتب كلمة من اللوح في تلميحك.`,
  })
}

/** ينتظر تلميح السيّد في الشات، ويخدم «شوف لوحي» في أثناء ذلك. */
async function askClue(
  table: Table,
  board: Board,
  turn: Side,
  master: PlayerView,
  masters: Record<Side, PlayerView | undefined>,
): Promise<{ word: string; count: number } | null> {
  await table.update(scene(table, board, turn, null), {
    text: `${EMOJI.st_keyboard} <@${master.id}> اكتب تلميحك في الشات: كلمة واحدة ورقم.`,
    buttons: [{ id: 'peek', label: 'شوف لوحي', style: 'start', emoji: EMOJI.st_eye }],
  })

  const until = Date.now() + CLUE_MS
  while (!table.aborted && Date.now() < until) {
    const left = Math.max(0, until - Date.now())
    // سباق بين الكتابة والضغط: أيّهما سبق يُخدم، والآخر يبقى منتظرًا
    const race = await Promise.race([
      table.waitChat(left, (input) => input.userId === master.id).then((v) => ({ chat: v })),
      table.waitPress(left, (p) => p.id === 'peek').then((v) => ({ press: v })),
    ])

    if ('press' in race && race.press) {
      await answerPeek(table, board, turn, null, masters, race.press)
      continue
    }
    if ('chat' in race && race.chat) {
      const read = readClue(race.chat.text, board)
      if (typeof read === 'string') {
        await table.say(`${EMOJI.hot_cross} <@${master.id}> ${read}`)
        continue
      }
      return read
    }
    return null
  }
  return null
}

/** جولة تخمين واحدة: الفريق يضغط كلمات حتى يخطئ أو يقول «كفى» أو ينتهي الوقت. */
async function runGuesses(
  table: Table,
  board: Board,
  turn: Side,
  clue: { word: string; count: number },
  masters: Record<Side, PlayerView | undefined>,
): Promise<'ended' | 'assassin'> {
  // محاولة زائدة على الرقم: تقليد أصلي يسمح باستدراك تلميح سابق
  let tries = clue.count + 1
  const master = masters[turn]

  while (!table.aborted && tries > 0) {
    await table.update(scene(table, board, turn, clue), {
      text:
        `${EMOJI.st_hand} دور ${label(turn)}. التلميح **${clue.word} ${clue.count}** · ` +
        `محاولات باقية ${tries}`,
      buttons: wordButtons(board),
    })

    const press = await table.waitPress(GUESS_MS, (p) => {
      // السيّد لا يخمّن، وهو يعرف الجواب
      if (p.userId === master?.id) return false
      if (p.id === 'peek' || p.id === 'done') return true
      const at = indexOf(p.id)
      return at !== null && board.cells[at]?.revealed === false
    })

    if (table.aborted || !press) return 'ended'

    if (press.id === 'peek') {
      await answerPeek(table, board, turn, clue, masters, press)
      continue
    }
    if (press.id === 'done') {
      await table.say(`${EMOJI.st_check} ${label(turn)} أنهى دوره.`)
      return 'ended'
    }

    const at = indexOf(press.id)
    const cell = at === null ? undefined : board.cells[at]
    if (!cell || cell.revealed) continue
    cell.revealed = true
    tries -= 1

    if (cell.side === 'assassin') {
      await table.show(scene(table, board, turn, clue, { note: `«${cell.word}» كانت القاتل` }), {
        text: `${EMOJI.hot_bomb} <@${press.userId}> كشف **${cell.word}** وهي **القاتل**.`,
      })
      return 'assassin'
    }

    if (cell.side !== turn) {
      const whose = cell.side === 'neutral' ? 'محايدة' : `لـ${label(cell.side as Side)}`
      await table.show(scene(table, board, turn, clue, { note: `«${cell.word}» ${whose}` }), {
        text: `${EMOJI.hot_cross} **${cell.word}** ${whose}، وانتهى دور ${label(turn)}.`,
      })
      return 'ended'
    }

    await table.say(`${EMOJI.win_check} **${cell.word}** لـ${label(turn)}.`)
    if (remaining(board, turn) === 0) return 'ended'
    await table.sleep(BREATH_MS)
  }

  await table.say(`${EMOJI.st_timer} نفدت محاولات ${label(turn)}.`)
  return 'ended'
}

async function finish(
  table: Table,
  board: Board,
  winner: Side,
  teams: Record<Side, PlayerView[]>,
  loser: Side | null,
): Promise<GameResult> {
  const scores = zeroScores(table.players)
  for (const player of teams[winner]) scores.set(player.id, 2)

  const why = loser ? `${label(loser)} كشف القاتل` : `${label(winner)} كشف كل عملائه`
  // اللوح يُكشف كاملًا في النهاية: نصف متعة الجولة أن ترى ما كنت على وشك ضغطه
  await table.show(
    { ...scene(table, board, winner, null, { master: true, note: why }), cells: board.cells.map((c) => ({ ...c, revealed: true })) },
    {
      text:
        `${EMOJI.win_trophy} **فاز ${label(winner)}** · ${why}\n` +
        teams[winner].map((p) => `<@${p.id}>`).join(' '),
    },
  )

  // فريق كامل يفوز، فلا فائز أوحد إلا إن كان الفريق لاعبًا واحدًا
  const only = teams[winner].length === 1 ? teams[winner][0]?.id ?? null : null
  return { winnerId: only, scores }
}

export default defineGame({
  key: 'codenames',
  name: 'كود نيمز',
  aliases: ['كودنيمز', 'كود', 'codenames'],
  tagline: 'كلمة ورقم، وفريقك يفهم عليك',
  howTo:
    'فريقان، ولكل فريق سيّد يرى هوية كل كلمة على اللوح. السيّد يكتب في الشات تلميحًا من كلمة واحدة ورقم، ' +
    'والرقم يقول كم كلمة على اللوح يقصدها. فريقه يضغط الكلمات التي يظنها. ' +
    'كلمة لفريقك تكمل، وكلمة لغيرك أو محايدة تنهي دورك، والقاتل يخسّرك فورًا. ' +
    'أول فريق يكشف كل كلماته يفوز. واضغط «شوف لوحي» متى شئت إن كنت سيّدًا.',
  players: { min: 4, max: 20 },
  wallet: 'team',
  play,
})
