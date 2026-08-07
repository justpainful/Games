import type { HuntScene, PlayerView } from '../../scenes/scene.ts'
import { defineGame, zeroScores, type ButtonDef, type GameResult, type Table } from '../define.ts'

/**
 * هايد — واحد يختبئ في خانة رقمية، والبقية يبحثون بمحاولات معدودة.
 *
 * الاختباء يتم بضغطة زر لا بكتابة في الشات: ضغطة الزر لا يراها أحد غير الضاغط،
 * بينما أي كتابة في القناة تكشف المخبأ فورًا. الخاص يبقى ضروريًا لشيء واحد —
 * تثبيت الخانة عند المختبئ ليطمئن أن اختياره سُجّل، ولإبلاغه أنه المختبئ أصلًا.
 *
 * لذلك يُختبر الخاص **قبل** إسناد دور المختبئ: من كان خاصه مقفلًا يُستبدل
 * علنًا وبلا لبس، ولا تُترك الجولة معلّقة على لاعب لا يعرف أنه المطلوب.
 */

const HIDE_MS = 25_000
const SEEK_MS = 25_000
const BREATH_MS = 3_000

const SEEKER_POINT = 2
const HIDER_POINT = 3

export default defineGame({
  key: 'hide',
  name: 'هايد',
  aliases: ['هايد اند سيك', 'اختبئ'],
  tagline: 'واحد يختبئ في خانة، والبقية يبحثون بمحاولات معدودة',
  howTo:
    'في كل جولة يختبئ لاعب في خانة رقمية سرًا، ويصله تأكيد اختياره في الخاص. ' +
    'بقية اللاعبين يفتحون الخانات واحدة واحدة بعدد محاولات محدود. من يكشف المختبئ ' +
    'يأخذ نقطتين، وإذا نفدت المحاولات فالمختبئ يأخذ ثلاثًا.',
  players: { min: 2, max: 12 },
  wallet: 'solo',
  play,
})

async function play(table: Table): Promise<GameResult> {
  const roster = [...table.players]
  const scores = zeroScores(roster)
  const rounds = Math.min(roster.length, 5)

  /** من ثبت أن خاصه مقفل لا يُعاد ترشيحه للاختباء في بقية الجولات. */
  const unreachable = new Set<string>()

  for (let round = 1; round <= rounds && !table.aborted; round++) {
    const hider = await pickHider(table, roster, round, unreachable)
    if (table.aborted) break

    if (!hider) {
      await table.show(
        {
          kind: 'notice',
          tone: 'warn',
          title: 'أُلغيت اللعبة',
          body: 'ما وجدت لاعبًا خاصه مفتوح ليكون المختبئ.',
        },
        { text: 'هايد تحتاج خاصًا مفتوحًا للمختبئ. افتحوا الرسائل الخاصة ثم أعيدوا اللعبة.' },
      )
      break
    }

    const cells = cellCount(roster.length)
    const spot = await hidePhase(table, hider, cells, round, rounds)
    if (table.aborted) break

    const winner = await seekPhase(table, hider, spot, cells, round, rounds)
    if (table.aborted) break

    if (winner) scores.set(winner.id, (scores.get(winner.id) ?? 0) + SEEKER_POINT)
    else scores.set(hider.id, (scores.get(hider.id) ?? 0) + HIDER_POINT)

    if (round < rounds) await table.sleep(BREATH_MS)
  }

  if (table.aborted) return { winnerId: null, scores }
  return await finish(table, roster, scores)
}

/* ————— اختيار المختبئ ————— */

/**
 * الدور يدور على اللاعبين بالترتيب. من كان خاصه مقفلًا يُعلن اسمه في القناة
 * ويُستبدل بمن يليه — والإعلان لا يكشف شيئًا لأنه لم يصر مختبئًا أصلًا.
 */
async function pickHider(
  table: Table,
  roster: PlayerView[],
  round: number,
  unreachable: Set<string>,
): Promise<PlayerView | null> {
  const order = [...roster.slice(round - 1), ...roster.slice(0, round - 1)]

  for (const candidate of order) {
    if (table.aborted) return null
    if (unreachable.has(candidate.id)) continue

    const sent = await table.whisper(
      candidate.id,
      `الجولة ${round} من **هايد**: أنت المختبئ. اضغط رقم الخانة في القناة — ` +
        'ضغطة الزر لا يراها أحد غيرك، ويصلك هنا تأكيد بها.',
    )
    if (sent) return candidate

    unreachable.add(candidate.id)
    await table.say(
      `خاص <@${candidate.id}> مقفل فما قدر يكون المختبئ — انتقل الدور لغيره. ` +
        'لفتحه: إعدادات السيرفر ← الخصوصية ← السماح برسائل الأعضاء.',
    )
  }

  return null
}

/* ————— طور الاختباء ————— */

