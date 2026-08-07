import type { PlayerView, RolesScene } from '../../scenes/scene.ts'
import { defineGame, zeroScores, type GameResult, type Table } from '../define.ts'

/**
 * كراسي — كراسي موسيقية بأزرار.
 *
 * كل جولة: كراسي أقل من اللاعبين بواحد، وأسرع من يضغط يجلس. القاعدة الحاكمة
 * أن الزر **لا يظهر إلا بعد مهلة عشوائية**: لو ظهر مع إعلان الجولة لتحوّلت
 * اللعبة إلى سباق في التوقّع لا في رد الفعل، ولفاز من يضغط قبل أن يقرأ.
 *
 * `collectPresses` يحفظ ترتيب أول ضغطة لكل لاعب، وهو بالضبط ترتيب الجلوس.
 */

const SIT_MS = 6_000
const READY_MIN_MS = 2_000
const READY_SPAN_MS = 4_000
const BREATH_MS = 2_500

export default defineGame({
  key: 'karasi',
  name: 'كراسي',
  aliases: ['الكراسي', 'كراسي موسيقية'],
  tagline: 'الكراسي أقل منكم بواحد — من يتأخّر يقف',
  howTo:
    'في كل جولة يكون عدد الكراسي أقل من عدد اللاعبين بواحد. ينتظر الجميع ظهور زر ' +
    '«اجلس»، وأسرع من يضغط يأخذ كرسيًا، ومن لا يجد كرسيًا يخرج. آخر لاعب باقٍ يفوز.',
  players: { min: 3, max: 15 },
  wallet: 'solo',
  play,
})

async function play(table: Table): Promise<GameResult> {
  const roster = [...table.players]
  const scores = zeroScores(roster)

  const state: State = { alive: [...roster], out: [] }
  let round = 1
  /** جولة صامتة تُعاد مرة واحدة — بعدها تُعتبر الطاولة مهجورة. */
  let emptyRounds = 0

  while (state.alive.length > 1 && !table.aborted) {
    const chairs = state.alive.length - 1

    await table.show(
      scene(table, state, 'day', `الجولة ${round} — ${chairs} ${chairsWord(chairs)}`, 'استعدوا... الزر يظهر بعد لحظات، وأسرع من يضغط يجلس.'),
      { text: `**الجولة ${round}** — ${chairs} ${chairsWord(chairs)} و${state.alive.length} واقفين. استعدوا.` },
    )

    // المهلة عشوائية فلا يستطيع أحد حفظ توقيتها بين الجولات
    await table.sleep(READY_MIN_MS + Math.floor(Math.random() * READY_SPAN_MS))
    if (table.aborted) break

    const aliveIds = new Set(state.alive.map((p) => p.id))
    await table.update(
      scene(table, state, 'day', 'اجلس الآن!', `${chairs} ${chairsWord(chairs)} فقط. الأسرع يجلس.`),
      {
        text: `**اجلسوا!** ${chairs} ${chairsWord(chairs)} لـ ${state.alive.length} لاعبين.`,
        buttons: [{ id: 'sit', label: 'اجلس', style: 'start' }],
      },
    )

    const presses = await table.collectPresses(
      SIT_MS,
      (p) => p.id === 'sit' && aliveIds.has(p.userId),
    )
    if (table.aborted) break

    if (presses.length === 0) {
      emptyRounds++
      if (emptyRounds >= 2) {
        await table.say('ما ضغط أحد في جولتين — أُوقفت اللعبة.')
        return await finish(table, state, scores, null)
      }
      await table.say('ما ضغط أحد — تُعاد الجولة.')
      await table.sleep(BREATH_MS)
      continue
    }
    emptyRounds = 0

    const seated = new Set(presses.slice(0, chairs).map((p) => p.userId))
    const standing = state.alive.filter((p) => !seated.has(p.id))

    for (const p of state.alive) {
      if (seated.has(p.id)) scores.set(p.id, (scores.get(p.id) ?? 0) + 1)
    }
    for (const p of standing) eliminate(table, state, p)

    await table.update(
      scene(
        table,
        state,
        'day',
        standing.length === 1 ? `خرج ${standing[0]?.name ?? ''}` : `خرج ${standing.length} لاعبين`,
        'من جلس يكمل، ومن وقف يتفرّج.',
        standing.length === 1 ? standing[0] : null,
      ),
      { text: `خرج: ${standing.map((p) => `<@${p.id}>`).join('، ')}` },
    )

    round++
    if (state.alive.length > 1) await table.sleep(BREATH_MS)
  }

  if (table.aborted) return { winnerId: null, scores }
  return await finish(table, state, scores, state.alive[0] ?? null)
}

/* ————— أدوات ————— */

type State = { alive: PlayerView[]; out: PlayerView[] }

async function finish(
  table: Table,
  state: State,
  scores: Map<string, number>,
  champion: PlayerView | null,
): Promise<GameResult> {
  if (champion) scores.set(champion.id, (scores.get(champion.id) ?? 0) + 2)

  await table.show(
    scene(
      table,
      state,
      'result',
      champion ? `فاز ${champion.name}` : 'انتهت بلا فائز',
      champion ? 'آخر من بقي على كرسيه.' : 'لم يبقَ لاعب واحد في النهاية.',
      champion,
    ),
    {
      text: champion
        ? `**الفائز** <@${champion.id}> — آخر من بقي على كرسيه.`
        : 'انتهت اللعبة بلا فائز.',
    },
  )

  return { winnerId: champion?.id ?? null, scores }
}

function scene(
  table: Table,
  state: State,
  phase: RolesScene['phase'],
  headline: string,
  detail: string,
  spotlight?: PlayerView | null,
): RolesScene {
  return {
    kind: 'roles',
    game: table.brief,
    phase,
    headline,
    detail,
    alive: state.alive,
    dead: state.out,
    ...(spotlight ? { spotlight } : {}),
  }
}

function eliminate(table: Table, state: State, player: PlayerView): void {
  state.alive = state.alive.filter((p) => p.id !== player.id)
  state.out = [...state.out, player]
  table.drop(player.id)
}

/** تمييز العدد في العربية أربع صيغ — «2 كراسي» خطأ يقرأه الجميع. */
function chairsWord(n: number): string {
  if (n === 1) return 'كرسي'
  if (n === 2) return 'كرسيان'
  if (n <= 10) return 'كراسي'
  return 'كرسيًا'
}
