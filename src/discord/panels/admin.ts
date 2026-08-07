import type { RoleKind } from '@prisma/client'
import { RoleSelectMenuBuilder, type Guild } from 'discord.js'
import { prisma } from '../../db/prisma.ts'
import { forgetGuild } from '../../guilds/config.ts'
import type { Command } from '../commands.ts'
import {
  ack,
  noticeReply,
  ok,
  openPanel,
  row,
  warn,
  type PanelArgs,
  type PanelSpec,
  type PanelView,
} from './shared.ts'

/**
 * لوحة «اعدادات الادارة» — الرولات الثلاثة التي تشتقّ منها كل الصلاحيات.
 *
 * كل رول قائمة `RoleSelectMenuBuilder` واحدة **مملوءة بالحالة الحالية**:
 * ما يبقى محدَّدًا يبقى، وما يُزال يُزال. هذا يجعل «إضافة» و«إزالة» فعلًا
 * واحدًا لا فعلين متعاكسين يحتاج كل منهما خطوة ورسالة تأكيد.
 */

const KINDS: { kind: RoleKind; label: string; hint: string }[] = [
  { kind: 'ADMIN', label: 'رول الإدارة', hint: 'يبدأ الألعاب ويوقفها ويفتح الإعدادات' },
  { kind: 'GAMES', label: 'رول الألعاب', hint: 'يبدأ الألعاب والإيفنتات — ولا يوقفها' },
  { kind: 'POINTS', label: 'رول النقاط', hint: 'يعطي النقاط للاعبين' },
]

/** ديسكورد يسمح بخمسة وعشرين، وعشرة أكثر من كافٍ لثلاثة أدوار في سيرفر واحد. */
const ROLE_CAP = 10

function isKind(value: string | undefined): value is RoleKind {
  return value === 'ADMIN' || value === 'GAMES' || value === 'POINTS'
}

/** رول محذوف من السيرفر يبقى في قاعدة البيانات — يُعرض صراحةً لا يُخفى. */
function roleNames(guild: Guild, ids: Set<string>): string {
  if (ids.size === 0) return 'ما فيه'
  return [...ids].map((id) => guild.roles.cache.get(id)?.name ?? 'رول محذوف').join('، ')
}

function view({ config, guild }: PanelArgs): PanelView {
  return {
    scene: {
      kind: 'panel',
      title: 'اعدادات الادارة',
      subtitle: guild.name,
      items: KINDS.map((k) => ({
        label: k.label,
        value: roleNames(guild, config.roles[k.kind]),
        on: config.roles[k.kind].size > 0,
      })),
      footer: 'صاحب السيرفر ومن يملك Administrator مسموح لهم دائمًا بلا أي رول',
    },
    text:
      '**اعدادات الادارة** — ' +
      KINDS.map((k) => `${k.label}: ${config.roles[k.kind].size}`).join(' · '),
    rows: KINDS.map((k) => roleMenu(k.kind, k.label, k.hint, guild, config.roles[k.kind])),
  }
}

function roleMenu(
  kind: RoleKind,
  label: string,
  hint: string,
  guild: Guild,
  current: Set<string>,
): PanelView['rows'][number] {
  const menu = new RoleSelectMenuBuilder()
    .setCustomId(`admin:role:${kind}`)
    .setPlaceholder(`${label} — ${hint}`.slice(0, 150))
    .setMinValues(0)
    .setMaxValues(ROLE_CAP)

  // رول محذوف كقيمة افتراضية يجعل ديسكورد يرفض الرسالة كاملة، فيُصفّى أولًا
  const defaults = [...current].filter((id) => guild.roles.cache.has(id)).slice(0, ROLE_CAP)
  if (defaults.length > 0) menu.setDefaultRoles(...defaults)
  return row(menu)
}

const spec: PanelSpec = {
  need: 'settings',
  render: view,

  async handle({ guildId, guild, interaction }) {
    if (!interaction.isRoleSelectMenu()) return false

    const kind = interaction.customId.split(':')[2]
    if (!isKind(kind)) return false

    await ack(interaction)

    // معرّف رول @everyone هو معرّف السيرفر نفسه: منحه صلاحية = منحها للجميع
    const everyone = interaction.values.includes(guild.id)
    const ids = interaction.values.filter((id) => id !== guild.id)

    await setRoles(guildId, kind, ids)
    forgetGuild(guildId)

    const label = KINDS.find((k) => k.kind === kind)?.label ?? 'الرول'
    if (everyone) {
      await noticeReply(
        interaction,
        warn(
          'تجاهلت رول @everyone',
          `منح ${label} لـ @everyone يعطي الصلاحية لكل عضو في السيرفر. حفظت بقية الرولات.`,
        ),
      )
      return true
    }

    await noticeReply(
      interaction,
      ok(
        'تم الحفظ',
        ids.length === 0
          ? `ما عاد فيه ${label}. تبقى الصلاحية لصاحب السيرفر ومن يملك Administrator.`
          : `صار ${label}: ${roleNames(guild, new Set(ids))}.`,
      ),
    )
    return true
  },
}

/**
 * استبدال كامل داخل معاملة واحدة.
 * الحذف ثم الإضافة على مرحلتين يترك نافذة يكون فيها السيرفر بلا رول إدارة،
 * وفيها يفقد كل من ليس صاحب السيرفر صلاحيته لحظةً.
 */
async function setRoles(guildId: string, kind: RoleKind, wanted: readonly string[]): Promise<void> {
  const ids = [...new Set(wanted)]

  if (ids.length === 0) {
    await prisma.guildRole.deleteMany({ where: { guildId, kind } })
    return
  }

  await prisma.$transaction([
    prisma.guildRole.deleteMany({ where: { guildId, kind, roleId: { notIn: ids } } }),
    prisma.guildRole.createMany({
      data: ids.map((roleId) => ({ guildId, roleId, kind })),
      skipDuplicates: true,
    }),
  ])
}

export const adminPanelCommands: Command[] = [
  {
    name: 'اعدادات-الادارة',
    aliases: ['اعدادات-الإدارة', 'الادارة', 'الإدارة'],
    description: 'اعدادات الادارة — رول الإدارة ورول الألعاب ورول النقاط',
    needs: 'settings',
    run: (ctx) => openPanel(ctx, spec),
  },
]
