import {
  ActionRowBuilder,
  AttachmentBuilder,
  LabelBuilder,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type AnySelectMenuInteraction,
  type CollectedMessageInteraction,
  type Guild,
  type GuildMember,
  type Message,
  type MessageActionRowComponentBuilder,
  type ModalSubmitInteraction,
  type RepliableInteraction,
} from 'discord.js'
import { guildConfig, type GuildConfig } from '../../guilds/config.ts'
import { renderScene } from '../../images/render.ts'
import type { NoticeScene, PanelScene } from '../../scenes/scene.ts'
import type { Ctx } from '../commands.ts'
import { can, DENIAL, type Capability } from '../permissions.ts'
import { editScene } from '../reply.ts'

/**
 * محرّك اللوحات المشترك.
 *
 * **لماذا لا أزرار في أي لوحة:** `client.ts` يلتقط كل تفاعل زر في أي قناة،
 * يمرّره لـ `deliverPress`، ثم — إن لم تكن هناك لعبة شغّالة هناك — يردّ
 * «هذا الزر ما عاد فعّالًا». لوحة الإعدادات ليست لعبة، فكل ضغطة زر فيها كانت
 * ستُقابَل بتلك الرسالة. `client.ts` ليس ملكي فلا أعدّله؛ لذلك اللوحات كلها
 * قوائم منسدلة (String / Role / Channel / User) ونوافذ Modal — وهي أنواع
 * تفاعل لا يمسّها ذلك المعالج إطلاقًا.
 *
 * وهذا ليس تنازلًا: القائمة الواحدة تحمل خمسة وعشرين خيارًا موصوفًا، بينما
 * صف الأزرار لا يحمل إلا خمسة بلا وصف.
 */

/** عشر دقائق: أطول من جلسة ضبط واقعية، وأقصر من أن تبقى قوائم ميتة في القناة. */
const PANEL_MS = 10 * 60 * 1000
const MODAL_MS = 5 * 60 * 1000
/** سقف انتظار أي نداء لديسكورد داخل لوحة — لا يُترك المستخدم أمام لوحة معلّقة. */
export const API_TIMEOUT_MS = 10_000

export type PanelRow = ActionRowBuilder<MessageActionRowComponentBuilder>

export type PanelView = {
  scene: PanelScene
  /** النص المرافق للصورة — إلزامي بروح DESIGN §6 */
  text: string
  rows: PanelRow[]
}

export type PanelArgs = {
  guildId: string
  /** يُقرأ من قاعدة البيانات قبل كل تفاعل، فلا يعمل خيار على إعداد قديم */
  config: GuildConfig
  guild: Guild
}

export type PanelSpec = {
  need: Capability
  render(args: PanelArgs): PanelView | Promise<PanelView>
  /**
   * يعالج تفاعل قائمة واحدًا.
   *
   * **يجب** أن يُقرّ التفاعل (`ack` أو `askText`) قبل أي عمل بطيء — مهلة
   * ديسكورد ثلاث ثوانٍ، وقراءة قاعدة بيانات أو رندر صورة يتجاوزانها معًا.
   * يعيد `true` إن تغيّرت الحالة فيُعاد رسم الصورة.
   */
  handle(args: PanelArgs & { interaction: AnySelectMenuInteraction }): Promise<boolean>
}

/**
 * يفتح لوحة ويبقى مستمعًا لها عشر دقائق.
 *
 * الصلاحية تُفحص هنا **ومع كل تفاعل**: اللوحة رسالة عامة في القناة، ولو اكتُفي
 * بالفحص عند الفتح لعبث أي عابر بقوائم لوحة فتحها مشرف.
 */
export async function openPanel(ctx: Ctx, spec: PanelSpec): Promise<void> {
  const guild = ctx.member.guild
  const guildId = ctx.guildId

  const first = await spec.render({ guildId, config: await guildConfig(guildId), guild })

  const anchor = await ctx.scene(first.scene, first.text)
  if (!anchor) return
  let live: Message = anchor
  await live.edit({ components: first.rows }).catch(() => {})

  const collector = anchor.createMessageComponentCollector({ time: PANEL_MS })

  collector.on('collect', (interaction: CollectedMessageInteraction) => {
    void step(interaction).catch(async (err) => {
      console.error('فشل تفاعل اللوحة:', err)
      await tell(interaction, 'صار خطأ غير متوقع. جرّب مرة ثانية.').catch(() => {})
    })
  })

  collector.on('end', () => {
    void live.edit({ components: [] }).catch(() => {})
  })

  async function step(interaction: CollectedMessageInteraction): Promise<void> {
    if (!interaction.isAnySelectMenu()) return

    const config = await guildConfig(guildId)
    const member = await memberOf(interaction)
    if (!member || !can(member, config, spec.need)) {
      await interaction
        .reply({ content: DENIAL[spec.need], flags: MessageFlags.Ephemeral })
        .catch(() => {})
      return
    }

    const changed = await spec.handle({ guildId, config, guild, interaction })

    // إعادة القراءة بعد `forgetGuild` — بدونها تعرض اللوحة القيمة القديمة
    const next = await spec.render({ guildId, config: await guildConfig(guildId), guild })

    if (changed) {
      const updated = await editScene(live, next.scene, next.text)
      if (updated) live = updated
    }
    // حتى بلا تغيير: إعادة تركيب القوائم تمسح الخيار الظاهر «محدَّدًا» من آخر ضغطة
    await live.edit({ components: next.rows }).catch(() => {})
  }
}

