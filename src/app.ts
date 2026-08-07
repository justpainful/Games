import { disconnectDb } from './db/prisma.ts'
import { client, connect } from './discord/client.ts'
import { registerAllCommands } from './discord/registry.ts'
import { abortAll } from './games/running.ts'
import { startRenderer, stopRenderer } from './images/browser.ts'

async function main(): Promise<void> {
  // المتصفح يُشغّل قبل الاتصال: أول لعبة يجب ألا تنتظر إحماء الصفحات
  await startRenderer()
  console.log('محرك الصور جاهز')

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
