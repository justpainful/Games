import {
  ApplicationCommandType,
  type ChatInputCommandInteraction,
  type GuildMember,
  type Message,
  type TextBasedChannel,
} from 'discord.js'
import { guildConfig, type GuildConfig } from '../guilds/config.ts'
import type { Scene } from '../scenes/scene.ts'
import { can, DENIAL, type Capability } from './permissions.ts'
import { sendScene } from './reply.ts'

/**
 * سياق موحّد للأمر.
 *
 * الأمر لا يعرف إن جاء من سلاش أو من بريفكس — يكتب مرة ويعمل في الحالتين.
 * لولا ذلك لتضاعف عدد الأوامر الثمانية والعشرين إلى ستة وخمسين.
 */
export type Ctx = {
  guildId: string
  channelId: string
  channel: TextBasedChannel
  member: GuildMember
  config: GuildConfig
  /** الكلمات بعد اسم الأمر (البريفكس فقط؛ فارغة في السلاش ما لم يُمرَّر خيار) */
  args: string[]
  scene(scene: Scene, text?: string): Promise<Message | null>
  say(text: string): Promise<Message | null>
}

export type Command = {
  name: string
  aliases?: string[]
  description: string
  /** الصلاحية المطلوبة؛ الغياب يعني متاح للجميع */
  needs?: Capability
  run(ctx: Ctx): Promise<void>
}

const registry = new Map<string, Command>()
const canonical: Command[] = []

export function register(...commands: Command[]): void {
  for (const cmd of commands) {
    canonical.push(cmd)
    registry.set(cmd.name, cmd)
    for (const alias of cmd.aliases ?? []) registry.set(alias, cmd)
  }
}

export function allCommands(): readonly Command[] {
  return canonical
}

function makeCtx(
  base: Omit<Ctx, 'scene' | 'say'>,
): Ctx {
  return {
    ...base,
    scene: (scene, text) => sendScene(base.channel, scene, text),
    say: (text) => (base.channel.isSendable() ? base.channel.send(text) : Promise.resolve(null)),
  }
}

async function dispatch(cmd: Command, ctx: Ctx): Promise<void> {
  if (cmd.needs && !can(ctx.member, ctx.config, cmd.needs)) {
    await ctx.say(DENIAL[cmd.needs])
    return
  }
  try {
    await cmd.run(ctx)
  } catch (err) {
    console.error(`فشل الأمر ${cmd.name}:`, err)
    await ctx.say('صار خطأ غير متوقع. جرّب مرة ثانية.')
  }
}

/** مسار البريفكس — يُنادى لكل رسالة، فيجب أن يخرج مبكرًا وبأقل كلفة ممكنة. */
export async function handleMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.inGuild()) return

  const config = await guildConfig(message.guildId)
  if (!config.prefixEnabled) return
  if (!message.content.startsWith(config.prefix)) return

  const [rawName, ...args] = message.content.slice(config.prefix.length).trim().split(/\s+/)
  if (!rawName) return

  const cmd = registry.get(rawName)
  if (!cmd) return

  const member = message.member
  if (!member) return

  await dispatch(
    cmd,
    makeCtx({
      guildId: message.guildId,
      channelId: message.channelId,
      channel: message.channel,
      member,
      config,
      args,
    }),
  )
}

export async function handleSlash(interaction: ChatInputCommandInteraction): Promise<void> {
  if (!interaction.inGuild() || !interaction.channel) return

  const cmd = registry.get(interaction.commandName)
  if (!cmd) return

  const member = interaction.member as GuildMember | null
  if (!member) return

  const config = await guildConfig(interaction.guildId)

  // التفاعل يُسوّى بالكامل **قبل** تشغيل الأمر.
  // الأمر قد يكون لعبة تستمر دقائق، ورمز التفاعل ينتهي بعد ربع ساعة — فحذف
  // الرد بعد انتهاء اللعبة يفشل، ويبقى «جاري التجهيز...» معلّقًا عند اللاعب.
  await interaction.reply({ content: 'تم.', ephemeral: true })
  await interaction.deleteReply().catch(() => {})

  await dispatch(
    cmd,
    makeCtx({
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      channel: interaction.channel,
      member,
      config,
      args: [],
    }),
  )
}

/**
 * حمولة تسجيل أوامر السلاش.
 *
 * ديسكورد يرفض الـ PUT **كاملًا** لو خالف اسم واحد قاعدته، فتسقط كل الأوامر
 * لا المخالف وحده. لذلك تُصفّى الأسماء هنا ويُطبع المرفوض بدل تمريره.
 */
const SLASH_NAME = /^[-_\p{L}\p{N}]{1,32}$/u

export function slashPayload(): { valid: unknown[]; rejected: string[] } {
  const valid: unknown[] = []
  const rejected: string[] = []

  for (const c of canonical) {
    if (!SLASH_NAME.test(c.name) || c.name !== c.name.toLowerCase()) {
      rejected.push(c.name)
      continue
    }
    valid.push({
      name: c.name,
      description: c.description.slice(0, 100) || c.name,
      type: ApplicationCommandType.ChatInput,
    })
  }
  return { valid, rejected }
}