async function memberOf(i: AnySelectMenuInteraction): Promise<GuildMember | null> {
  if (i.inCachedGuild()) return i.member
  if (!i.guildId) return null
  const guild = await i.client.guilds.fetch(i.guildId).catch(() => null)
  if (!guild) return null
  return guild.members.fetch(i.user.id).catch(() => null)
}

/** إقرار صامت. يُستدعى أولًا في كل معالج لا يفتح نافذة إدخال. */
export async function ack(i: AnySelectMenuInteraction | ModalSubmitInteraction): Promise<void> {
  if (!i.deferred && !i.replied) await i.deferUpdate().catch(() => {})
}

/** سطر خاص بالمستخدم وحده — لا يزاحم اللوحة في القناة. */
export async function tell(i: RepliableInteraction, content: string): Promise<void> {
  if (i.deferred || i.replied) await i.followUp({ content, flags: MessageFlags.Ephemeral })
  else await i.reply({ content, flags: MessageFlags.Ephemeral })
}

/**
 * إشعار مصوّر خاص بالمستخدم.
 * الصورة هي المنتج، والنص يرافقها دائمًا (DESIGN §6) فيبقى المعنى لو فشل الرندر.
 */
export async function noticeReply(i: RepliableInteraction, scene: NoticeScene): Promise<void> {
  const text = scene.body ? `**${scene.title}** — ${scene.body}` : `**${scene.title}**`
  try {
    const png = await renderScene(scene)
    await i.followUp({
      content: text,
      files: [new AttachmentBuilder(png, { name: 'notice.png' })],
      flags: MessageFlags.Ephemeral,
    })
  } catch {
    await tell(i, text).catch(() => {})
  }
}

export function ok(title: string, body?: string): NoticeScene {
  return { kind: 'notice', tone: 'ok', title, ...(body ? { body } : {}) }
}

export function warn(title: string, body?: string): NoticeScene {
  return { kind: 'notice', tone: 'warn', title, ...(body ? { body } : {}) }
}

export function info(title: string, body?: string): NoticeScene {
  return { kind: 'notice', tone: 'info', title, ...(body ? { body } : {}) }
}

/**
 * يفتح نافذة إدخال نص وينتظر إرسالها.
 *
 * `showModal` هو نفسه إقرار التفاعل، فلا يسبقه `deferUpdate` وإلا فشل الفتح.
 * الإرجاع `null` يعني أن المستخدم أغلق النافذة — وهذا ليس خطأ.
 */
export async function askText(
  i: AnySelectMenuInteraction,
  opts: {
    title: string
    label: string
    hint?: string
    value?: string | null
    placeholder?: string
    max?: number
    required?: boolean
    paragraph?: boolean
  },
): Promise<{ submit: ModalSubmitInteraction; value: string } | null> {
  const customId = `panel:modal:${i.id}`
  const max = opts.max ?? 200

  const input = new TextInputBuilder()
    .setCustomId('value')
    .setStyle(opts.paragraph ? TextInputStyle.Paragraph : TextInputStyle.Short)
    .setRequired(opts.required ?? true)
    .setMaxLength(max)
  if (opts.value) input.setValue(opts.value.slice(0, max))
  if (opts.placeholder) input.setPlaceholder(opts.placeholder.slice(0, 100))

  const label = new LabelBuilder().setLabel(opts.label.slice(0, 45)).setTextInputComponent(input)
  if (opts.hint) label.setDescription(opts.hint.slice(0, 100))

  const modal = new ModalBuilder()
    .setCustomId(customId)
    .setTitle(opts.title.slice(0, 45))
    .addLabelComponents(label)

  await i.showModal(modal)

  const submit = await i
    .awaitModalSubmit({
      time: MODAL_MS,
      filter: (m) => m.customId === customId && m.user.id === i.user.id,
    })
    .catch(() => null)
  if (!submit) return null

  await submit.deferUpdate().catch(() => {})
  return { submit, value: submit.fields.getTextInputValue('value').trim() }
}

/** قائمة أفعال — العمود الفقري لكل لوحة بعد منع الأزرار. */
export function actionMenu(
  customId: string,
  placeholder: string,
  options: { value: string; label: string; description?: string }[],
): PanelRow {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder.slice(0, 150))
    .setMinValues(1)
    .setMaxValues(1)
    // ديسكورد يرفض أكثر من خمسة وعشرين خيارًا بخطأ في التركيب لا في الاستخدام
    .addOptions(
      options.slice(0, 25).map((o) => ({
        value: o.value,
        label: o.label.slice(0, 100),
        ...(o.description ? { description: o.description.slice(0, 100) } : {}),
      })),
    )
  return row(menu)
}

export function row(component: MessageActionRowComponentBuilder): PanelRow {
  return new ActionRowBuilder<MessageActionRowComponentBuilder>().addComponents(component)
}

/** يمنع نداءً بطيئًا من تعليق اللوحة إلى ما لا نهاية (حدود المعدل تفعل ذلك). */
export async function withTimeout<T>(promise: Promise<T>, ms = API_TIMEOUT_MS): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('TIMEOUT')), ms)
      }),
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export function onOff(value: boolean): string {
  return value ? 'مفعّل' : 'معطّل'
}

/** يقسّم قائمة طويلة إلى قوائم بحجم يقبله ديسكورد. */
export function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size))
  return out
}
