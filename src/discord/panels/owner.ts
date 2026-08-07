import { DiscordAPIError, RateLimitError, type ClientUser } from 'discord.js'
import type { Command } from '../commands.ts'
import {
  ack,
  actionMenu,
  askText,
  noticeReply,
  ok,
  openPanel,
  warn,
  withTimeout,
  type PanelArgs,
  type PanelSpec,
  type PanelView,
} from './shared.ts'

/**
 * لوحة مالك البوت — هوية الحساب نفسه.
 *
 * **لماذا هي هنا وحدها:** الاسم والصورة والبانر ليست إعدادات سيرفر، بل حقول
 * في حساب البوت الواحد لدى ديسكورد. تغييرها من سيرفر يغيّرها في **كل** سيرفر
 * فيه البوت في اللحظة نفسها. ومعدّلها محدود بصرامة: الاسم مرّتان في الساعة،
 * والصورة والبانر أقل. لو كانت في لوحة المشرفين لاستهلك مشرف واحد الحدّ على
 * الجميع، ولوجد آلاف المستخدمين بوتًا باسم لا يعرفونه.
 *
 * ولذلك كل خطأ هنا يُترجم إلى جملة مفهومة، ولا يُترك استثناءً خامًا في السجل.
 */

/** الاسم يقبل بين حرفين واثنين وثلاثين حرفًا لدى ديسكورد. */
const NAME_MIN = 2
const NAME_MAX = 32

async function view({ guild }: PanelArgs): Promise<PanelView> {
  const me = guild.client.user
  // القراءة تحدّث البانر: الكاش لا يحمله ما لم يُجلب الحساب صراحةً
  const fresh = await withTimeout(me.fetch(), 5_000).catch(() => me)

  return {
    scene: {
      kind: 'panel',
      title: 'لوحة مالك البوت',
      subtitle: 'تغييرات عالمية',
      items: [
        { label: 'اسم البوت', value: fresh.username },
        { label: 'صورة البوت', value: fresh.avatar ? 'مضبوطة' : 'الافتراضية', on: !!fresh.avatar },
        { label: 'بانر البوت', value: fresh.banner ? 'مضبوط' : 'ما فيه', on: !!fresh.banner },
        { label: 'السيرفرات', value: `${guild.client.guilds.cache.size} سيرفر` },
      ],
      footer:
        'تحذير: هذه الثلاثة تخصّ حساب البوت لا هذا السيرفر — تغييرها يظهر فورًا ' +
        'في كل السيرفرات، وديسكورد يحدّ من تكراره بصرامة (الاسم مرّتان في الساعة).',
    },
    text:
      '**لوحة مالك البوت** — تحذير: تغيير الاسم أو الصورة أو البانر يطال ' +
      `كل ${guild.client.guilds.cache.size} سيرفر، ولا يمكن التراجع فورًا بسبب حدود المعدل.`,
    rows: [
      actionMenu('owner:action', 'اختر ما تغيّره — كل الخيارات عالمية', [
        {
          value: 'name',
          label: 'تغيير اسم البوت (عالمي)',
          description: 'يظهر في كل السيرفرات — مرّتان في الساعة كحد أقصى',
        },
        {
          value: 'avatar',
          label: 'تغيير صورة البوت (عالمي)',
          description: 'رابط https لصورة — تظهر في كل السيرفرات',
        },
        {
          value: 'banner',
          label: 'تغيير بانر البوت (عالمي)',
          description: 'رابط https لصورة عريضة في ملف البوت',
        },
        {
          value: 'banner-clear',
          label: 'إزالة بانر البوت (عالمي)',
          description: 'يرجع ملف البوت بلا بانر',
        },
      ]),
    ],
  }
}

