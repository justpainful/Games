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
import { renderScene } from '../images/render.ts'
import type { Scene } from '../scenes/scene.ts'
import { AttachmentBuilder } from 'discord.js'
import { editScene, sendScene } from './reply.ts'
import { takeInteraction } from './tickets.ts'

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

/**
 * ديسكورد يسمح بخمسة صفوف في خمسة أزرار.
 *
 * الرصّ التلقائي يملأ الصف خمسةً ثم ينتقل، فتسع خانات تخرج 5+4 وتُقرأ شريطين
 * لا شبكة. الزر الذي يعلن صفّه يُحترم إعلانه، فتخرج لوحة إكس أو ثلاثة في
 * ثلاثة كما هي. وما لا يعلن يُرصّ كما كان.
 */
function rows(buttons: ButtonDef[]): ActionRowBuilder<ButtonBuilder>[] {
  const build = (b: ButtonDef): ButtonBuilder => {
    const button = new ButtonBuilder()
      .setCustomId(b.id)
      .setStyle(STYLE[b.style ?? 'plain'])
      .setDisabled(b.disabled ?? false)
    if (b.emoji) button.setEmoji(b.emoji)

    /**
     * النص يبقى دائمًا، ولو كان معه إيموجي.
     *
     * كان يسقط متى وُجد إيموجي طلبًا لزرٍّ أنظف، وكان ذلك خطأً كلّفنا لوحة
     * كاملة. معرّف إيموجي التطبيق **يتغيّر مع كل توليد**، لأن الرفع يحذف
     * القديم وينشئ جديدًا. والرسائل المنشورة تحتفظ بالمعرّف القديم، فتصير
     * أزرارها بعد أول توليد إيموجيًا محذوفًا بلا نصّ يسنده: مربّعات فارغة
     * لا تُقرأ، واللاعب يظنّ الأزرار معطّلة.
     *
     * وهذا ليس حادثًا عابرًا بل نتيجة حتمية لكل تحديث للطقم. فالنص هنا ليس
     * زينة تُحذف عند الازدحام، بل الطبقة التي تُبقي الزر مفهومًا حين يسقط ما
     * فوقه. والازدحام ثمن مقبول مقابل زر لا يختفي.
     */
    // ونصّ فارغ يرفضه ديسكورد ويُسقط الرسالة كلّها، فيبقى الإيموجي وحده حينها
    const label = b.label.trim().slice(0, 80)
    if (label) button.setLabel(label)
    else if (!b.emoji) button.setLabel('•')
    return button
  }

  const declared = buttons.some((b) => b.row !== undefined)
  const groups = new Map<number, ButtonDef[]>()

  buttons.forEach((b, index) => {
    const key = declared ? (b.row ?? 0) : Math.floor(index / 5)
    const group = groups.get(key) ?? []
    if (group.length < 5) group.push(b)
    groups.set(key, group)
  })

  return [...groups.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, 5)
    .map(([, group]) => new ActionRowBuilder<ButtonBuilder>().addComponents(group.map(build)))
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

    /**
     * رسالة مخفية ردًّا على الضغطة: يراها ضاغطها وحده في نفس القناة.
     *
     * `followUp` لا `reply` لأن `client.ts` أجّل التفاعل فور وصوله بـ
     * `deferUpdate`، وذلك يمنع ظهور «فشل التفاعل» عند كل ضغطة عادية. والمؤجَّل
     * لا يُردّ عليه مرة ثانية، فالمتابعة هي الباب الباقي.
     */
    async reveal(press, scene, opts) {
      const interaction = takeInteraction(press.ticket)
      if (!interaction) return false
      if (interaction.channelId !== session.channelId) return false

      try {
        const png = await renderScene(scene)
        await interaction.followUp({
          ephemeral: true,
          ...(opts?.text ? { content: opts.text } : {}),
          files: [new AttachmentBuilder(png, { name: 'scene.png' })],
          ...(opts?.buttons ? { components: rows(opts.buttons) } : {}),
        })
        return true
      } catch {
        // تفاعل منتهٍ أو قناة فقدنا صلاحيتها — الفشل يعود false ليجرّب غيرنا
        return false
      }
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
