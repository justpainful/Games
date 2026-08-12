import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type TextBasedChannel,
} from 'discord.js'
import type { ButtonDef, ShowOptions } from '../games/define.ts'
import type { Session } from '../games/running.ts'
import type { Surface } from '../games/surface.ts'
import type { Scene } from '../scenes/scene.ts'
import { editScene, sendScene } from './reply.ts'

/**
 * ديسكورد بوصفه **سطحًا** لا طاولة كاملة.
 *
 * كان هذا الملف ينفّذ `Table` بأكملها، فكانت اللعبة مربوطة بسطح واحد بحكم
 * البناء. صار ينفّذ `Surface` وحده — العرض والهمس — وتتولّى `fanout` في
 * `src/games/surface.ts` جمعه مع أسطح الجوال في طاولة واحدة. هذا هو التغيير
 * الذي جعل اللعب عبر السطحين معًا ممكنًا، ولم يتغيّر شيء فيما يراه لاعب ديسكورد.
 */

const STYLE: Record<NonNullable<ButtonDef['style']>, ButtonStyle> = {
  start: ButtonStyle.Success,
  join: ButtonStyle.Primary,
  stop: ButtonStyle.Danger,
  plain: ButtonStyle.Secondary,
}

function rows(buttons: ButtonDef[]): ActionRowBuilder<ButtonBuilder>[] {
  const out: ActionRowBuilder<ButtonBuilder>[] = []
  // ديسكورد يسمح بخمسة أزرار في الصف وخمسة صفوف كحد أقصى
  for (let i = 0; i < buttons.length && out.length < 5; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>()
    for (const b of buttons.slice(i, i + 5)) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(b.id)
          .setLabel(b.label.slice(0, 80))
          .setStyle(STYLE[b.style ?? 'plain'])
          .setDisabled(b.disabled ?? false),
      )
    }
    out.push(row)
  }
  return out
}

export type DiscordSurface = Surface & {
  /** يزيل الأزرار من آخر مشهد بلا إعادة رندر — تُستعمل عند إغلاق اللوبي. */
  clearButtons(): Promise<void>
}

export function makeDiscordSurface(args: {
  channel: TextBasedChannel
  session: Session
}): DiscordSurface {
  const { channel, session } = args
  let last: Message | null = null

  /**
   * `update` يحرّر المشهد في مكانه، و`show` ينشر جديدًا ويُبقي ما قبله.
   *
   * هذا هو العقد الأصلي، وقد كسرتُه مرتين قبل أن أفهم أين يقع الخط. الخط ليس
   * بين لعبة وأخرى بل بين نوعَي مشهد:
   *
   *   حالة تتبدّل   لوحة، عجلة، عدّاد لوبي     -> `update` -> تحرير في مكانه
   *   تسلسل يتراكم  سؤال، جولة، نتيجة نهائية   -> `show`   -> رسالة تبقى
   *
   * حذف السابق في `show` يمحو سجلّ لعبة تسأل عشرة أسئلة. وتحرير المشهد في
   * `show` يخلط عشرة أسئلة في رسالة واحدة. وكلاهما جُرِّب.
   *
   * فلعبة تُغرق القناة بـ`show` مشكلتها في اللعبة لا هنا: تلك حالة تتبدّل
   * كُتبت كأنها تسلسل، وعلاجها في ملف اللعبة.
   */
  async function send(scene: Scene, opts: ShowOptions | undefined, replace: boolean): Promise<void> {
    const components = opts?.buttons ? rows(opts.buttons) : []

    if (replace && last) {
      const edited = await editScene(last, scene, opts?.text ?? '', components)
      if (edited) {
        last = edited
        session.liveMessageId = edited.id
        return
      }
      // فشل التحرير يعني رسالة لم تعد موجودة، فيُسقط إلى إرسال جديد
    }

    const message = await sendScene(channel, scene, opts?.text ?? '', components)
    if (!message) return

    last = message
    // الضغطات على مشاهد قديمة تُرفض في running.deliverPress
    session.liveMessageId = message.id
  }

  return {
    id: `discord:${session.channelId}`,

    /**
     * القناة لا «تملك» لاعبًا بعينه: كل من في القناة يراها.
     * لذلك `owns` دائمًا false، و`fallback` true — الهمس يصل لمن لا وصلة له
     * عبر الخاص، وهو نفس سلوك اليوم بالضبط.
     */
    owns: () => false,
    fallback: true,

    present: (scene, opts, replace) => send(scene, opts, replace),

    async say(text) {
      if (channel.isSendable()) await channel.send(text).catch(() => {})
    },

    async whisper(userId, text) {
      const user = await channel.client.users.fetch(userId).catch(() => null)
      if (!user) return false
      // كثير من المستخدمين يقفلون الخاص — الفشل هنا متوقّع ولا يوقف اللعبة
      const dm = await user.send(text).catch(() => null)
      return dm !== null
    },

    /**
     * الجيتواي لا يعرف الأسطح: رسائل القناة وضغطاتها تصل بالـ `channelId` عبر
     * `deliverChat`/`deliverPress`، وهما يصبّان في مجمّع الجلسة نفسه الذي يقرأ
     * منه `fanout`. فلا شيء يُربط هنا، والدمج يحدث تلقائيًا.
     */
    attach: () => {},
    detach: () => {},

    /** لا حالة لكل لاعب في القناة، فإخراج لاعب لا يغيّر شيئًا في السطح. */
    drop: () => {},

    async clearButtons() {
      if (last) await last.edit({ components: [] }).catch(() => {})
    },
  }
}
