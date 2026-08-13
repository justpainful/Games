import { numberFace } from '../../design/faces.ts'
import type { PanelScene, PlayerView } from '../../scenes/scene.ts'
import { defineGame, zeroScores, type ButtonDef, type GameResult, type Table } from '../define.ts'
import { shuffle } from '../phases.ts'

/**
 * غرف — تقسيم عشوائي متوازن إلى غرف أو فرق.
 *
 * ليست لعبة تُربح، بل أداة تسبق اللعب: تقسيم ثلاثين لاعبًا يدويًا في قناة صوتية
 * يستغرق دقائق ويولّد خلافًا، وهذا يحسمه في ضغطة.
 *
 * التوازن ليس تجميلًا: `ceil` على الباقي يوزّع الفائض غرفة غرفة، فلا تخرج غرفة
 * بخمسة وأخرى باثنين. الفرق بين أكبر غرفة وأصغرها لاعب واحد على الأكثر دائمًا.
 */

const PICK_MS = 25_000
const MAX_ROOMS = 6

export default defineGame({
  key: 'ghuraf',
  name: 'غرف',
  aliases: ['الغرف', 'تقسيم', 'فرق'],
  tagline: 'قسّم الحاضرين غرفًا متوازنة بضغطة',
  howTo:
    'يختار القائد عدد الغرف، فيوزَّع اللاعبون عليها عشوائيًا وبتوازن — الفرق بين ' +
    'أكبر غرفة وأصغرها لاعب واحد على الأكثر. التقسيم يظهر في صورة وفي نص يمكن نسخه.',
  players: { min: 2, max: 30 },
  wallet: 'solo',
  play,
})

async function play(table: Table): Promise<GameResult> {
  const roster = [...table.players]
  const scores = zeroScores(roster)

  const max = Math.min(MAX_ROOMS, roster.length)
  const count = await askRooms(table, max)
  if (table.aborted) return { winnerId: null, scores }

  const rooms = divide(roster, count)

  await table.show(panel(table, rooms), { text: roomsText(rooms) })
  return { winnerId: null, scores }
}

/** القائد وحده يختار العدد، ومهلة بلا ضغطة تعني غرفتين. */
async function askRooms(table: Table, max: number): Promise<number> {
  await table.show(
    {
      kind: 'panel',
      title: 'كم غرفة؟',
      subtitle: `${table.players.length} لاعبين جاهزين للتقسيم`,
      items: Array.from({ length: max - 1 }, (_, i) => ({
        label: `${i + 2} غرف`,
        value: sizesLabel(table.players.length, i + 2),
      })),
      footer: 'القائد يختار من الأزرار',
    },
    {
      text: `**غرف** — <@${table.host.id}> اختر عدد الغرف. الافتراضي غرفتان.`,
      buttons: roomButtons(max),
    },
  )

  const press = await table.waitPress(
    PICK_MS,
    (p) => p.userId === table.host.id && p.id.startsWith('rooms:'),
  )
  if (!press) return 2

  const n = Number(press.id.slice('rooms:'.length))
  return Number.isFinite(n) && n >= 2 && n <= max ? n : 2
}

function roomButtons(max: number): ButtonDef[] {
  return Array.from({ length: max - 1 }, (_, i) => ({
    id: `rooms:${i + 2}`,
    label: `${i + 2}`,
    style: i === 0 ? ('start' as const) : ('plain' as const),
    ...(numberFace(i + 2) ? { emoji: numberFace(i + 2) } : {}),
  }))
}

/**
 * توزيع متوازن: كل غرفة تأخذ `ceil(المتبقي / الغرف المتبقية)`.
 * القسمة الثابتة `floor(n/k)` كانت ستكدّس الباقي كله في الغرفة الأخيرة.
 */
function divide(roster: PlayerView[], count: number): PlayerView[][] {
  const order = shuffle(roster)
  const rooms: PlayerView[][] = []
  let start = 0

  for (let i = 0; i < count; i++) {
    const size = Math.ceil((order.length - start) / (count - i))
    rooms.push(order.slice(start, start + size))
    start += size
  }

  return rooms
}

function panel(table: Table, rooms: PlayerView[][]): PanelScene {
  return {
    kind: 'panel',
    title: 'التقسيم',
    subtitle: `${table.players.length} لاعبين على ${rooms.length} ${roomsWord(rooms.length)}`,
    items: rooms.map((members, i) => ({
      label: `الغرفة ${i + 1}`,
      value: members.map((p) => p.name).join('، '),
      on: true,
    })),
    footer: 'التقسيم عشوائي، والفرق بين أكبر غرفة وأصغرها لاعب واحد على الأكثر',
  }
}

/** النص إلزامي بجانب الصورة (DESIGN §6): قابل للنسخ ويصمد لو فشل الرندر. */
function roomsText(rooms: PlayerView[][]): string {
  const lines = rooms.map(
    (members, i) => `**الغرفة ${i + 1}** — ${members.map((p) => `<@${p.id}>`).join('، ')}`,
  )
  return `**التقسيم جاهز**\n${lines.join('\n')}`
}

function sizesLabel(players: number, count: number): string {
  const sizes: number[] = []
  let start = 0
  for (let i = 0; i < count; i++) {
    const size = Math.ceil((players - start) / (count - i))
    sizes.push(size)
    start += size
  }
  return sizes.join(' + ')
}

function roomsWord(n: number): string {
  if (n === 2) return 'غرفتين'
  if (n <= 10) return 'غرف'
  return 'غرفة'
}