const spec: PanelSpec = {
  need: 'ownerPanel',
  render: view,

  async handle({ guild, interaction }) {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'owner:action') return false

    const me = guild.client.user
    const choice = interaction.values[0]

    if (choice === 'banner-clear') {
      await ack(interaction)
      return apply(interaction, () => me.setBanner(null), 'أُزيل البانر', 'ما عاد للبوت بانر.')
    }

    if (choice === 'name') {
      const asked = await askText(interaction, {
        title: 'تغيير اسم البوت',
        label: 'الاسم الجديد (عالمي)',
        hint: 'يظهر في كل السيرفرات — ديسكورد يسمح بمرّتين في الساعة',
        value: me.username,
        max: NAME_MAX,
      })
      if (!asked) return false

      if (asked.value.length < NAME_MIN) {
        await noticeReply(
          asked.submit,
          warn('اسم قصير', `الاسم لا يقل عن ${NAME_MIN} حرفين ولا يزيد على ${NAME_MAX}.`),
        )
        return false
      }
      return apply(
        asked.submit,
        () => me.setUsername(asked.value),
        'تغيّر اسم البوت',
        `صار اسمي «${asked.value}» في كل السيرفرات.`,
      )
    }

    if (choice === 'avatar' || choice === 'banner') {
      const isAvatar = choice === 'avatar'
      const asked = await askText(interaction, {
        title: isAvatar ? 'تغيير صورة البوت' : 'تغيير بانر البوت',
        label: 'رابط الصورة (عالمي)',
        hint: 'رابط https مباشر لصورة png أو jpg أو gif',
        max: 400,
      })
      if (!asked) return false

      // مسار محلي هنا يجعل ديسكورد.js يقرأ ملفًا من قرص الخادم ويرفعه
      if (!isHttpsLink(asked.value)) {
        await noticeReply(
          asked.submit,
          warn('رابط غير صالح', 'لازم يبدأ بـ https:// ويكون رابطًا مباشرًا لصورة.'),
        )
        return false
      }

      return apply(
        asked.submit,
        () => (isAvatar ? me.setAvatar(asked.value) : me.setBanner(asked.value)),
        isAvatar ? 'تغيّرت صورة البوت' : 'تغيّر بانر البوت',
        'ظهر التغيير في كل السيرفرات.',
      )
    }

    await ack(interaction)
    return false
  },
}

/** ينفّذ تغييرًا عالميًا ويترجم أي فشل إلى جملة يفهمها الإنسان. */
async function apply(
  i: Parameters<typeof noticeReply>[0],
  action: () => Promise<ClientUser>,
  title: string,
  body: string,
): Promise<boolean> {
  try {
    await withTimeout(action())
    await noticeReply(i, ok(title, body))
    return true
  } catch (err) {
    console.error('فشل تغيير هوية البوت:', err)
    await noticeReply(i, warn('ما نفّذت التغيير', explain(err)))
    return false
  }
}

/**
 * ترجمة الخطأ.
 *
 * `TIMEOUT` هو الحالة الشائعة لا الاستثناء: ديسكورد.js لا يرمي عند 429 بل
 * **ينتظر** المدة المطلوبة — وهي هنا ساعة كاملة. بلا هذا السقف تبقى اللوحة
 * معلّقة بلا رد، ويقرأ المالك ذلك «تعطّل البوت».
 */
function explain(err: unknown): string {
  if (err instanceof Error && err.message === 'TIMEOUT') {
    return (
      'ديسكورد أجّل الطلب بسبب حد المعدل. اسم البوت يتغيّر مرّتين في الساعة فقط، ' +
      'والصورة والبانر أقل. جرّب بعد ساعة.'
    )
  }

  if (err instanceof RateLimitError) {
    const minutes = Math.max(1, Math.ceil(err.timeToReset / 60_000))
    return `تجاوزت حد المعدل عند ديسكورد. جرّب بعد ${minutes} دقيقة تقريبًا.`
  }

  if (err instanceof DiscordAPIError) {
    if (err.status === 429) {
      return 'تجاوزت حد المعدل عند ديسكورد. جرّب بعد ساعة.'
    }
    if (err.code === 50035) {
      return (
        'ديسكورد رفض القيمة: إمّا أن الاسم مستخدم أو فيه محارف ممنوعة، ' +
        'أو أنك بدّلت الاسم مرّتين خلال الساعة الماضية.'
      )
    }
    if (err.status === 400) {
      return 'الرابط ما رجّع صورة صالحة. لازم يكون رابطًا مباشرًا لملف png أو jpg أو gif.'
    }
    return `ديسكورد ردّ بخطأ ${err.status}. جرّب بعد شوي.`
  }

  return 'ما وصلت لديسكورد. تأكد من الرابط وجرّب مرة ثانية.'
}

function isHttpsLink(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

export const ownerPanelCommands: Command[] = [
  {
    name: 'المالك',
    aliases: ['لوحة-المالك', 'اعدادات-المالك'],
    description: 'لوحة مالك البوت — اسم البوت وصورته وبانره (تغييرات عالمية)',
    needs: 'ownerPanel',
    run: (ctx) => openPanel(ctx, spec),
  },
]
