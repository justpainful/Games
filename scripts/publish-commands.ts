/**
 * ينشر أوامر السلاش لدى ديسكورد.
 *
 *   npm run publish:commands
 *
 * يُشغَّل **يدويًا** لا عند كل إقلاع: تسجيل الأوامر العالمية محدود بـ200 مرة
 * يوميًا، وبوت يعيد التشغيل كثيرًا كان سيحرق الحصة ثم يتوقف عن التحديث بصمت.
 * البريفكس يعمل بلا هذا الأمر أصلًا.
 */
import { REST, Routes } from 'discord.js'
import { slashPayload } from '../src/discord/commands.ts'
import { registerAllCommands } from '../src/discord/registry.ts'
import { settings } from '../src/settings.ts'

async function main(): Promise<void> {
  await registerAllCommands()

  const { valid, rejected } = slashPayload()

  if (rejected.length > 0) {
    console.warn(
      `\nاستُبعدت ${rejected.length} أوامر لأن أسماءها لا تطابق قاعدة ديسكورد ` +
        `(حروف وأرقام وشرطة فقط، بلا مسافات):\n  ${rejected.join('، ')}\n` +
        `تعمل بالبريفكس ولا تظهر في قائمة السلاش.\n`,
    )
  }

  const rest = new REST({ version: '10' }).setToken(settings.token)
  await rest.put(Routes.applicationCommands(settings.appId), { body: valid })

  console.log(`نُشر ${valid.length} أمر سلاش.`)
  console.log('قد يستغرق ظهورها لدى المستخدمين حتى ساعة.')
}

main().catch((err) => {
  console.error('فشل النشر:', err)
  process.exit(1)
})
