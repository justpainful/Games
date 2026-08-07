import { UserSelectMenuBuilder } from 'discord.js'
import { prisma } from '../../db/prisma.ts'
import { forgetGuild } from '../../guilds/config.ts'
import type { Command } from '../commands.ts'
import {
  ack,
  actionMenu,
  askText,
  noticeReply,
  ok,
  onOff,
  openPanel,
  row,
  warn,
  withTimeout,
  type PanelArgs,
  type PanelSpec,
  type PanelView,
} from './shared.ts'

/**
 * لوحة «اعدادات البوت الاساسيه».
 *
 * **ما ليس هنا عمدًا:** اسم البوت وصورته وبانره. تلك الثلاثة حساب واحد لدى
 * ديسكورد، فتغييرها من سيرفر يغيّرها في كل سيرفر يملك فيه البوت حسابًا —
 * ومعدّلها محدود بصرامة (مرّتان في الساعة للاسم). وضعها في لوحة يفتحها كل
 * مشرف يعني أن مشرفًا واحدًا يعيد تسمية البوت عند آلاف الناس ويستهلك الحدّ
 * على الجميع. مكانها `owner.ts` لمالك البوت وحده، وبديلها هنا **اسم مستعار
 * خاص بالسيرفر** عبر `guild.members.me.setNickname()`.
 */

const AUTHORIZED_CAP = 25

function view({ config, guild }: PanelArgs): PanelView {
  const authorized = [...config.authorized]

  const spec: PanelView = {
    scene: {
      kind: 'panel',
      title: 'اعدادات البوت الاساسيه',
      subtitle: guild.name,
      items: [
        { label: 'البريفكس', value: config.prefix },
        {
          label: 'أوامر البريفكس',
          value: config.prefixEnabled ? 'مفعّلة' : 'معطّلة',
          on: config.prefixEnabled,
        },
        {
          label: 'الاسم المستعار في السيرفر',
          value: config.nickname ?? 'بلا اسم مستعار',
          on: config.nickname !== null,
        },
        {
          label: 'المصرح لهم بالإعدادات',
          value: authorized.length === 0 ? 'ما فيه أحد' : `${authorized.length} شخص`,
        },
      ],
      footer: 'اسم البوت وصورته وبانره تُغيَّر من لوحة المالك وحدها — تغييرها يطال كل السيرفرات',
    },
    // البريفكس بين «» لا بين علامتَي كود: بريفكس ` نفسه يكسر تنسيق الرسالة
    text:
      `**اعدادات البوت الاساسيه** — البريفكس «${config.prefix}» ` +
      `(${onOff(config.prefixEnabled)}) · المصرح لهم: ${authorized.length}`,
    rows: [
      actionMenu('bot:action', 'اختر إعدادًا لتغييره', [
        {
          value: 'prefix',
          label: 'تغيير البريفكس',
          description: 'الحرف الذي يسبق الأوامر النصية',
        },
        {
          value: 'prefix-toggle',
          label: config.prefixEnabled ? 'تعطيل أوامر البريفكس' : 'تفعيل أوامر البريفكس',
          description: 'عند التعطيل تبقى أوامر السلاش وحدها',
        },
        {
          value: 'nickname',
          label: 'تغيير الاسم المستعار في السيرفر',
          description: 'اسم البوت هنا فقط — لا يمسّ بقية السيرفرات',
        },
        {
          value: 'nickname-clear',
          label: 'إزالة الاسم المستعار',
          description: 'يرجع البوت لاسمه العام',
        },
      ]),
      authorizedMenu(authorized),
    ],
  }
  return spec
}

/**
 * قائمة المصرح لهم تُعرض **مملوءة بالحالة الحالية**: ما يبقى محدَّدًا يبقى،
 * وما يُزال يُزال. هذا يجعل الإضافة والإزالة فعلًا واحدًا لا فعلين متعاكسين.
 */
function authorizedMenu(authorized: string[]): PanelView['rows'][number] {
  const menu = new UserSelectMenuBuilder()
    .setCustomId('bot:authorized')
    .setPlaceholder('المصرح لهم بفتح لوحات الإعدادات')
    .setMinValues(0)
    .setMaxValues(AUTHORIZED_CAP)
  // ديسكورد يرفض أكثر من max_values قيمة افتراضية، والقائمة قد تكون أطول
  const defaults = authorized.slice(0, AUTHORIZED_CAP)
  if (defaults.length > 0) menu.setDefaultUsers(...defaults)
  return row(menu)
}

