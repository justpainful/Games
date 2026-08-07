import { disconnectDb } from './db/prisma.ts'
import { client, connect } from './discord/client.ts'
import { registerAllCommands } from './discord/registry.ts'
import { abortAll } from './games/running.ts'
import { startRenderer, stopRenderer } from './images/browser.ts'

/**
 * الـ API داخل عملية البوت — **شرط جسر ديسكورد**.
 *
 * سجلّ الجلسات في `games/running.ts` في الذاكرة، فلا يعبر حدود العمليات. حين
 * يعمل الخادم هنا يرى لاعب الجوال لعبة القناة فورًا وينضم إليها. تشغيله
 * منفصلًا بـ `npm run api` يبقى صالحًا لكل شيء عدا هذا الجسر.
 *
 * الاستيراد كسول عمدًا: `src/api/env.ts` يفشل بلا أسرار الـ API، ولا يجوز أن
 * يمنع البوت من العمل عند من لا يشغّل التطبيق أصلًا.
 */
async function startApiIfAsked(): Promise<void> {
  if (process.env['API_IN_PROCESS'] !== '1') return
  try {
    const { startApiServer } = await import('./api/server.ts')
    await startApiServer()
  } catch (err) {
    console.error('تعذّر تشغيل الـ API داخل عملية البوت — البوت يكمل بدونه:', err)
  }
}

async function main(): Promise<void> {
  // المتصفح يُشغّل قبل الاتصال: أول لعبة يجب ألا تنتظر إحماء الصفحات
  await startRenderer()
  console.log('محرك الصور جاهز')

  await startApiIfAsked()
  await registerAllCommands()
  await connect()
}

/**
 * إطفاء آمن: الألعاب في الذاكرة، فإعادة التشغيل بلا إعلان تترك لاعبين
 * ينتظرون صورة لن تأتي أبدًا.
 */
let shuttingDown = false
async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return
  shuttingDown = true
  console.log(`\n${signal} — إيقاف آمن...`)

  const sessions = abortAll()
  await Promise.all(
    sessions.map(async (s) => {
      const channel = await client.channels.fetch(s.channelId).catch(() => null)
      if (channel?.isTextBased() && channel.isSendable()) {
        await channel.send('البوت يُعاد تشغيله — أُلغيت اللعبة الحالية.').catch(() => {})
      }
    }),
  )

  await client.destroy()
  await stopRenderer()
  await disconnectDb()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))

process.on('unhandledRejection', (err) => console.error('وعد مرفوض بلا معالجة:', err))

main().catch(async (err) => {
  console.error('فشل التشغيل:', err)
  await stopRenderer().catch(() => {})
  process.exit(1)
})
