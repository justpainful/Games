import type { PlayerView } from '../scenes/scene.ts'
import type { ButtonDef, Press, Table } from './define.ts'

/**
 * أدوات ألعاب الأدوار (xo، حجرة، اشبك، نرد، بومب).
 *
 * هذه ليست إطارًا يبتلع اللعبة — الخمس ألعاب مختلفة فعلًا في قواعدها.
 * المشترك بينها ثلاثة أشياء فقط: تدوير الدور، انتظار لاعب بعينه، ومهلة تُسقِط
 * المتقاعس. وهذا ما تقدّمه هذه الأدوات، ولا شيء غيره.
 */

/** يدوّر الأدوار بلا نهاية على اللاعبين الأحياء. */
export function* rotate(players: PlayerView[]): Generator<PlayerView> {
  let i = 0
  while (players.length > 0) {
    yield players[i % players.length]!
    i++
  }
}

/**
 * ينتظر ضغطة من لاعب بعينه.
 * `null` تعني أنه تأخّر — واللعبة تقرّر هل تتخطّاه أم تُقصيه.
 */
export async function awaitTurn(
  table: Table,
  playerId: string,
  ms: number,
  test?: (press: Press) => boolean,
): Promise<Press | null> {
  return table.waitPress(ms, (press) => {
    if (press.userId !== playerId) return false
    return test ? test(press) : true
  })
}

/** ينتظر إجابة مكتوبة من لاعب بعينه — تستخدمها «بومب». */
export async function awaitTyped(
  table: Table,
  playerId: string,
  ms: number,
  test: (text: string) => boolean,
): Promise<string | null> {
  const hit = await table.waitChat(ms, (input) => input.userId === playerId && test(input.text))
  return hit?.text ?? null
}

/** شبكة أزرار من خانات لوحة — تخدم إكس أو وأربعة في صف. */
export function gridButtons(
  cells: (string | null)[],
  opts: { cols: number; label: (index: number, value: string | null) => string },
): ButtonDef[] {
  return cells.map((value, index) => ({
    id: `cell:${index}`,
    label: opts.label(index, value),
    style: 'plain' as const,
    disabled: value !== null,
  }))
}

export function cellIndex(pressId: string): number | null {
  const match = /^cell:(\d+)$/.exec(pressId)
  return match?.[1] ? Number(match[1]) : null
}
