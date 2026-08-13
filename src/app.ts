import { disconnectDb } from './db/prisma.ts'
import { client, connect } from './discord/client.ts'
import { registerAllCommands } from './discord/registry.ts'
import { abortAll } from './games/running.ts'
import { startRenderer, stopRenderer } from './images/browser.ts'
import { installRoomMirror } from './discord/mirror.ts'
import { startLeadersTicker, stopLeadersTicker } from './discord/leaders-ticker.ts'

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

/**
 * خادم التحكّم المحلي — يقلع دائمًا ولا يُسقط البوت لو فشل.
 *
 * تشغيله بلا شرط مقصود: لوحة التحكّم لا تنفع إن كانت تحتاج متغيّر بيئة يُتذكّر
 * قبل كل تشغيل. وأشيع سبب لفشله منفذ مشغول، وذلك لا يجوز أن يمنع الألعاب.
 */
async function startPanelServer(): Promise<void> {
  try {
    const { startPanel } = await import('./panel/serve.ts')
    await startPanel()
  } catch (err) {
    console.error('تعذّر تشغيل لوحة التحكّم — البوت يكمل بدونها:', err)
  }
}

async function main(): Promise<void> {
  // المتصفح يُشغّل قبل الاتصال: أول لعبة يجب ألا تنتظر إحماء الصفحات
  await startRenderer()
  console.log('محرك الصور جاهز')

  await startApiIfAsked()
  await startPanelServer()
  // قبل الاتصال: غرفة تُفتح من التطبيق في أول ثانية يجب أن تجد مرآتها جاهزة
  installRoomMirror()
  await registerAllCommands()
  await connect()
  // بعد الاتصال: المؤقّت يحتاج عميلًا حيًّا ليجلب القناة والأعضاء
  startLeadersTicker()
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
  stopLeadersTicker()
  // وداع Bonjour صريح: بلاه يبقى اسم ميت على الشبكة يجده التطبيق ويحاول وصله
  await import('./panel/discovery.ts')
    .then((m) => m.unadvertise())
    .catch(() => {})
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
