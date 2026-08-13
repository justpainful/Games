import { setRoomMirror } from '../api/rooms.ts'
import { alias, type Session } from '../games/running.ts'
import type { Surface } from '../games/surface.ts'
import { guildConfig } from '../guilds/config.ts'
import { client } from './client.ts'
import { makeDiscordSurface } from './table.ts'

/**
 * يعكس غرف الجوال في قناة ديسكورد.
 *
 * ————————————————— لماذا كان الاتجاه واحدًا —————————————————
 *
 * لعبة تبدأ في قناة ديسكورد يقدر لاعب الجوال أن ينضمّ إليها، لأن الغرفة تحمل
 * قناتها معها. أما غرفة تبدأ من التطبيق فلا قناة لها أصلًا: معرّفها `room:xxx`
 * لا معرّف قناة، وقائمة أسطحها وصلات كلها. فلا شيء يُنشر في ديسكورد، ومن يجلس
 * هناك لا يعلم أن لعبة تدور.
 *
 * وهذا الملف يغلق الاتجاه الثاني: يعطي كل غرفة جوال سطحًا إضافيًا في قناة
 * الألعاب المضبوطة للسيرفر، فتُرى وتُلعب من الجهتين.
 *
 * ————————————————— لماذا القناة المضبوطة لا أي قناة —————————————————
 *
 * لو نشرنا في أول قناة نجدها لصارت اللعبة تظهر في مكان لا يتوقّعه أحد. وقناة
 * الألعاب المضبوطة في اللوحة هي الموضع الذي اختاره صاحب السيرفر لهذا بالضبط،
 * ومن لم يضبطها لا تُعكس غرفه — وهو سكوت مقصود لا عطل.
 */
export function installRoomMirror(): void {
  setRoomMirror(async (session: Session): Promise<Surface | null> => {
    const config = await guildConfig(session.guildId).catch(() => null)
    const channelId = config?.gamesChannel
    if (!channelId) return null

    const channel = await client.channels.fetch(channelId).catch(() => null)
    // `isSendable` تحمي من قناة صوتية أو فقدنا صلاحية الكتابة فيها
    if (!channel || !channel.isTextBased() || !channel.isSendable()) return null

    // لا يكفي أن تُعرض الغرفة في القناة: مدخلات ديسكورد تُوجَّه بمعرّف القناة،
    // وهذه الغرفة مسجّلة تحت `room:xxx`. فبلا هذا السطر يرى الناس اللعبة ولا
    // يقدرون على ضغطة ولا إجابة، وهو ما وقع فعلًا في أول تشغيل للمرآة.
    alias(channelId, session)

    return makeDiscordSurface({ channel, session })
  })
}
