import type { PlayerView } from '../scenes/scene.ts'
import type { ButtonDef, Table } from './define.ts'

/**
 * أدوات ألعاب الأطوار (مافيا، روليت، كراسي، هايد، تصويت، غرف).
 * المشترك بينها: التصويت، والإقصاء، والاختيار العشوائي.
 */

export type Tally = {
  /** من نال أعلى الأصوات، أو null عند التعادل أو غياب الأصوات */
  winnerId: string | null
  counts: Map<string, number>
  voters: number
  tied: boolean
}

/** أزرار تصويت، زر لكل مرشّح. */
export function candidateButtons(candidates: PlayerView[]): ButtonDef[] {
  return candidates.map((p) => ({
    id: `vote:${p.id}`,
    label: p.name.slice(0, 40),
    style: 'plain' as const,
  }))
}

/**
 * يجمع الأصوات خلال المدة ويحسب النتيجة.
 *
 * التعادل يُعاد بصراحة ولا يُكسر عشوائيًا: في مافيا، إعدام لاعب بقرعة عند
 * تعادل الأصوات يُفقد اللاعبين الثقة في اللعبة.
 */
export async function collectVotes(
  table: Table,
  candidates: PlayerView[],
  ms: number,
  opts: { eligible?: Set<string> } = {},
): Promise<Tally> {
  const valid = new Set(candidates.map((p) => p.id))

  const presses = await table.collectPresses(ms, (press) => {
    if (!press.id.startsWith('vote:')) return false
    if (opts.eligible && !opts.eligible.has(press.userId)) return false
    return valid.has(press.id.slice('vote:'.length))
  })

  const counts = new Map<string, number>()
  for (const press of presses) {
    const target = press.id.slice('vote:'.length)
    counts.set(target, (counts.get(target) ?? 0) + 1)
  }

  let winnerId: string | null = null
  let best = 0
  let tied = false
  for (const [id, n] of counts) {
    if (n > best) {
      best = n
      winnerId = id
      tied = false
    } else if (n === best) {
      tied = true
    }
  }

  return { winnerId: tied ? null : winnerId, counts, voters: presses.length, tied }
}

/** اختيار عشوائي — يُستخدم في الروليت وتوزيع أدوار المافيا. */
export function pickOne<T>(items: readonly T[]): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(Math.random() * items.length)]
}

/** خلط Fisher–Yates على نسخة — لا يعدّل المصفوفة الأصلية. */
export function shuffle<T>(items: readonly T[]): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}