const spec: PanelSpec = {
  need: 'settings',
  render: view,

  async handle({ guildId, config, guild, interaction }) {
    if (interaction.isUserSelectMenu() && interaction.customId === 'bot:authorized') {
      await ack(interaction)
      await setAuthorized(guildId, interaction.values)
      forgetGuild(guildId)
      await noticeReply(
        interaction,
        ok(
          'تم الحفظ',
          interaction.values.length === 0
            ? 'ما عاد فيه مصرح لهم — الإعدادات لرول الإدارة وحده الآن.'
            : `صار عدد المصرح لهم بالإعدادات ${interaction.values.length}.`,
        ),
      )
      return true
    }

    if (!interaction.isStringSelectMenu() || interaction.customId !== 'bot:action') return false
    const choice = interaction.values[0]

    if (choice === 'prefix-toggle') {
      await ack(interaction)
      const next = !config.prefixEnabled
      await prisma.guild.update({ where: { id: guildId }, data: { prefixEnabled: next } })
      forgetGuild(guildId)
      await noticeReply(
        interaction,
        ok(
          next ? 'اشتغل البريفكس' : 'تعطّل البريفكس',
          next
            ? `صارت الأوامر تعمل بـ «${config.prefix}» مع أوامر السلاش.`
            : 'ما عادت الأوامر النصية تعمل — أوامر السلاش وحدها الآن.',
        ),
      )
      return true
    }

    if (choice === 'prefix') return changePrefix(guildId, config.prefix, interaction)
    if (choice === 'nickname') return changeNickname(guildId, config.nickname, guild, interaction)
    if (choice === 'nickname-clear') return clearNickname(guildId, guild, interaction)

    await ack(interaction)
    return false
  },
}

type Select = Parameters<PanelSpec['handle']>[0]['interaction']

async function changePrefix(guildId: string, current: string, i: Select): Promise<boolean> {
  const asked = await askText(i, {
    title: 'تغيير البريفكس',
    label: 'البريفكس الجديد',
    hint: 'حرف إلى ثلاثة أحرف بلا مسافات، مثل ! أو ؟ أو .',
    value: current,
    max: 3,
  })
  if (!asked) return false

  // \S يمنع المسافة، وبدونه يصير البريفكس « » فيتحوّل كل كلام القناة أوامر
  if (!/^\S{1,3}$/u.test(asked.value)) {
    await noticeReply(
      asked.submit,
      warn('بريفكس غير صالح', 'لازم يكون من حرف إلى ثلاثة أحرف بلا أي مسافة.'),
    )
    return false
  }

  await prisma.guild.update({ where: { id: guildId }, data: { prefix: asked.value } })
  forgetGuild(guildId)
  await noticeReply(asked.submit, ok('تم الحفظ', `صار البريفكس «${asked.value}» في هذا السيرفر.`))
  return true
}

async function changeNickname(
  guildId: string,
  current: string | null,
  guild: Select['guild'],
  i: Select,
): Promise<boolean> {
  const asked = await askText(i, {
    title: 'الاسم المستعار في السيرفر',
    label: 'اسم البوت هنا',
    hint: 'إلى اثنين وثلاثين حرفًا — يظهر في هذا السيرفر وحده',
    value: current,
    max: 32,
  })
  if (!asked) return false
  if (asked.value.length === 0) {
    await noticeReply(asked.submit, warn('الاسم فارغ', 'اكتب اسمًا، أو اختر «إزالة الاسم المستعار».'))
    return false
  }

  const applied = await applyNickname(guild, asked.value)
  if (applied !== null) {
    await noticeReply(asked.submit, warn('ما قدرت أغيّر الاسم المستعار', applied))
    return false
  }

  await prisma.guild.update({ where: { id: guildId }, data: { nickname: asked.value } })
  forgetGuild(guildId)
  await noticeReply(asked.submit, ok('تم الحفظ', `صار اسمي هنا «${asked.value}».`))
  return true
}

async function clearNickname(guildId: string, guild: Select['guild'], i: Select): Promise<boolean> {
  await ack(i)

  const applied = await applyNickname(guild, null)
  if (applied !== null) {
    await noticeReply(i, warn('ما قدرت أشيل الاسم المستعار', applied))
    return false
  }

  await prisma.guild.update({ where: { id: guildId }, data: { nickname: null } })
  forgetGuild(guildId)
  await noticeReply(i, ok('تمّت الإزالة', 'رجعت لاسمي العام في هذا السيرفر.'))
  return true
}

/** يعيد `null` عند النجاح، أو سبب الفشل بلغة مفهومة. */
async function applyNickname(guild: Select['guild'], value: string | null): Promise<string | null> {
  const me = guild?.members.me
  if (!me) return 'ما لقيت عضويتي في هذا السيرفر — جرّب بعد لحظات.'
  try {
    await withTimeout(me.setNickname(value))
    return null
  } catch (err) {
    console.error('فشل تغيير الاسم المستعار:', err)
    return 'أحتاج صلاحية «تغيير الاسم المستعار» (Change Nickname)، أو أن يكون رولي أعلى.'
  }
}

/**
 * استبدال كامل داخل معاملة واحدة.
 * الحذف ثم الإضافة على مرحلتين يترك نافذة يكون فيها السيرفر بلا مصرح لهم.
 */
async function setAuthorized(guildId: string, wanted: readonly string[]): Promise<void> {
  const ids = [...new Set(wanted)]

  if (ids.length === 0) {
    await prisma.authorizedUser.deleteMany({ where: { guildId } })
    return
  }

  await prisma.$transaction([
    prisma.authorizedUser.deleteMany({ where: { guildId, userId: { notIn: ids } } }),
    prisma.authorizedUser.createMany({
      data: ids.map((userId) => ({ guildId, userId })),
      skipDuplicates: true,
    }),
  ])
}

export const botPanelCommands: Command[] = [
  {
    name: 'اعدادات',
    aliases: ['إعدادات', 'الاعدادات', 'الإعدادات'],
    description: 'اعدادات البوت الاساسيه — البريفكس والمصرح لهم والاسم المستعار',
    needs: 'settings',
    run: (ctx) => openPanel(ctx, spec),
  },
]
