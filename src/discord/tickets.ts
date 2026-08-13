import type { ButtonInteraction } from 'discord.js'

/**
 * يمسك التفاعل الذي وُلدت منه ضغطة زر، ليُردّ عليه لاحقًا برسالة مخفية.
 *
 * الرسالة المخفية في ديسكورد ليست وجهةً تُرسل إليها، بل **ردّ على تفاعل**.
 * فلا يكفي أن نعرف من ضغط: يلزم الإمساك بالتفاعل نفسه. وطبقة اللعبة لا يجوز
 * أن تراه — قاعدة المشروع أن اللعبة لا تعرف ديسكورد — فتحمل الضغطة تذكرة
 * معتمة، ويبقى التفاعل هنا.
 *
 * والذاكرة تُنظَّف بالوقت لا بالاستعمال: أغلب الضغطات لا يُردّ عليها بشيء خاص،
 * فلو انتظرنا استهلاك التذكرة لتراكمت التفاعلات إلى ما لا نهاية. وربع الساعة
 * هو عمر التفاعل عند ديسكورد أصلًا، فما بعده لا ينفع الاحتفاظ به.
 */

const TTL_MS = 15 * 60_000

type Held = { interaction: ButtonInteraction; at: number }

const held = new Map<string, Held>()
let counter = 0

function sweep(): void {
  const cutoff = Date.now() - TTL_MS
  for (const [key, entry] of held) {
    if (entry.at < cutoff) held.delete(key)
  }
}

export function holdInteraction(interaction: ButtonInteraction): string {
  sweep()
  counter += 1
  const ticket = `${Date.now().toString(36)}-${counter.toString(36)}`
  held.set(ticket, { interaction, at: Date.now() })
  return ticket
}

/** يعيد التفاعل إن كان ما يزال حيًّا، و`null` إن انقضى أو لم يكن من هذا السطح. */
export function takeInteraction(ticket: string | undefined): ButtonInteraction | null {
  if (!ticket) return null
  const entry = held.get(ticket)
  if (!entry) return null
  if (entry.at < Date.now() - TTL_MS) {
    held.delete(ticket)
    return null
  }
  return entry.interaction
}
