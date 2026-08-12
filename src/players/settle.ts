import { prisma } from '../db/prisma.ts'
import type { GameResult } from '../games/define.ts'
import { awardMany, recordPlayed, type Wallet } from './points.ts'

/**
 * محاسبة نهاية اللعبة — **مشتركة بين كل الأسطح**.
 *
 * كانت مكرّرة في `src/discord/host.ts` و`src/api/ws.ts`، ونسخة تتقدّم على
 * الأخرى تعني أن رصيد اللاعب يختلف بحسب مكان لعبه. هي هنا مرة واحدة، فمن لعب
 * من الجوال في غرفة ديسكورد يُحاسَب بنفس القواعد حرفيًا.
 *
 * الأخطاء تُسجَّل ولا تُرمى: قاعدة بيانات متعثّرة يجب ألا تبتلع إعلان النتيجة
 * أمام اللاعبين بعد جولة كاملة.
 */

/** يفتح سجلّ مباراة، أو `null` إن تعذّر — النتيجة تُعلن في الحالتين. */
export async function openMatch(
  guildId: string,
  gameKey: string,
  players: number,
): Promise<string | null> {
  const match = await prisma.matchRecord
    .create({ data: { guildId, gameKey, players } })
    .catch((error: unknown) => {
      console.error('تعذّر فتح سجلّ المباراة:', error)
      return null
    })
  return match?.id ?? null
}

export async function settleMatch(args: {
  guildId: string
  wallet: Wallet
  /** كل من شارك — لا الفائزين وحدهم */
  players: string[]
  result: GameResult
  matchId?: string | null
}): Promise<void> {
  const { guildId, wallet, players, result, matchId } = args

  try {
    if (result.scores) await awardMany(guildId, wallet, result.scores)
    await recordPlayed(guildId, players, result.winnerId)
  } catch (error) {
    console.error('تعذّر حفظ النقاط:', error)
  }

  if (!matchId) return
  await prisma.matchRecord
    .update({
      where: { id: matchId },
      data: {
        endedAt: new Date(),
        winnerId: result.winnerId ?? null,
        // المشاركون يُكتبون عند الإغلاق لا عند الفتح: اللوبي يقبل داخلًا
        // وخارجًا حتى آخر لحظة، فقائمة الفتح ليست قائمة من لعب فعلًا.
        participants: players,
      },
    })
    .catch((error: unknown) => console.error('تعذّر إغلاق سجلّ المباراة:', error))
}