async function hidePhase(
  table: Table,
  hider: PlayerView,
  cells: number,
  round: number,
  rounds: number,
): Promise<number> {
  await table.show(
    huntScene(table, {
      total: cells,
      cleared: [],
      seeker: hider,
      headline: `${hider.name} يختار مخبأه`,
      note: `الجولة ${round} من ${rounds}`,
    }),
    {
      text:
        `**الجولة ${round}/${rounds}** — <@${hider.id}> اختر خانة من الأزرار. ` +
        'لا أحد يرى ضغطتك.',
      buttons: cellButtons(cells, new Set()),
    },
  )

  const press = await table.waitPress(
    HIDE_MS,
    (p) => p.userId === hider.id && cellOf(p.id) !== null,
  )

  // تأخّر المختبئ لا يوقف الجولة: تُختار له خانة ويُبلَّغ بها في الخاص
  const spot = press ? (cellOf(press.id) ?? 1) : 1 + Math.floor(Math.random() * cells)
  await table.whisper(
    hider.id,
    press
      ? `تمام — أنت مختبئ في الخانة **${spot}**. لا تكشفها.`
      : `انتهى وقت الاختيار فاختبأت لك في الخانة **${spot}**. لا تكشفها.`,
  )

  return spot
}

/* ————— طور البحث ————— */

async function seekPhase(
  table: Table,
  hider: PlayerView,
  spot: number,
  cells: number,
  round: number,
  rounds: number,
): Promise<PlayerView | null> {
  const tries = attempts(cells)
  const cleared = new Set<number>()

  for (let i = 1; i <= tries && !table.aborted; i++) {
    const left = tries - i + 1
    await table.update(
      huntScene(table, {
        total: cells,
        cleared: [...cleared],
        seeker: null,
        headline: 'ابحثوا عن المختبئ',
        note: `بقي ${left} ${triesWord(left)}`,
      }),
      {
        text: `**الجولة ${round}/${rounds}** — افتحوا خانة. بقي ${left} ${triesWord(left)}.`,
        buttons: cellButtons(cells, cleared),
      },
    )

    const press = await table.waitPress(SEEK_MS, (p) => {
      if (p.userId === hider.id) return false
      const cell = cellOf(p.id)
      return cell !== null && !cleared.has(cell)
    })
    if (table.aborted) return null

    if (!press) {
      await table.say('ما فتح أحد خانة — انتهت الجولة لصالح المختبئ.')
      break
    }

    const cell = cellOf(press.id) ?? 0
    if (cell === spot) {
      const seeker = table.players.find((p) => p.id === press.userId) ?? null
      await table.update(
        huntScene(table, {
          total: cells,
          cleared: [...cleared, cell],
          seeker,
          headline: `الخانة ${cell} — لقيناه!`,
          note: `كان ${hider.name} مختبئًا هنا`,
        }),
        {
          text: `<@${press.userId}> فتح الخانة **${cell}** ولقى <@${hider.id}> — ${SEEKER_POINT} نقاط.`,
        },
      )
      return seeker
    }

    cleared.add(cell)
    await table.say(`الخانة **${cell}** فاضية.`)
  }

  if (table.aborted) return null

  await table.update(
    huntScene(table, {
      total: cells,
      cleared: [...cleared],
      seeker: hider,
      headline: `فاز ${hider.name}`,
      note: `كان في الخانة ${spot}`,
    }),
    { text: `نفدت المحاولات — <@${hider.id}> كان في الخانة **${spot}** وأخذ ${HIDER_POINT} نقاط.` },
  )
  return null
}

/* ————— أدوات ————— */

/** الشبكة تكبر بعدد اللاعبين: بحث جماعي في تسع خانات ينتهي قبل أن يبدأ. */
function cellCount(players: number): number {
  return Math.min(16, Math.max(8, 6 + players))
}

/** المحاولات أقل من نصف الخانات — وإلا صار الكشف شبه مضمون. */
function attempts(cells: number): number {
  return Math.max(3, Math.ceil(cells / 2) - 1)
}

function cellButtons(cells: number, cleared: Set<number>): ButtonDef[] {
  return Array.from({ length: cells }, (_, i) => i + 1).map((n) => ({
    id: `cell:${n}`,
    label: String(n),
    style: 'plain' as const,
    disabled: cleared.has(n),
  }))
}

function cellOf(pressId: string): number | null {
  const match = /^cell:(\d+)$/.exec(pressId)
  if (!match?.[1]) return null
  return Number(match[1])
}

function huntScene(
  table: Table,
  parts: {
    total: number
    cleared: number[]
    seeker: PlayerView | null
    headline: string
    note?: string
  },
): HuntScene {
  return {
    kind: 'hunt',
    game: table.brief,
    total: parts.total,
    cleared: parts.cleared,
    seeker: parts.seeker,
    headline: parts.headline,
    ...(parts.note ? { note: parts.note } : {}),
  }
}

async function finish(
  table: Table,
  roster: PlayerView[],
  scores: Map<string, number>,
): Promise<GameResult> {
  const rows = roster
    .map((player) => ({ player, score: scores.get(player.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)

  const top = rows[0]
  // التعادل على الصدارة لا فائز فيه — إعلان فائز عشوائي يفسد اللعبة
  const tied = rows.filter((r) => r.score === top?.score).length > 1
  const winnerId = top && top.score > 0 && !tied ? top.player.id : null

  await table.show(
    { kind: 'standings', game: table.brief, rows, heading: 'النتيجة النهائية' },
    {
      text: winnerId
        ? `**الفائز** <@${winnerId}> بـ ${top?.score} نقطة`
        : 'انتهت اللعبة بلا فائز واضح.',
    },
  )

  return { winnerId, scores }
}

function triesWord(n: number): string {
  if (n === 1) return 'محاولة'
  if (n === 2) return 'محاولتان'
  if (n <= 10) return 'محاولات'
  return 'محاولة'
}
