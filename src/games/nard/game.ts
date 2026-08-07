import type { DuelScene, PlayerView, StandingsScene } from '../../scenes/scene.ts'
import type { ButtonDef, GameResult, Table } from '../define.ts'
import { defineGame } from '../define.ts'
import { awaitTurn } from '../turns.ts'

/**
 * «نرد» — ثلاث رميات لكل لاعب، وأعلى مجموع يفوز.
 *
 * لعبة حظّ خالص، ولذلك قرار المهلة فيها مختلف عن بقية ألعاب الأدوار: من لا
 * يضغط في وقته **لا يُقصى ولا تُصفَّر رميته** — الانتظار وحده هو ما يُتخطّى،
 * والنردان يقعان تلقائيًا. إقصاء لاعب من لعبة لا مهارة فيها عقوبة على تأخّر
 * ثانيتين، وتصفير رميته يفسد اللعبة نفسها. اللعبة محدودة أصلًا (ثلاث رميات
 * × عدد اللاعبين) فلا يمكن أن تعلّق مهما تأخّر الجميع.
 *
 * المشهد مواجهة رغم أن اللاعبين قد يكونون ثمانية: على اليمين صاحب الدور،
 * وعلى اليسار المتصدّر من غيره. المواجهة الحقيقية في هذه اللعبة هي مع الرقم
 * الذي يجب تجاوزه، لا مع كل اللاعبين دفعة واحدة.
 */

const ROLLS = 3
const ROLL_MS = 25_000
const BREATH_MS = 2_500
const FACES = 6

const ROLL_BUTTON: ButtonDef[] = [{ id: 'roll', label: 'ارمِ النرد', style: 'start' }]

const die = (): number => 1 + Math.floor(Math.random() * FACES)

async function play(table: Table): Promise<GameResult> {
  const order = [...table.players]
  if (order.length < 2) return { winnerId: null }

  const totals = new Map<string, number>(order.map((p) => [p.id, 0]))
  const last = new Map<string, string>(order.map((p) => [p.id, '—']))

  for (let round = 1; round <= ROLLS; round++) {
    if (table.aborted) break

    for (const player of order) {
      if (table.aborted) break

      const rival = leader(order, totals, player.id) ?? player
      const view = { round: { index: round, total: ROLLS } }

      await table.show(
        duel(table, player, rival, '؟', last.get(rival.id) ?? '—', totals, 'دور الرمي', view.round),
        {
          text: `<@${player.id}> دورك — اضغط «ارمِ النرد».`,
          buttons: ROLL_BUTTON,
        },
      )

      const press = await awaitTurn(table, player.id, ROLL_MS, (p) => p.id === 'roll')
      if (table.aborted) break

      const one = die()
      const two = die()
      const sum = one + two
      const label = `${one} + ${two} = ${sum}`
      totals.set(player.id, (totals.get(player.id) ?? 0) + sum)
      last.set(player.id, label)

      const after = leader(order, totals, player.id) ?? rival
      await table.update(
        duel(
          table,
          player,
          after,
          label,
          last.get(after.id) ?? '—',
          totals,
          verdict(totals, player, after),
          view.round,
        ),
        {
          text:
            (press ? `<@${player.id}> رمى **${sum}**` : `<@${player.id}> تأخّر — سقط النرد عنه **${sum}**`) +
            ` — مجموعه ${totals.get(player.id) ?? 0}`,
        },
      )

      await table.sleep(BREATH_MS)
    }
  }

  return await finish(table, order, totals)
}

/** المتصدّر من غير `exceptId` — هو الرقم الذي على صاحب الدور تجاوزه. */
function leader(
  players: PlayerView[],
  totals: Map<string, number>,
  exceptId: string,
): PlayerView | null {
  let best: PlayerView | null = null
  for (const p of players) {
    if (p.id === exceptId) continue
    if (!best || (totals.get(p.id) ?? 0) > (totals.get(best.id) ?? 0)) best = p
  }
  return best
}

function verdict(totals: Map<string, number>, player: PlayerView, rival: PlayerView): string {
  const mine = totals.get(player.id) ?? 0
  const theirs = totals.get(rival.id) ?? 0
  if (player.id === rival.id) return 'رمية جديدة'
  if (mine > theirs) return `تقدّم بـ ${mine - theirs}`
  if (mine < theirs) return `خلفه بـ ${theirs - mine}`
  return 'تعادل في المجموع'
}

function duel(
  table: Table,
  player: PlayerView,
  rival: PlayerView,
  labelPlayer: string,
  labelRival: string,
  totals: Map<string, number>,
  text: string,
  round: { index: number; total: number },
): DuelScene {
  return {
    kind: 'duel',
    game: table.brief,
    left: { player, label: labelPlayer, score: totals.get(player.id) ?? 0 },
    right: { player: rival, label: labelRival, score: totals.get(rival.id) ?? 0 },
    verdict: text,
    round,
  }
}

/**
 * التعادل على الصدارة لا فائز فيه — نفس قاعدة بقية الألعاب. إعلان فائز
 * بقرعة في لعبة حظّ يضيف حظًّا فوق حظّ ولا يضيف عدلًا.
 */
async function finish(
  table: Table,
  order: PlayerView[],
  totals: Map<string, number>,
): Promise<GameResult> {
  // بعد أمر الإيقاف لا فائز ولا مشهد نهائي
  if (table.aborted) return { winnerId: null }

  const rows: StandingsScene['rows'] = order
    .map((player) => ({ player, score: totals.get(player.id) ?? 0 }))
    .sort((a, b) => b.score - a.score)

  const top = rows[0]?.score ?? 0
  const leaders = rows.filter((r) => r.score === top)
  const winner = leaders.length === 1 ? leaders[0]?.player ?? null : null

  const scores = new Map<string, number>(order.map((p) => [p.id, 0]))
  if (winner) scores.set(winner.id, 3)
  else for (const row of leaders) scores.set(row.player.id, 1)

  await table.show(
    { kind: 'standings', game: table.brief, rows, heading: 'النتيجة النهائية' },
    {
      text: winner
        ? `**الفائز** <@${winner.id}> بمجموع ${top}`
        : `**تعادل على الصدارة** بمجموع ${top} — ${leaders.map((r) => `<@${r.player.id}>`).join(' و')}`,
    },
  )

  return { winnerId: winner?.id ?? null, scores }
}

export default defineGame({
  key: 'nard',
  name: 'نرد',
  aliases: ['النرد', 'زهر'],
  tagline: 'ثلاث رميات ومن يجمع أكثر يفوز',
  howTo:
    'كل لاعب يرمي نردين ثلاث مرات، ومجموع الرميات الثلاث هو نتيجته. ' +
    'في دورك اضغط «ارمِ النرد»، ومن تأخّر سقط النرد عنه تلقائيًا فلا تتعطّل اللعبة. ' +
    'صاحب أعلى مجموع يفوز، وإن تساوى الأعلى فلا فائز.',
  players: { min: 2, max: 8 },
  wallet: 'solo',
  play,
})
