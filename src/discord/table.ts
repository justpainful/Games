import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type Message,
  type TextBasedChannel,
} from 'discord.js'
import type {
  ButtonDef,
  ChatInput,
  Press,
  ShowOptions,
  Table,
} from '../games/define.ts'
import type { Session } from '../games/running.ts'
import type { GameBrief, PlayerView, Scene } from '../scenes/scene.ts'
import { editScene, sendScene } from './reply.ts'

/**
 * تنفيذ `Table` فوق قناة ديسكورد.
 *
 * هذا الملف هو **كل** ما يربط الألعاب بديسكورد. استبداله بملف مكافئ يجعل
 * الألعاب الثمانية والعشرين تعمل على أي سطح آخر — وهذا هو مسار تطبيق الجوال.
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

export function makeTable(args: {
  brief: GameBrief
  players: PlayerView[]
  host: PlayerView
  channel: TextBasedChannel
  session: Session
}): Table {
  const { brief, channel, session } = args
  let players = [...args.players]
  let last: Message | null = null

  async function send(scene: Scene, opts: ShowOptions | undefined, edit: boolean): Promise<void> {
    const components = opts?.buttons ? rows(opts.buttons) : []
    const message =
      edit && last
        ? await editScene(last, scene, opts?.text ?? '')
        : await sendScene(channel, scene, opts?.text ?? '')

    if (!message) return
    last = message
    // الأزرار تُركّب بعد الصورة حتى لا تُفقد عند فشل الرندر
    if (components.length > 0) await message.edit({ components }).catch(() => {})
    else if (edit) await message.edit({ components: [] }).catch(() => {})
    // الضغطات على مشاهد قديمة تُرفض في running.deliverPress
    session.liveMessageId = message.id
  }

  /** ينتظر أول قيمة تصل من مستمع، أو null عند انتهاء المهلة. */
  function waitFor<T>(
    ms: number,
    pool: Set<{ test?: (v: T) => boolean; deliver: (v: T) => void }>,
    test?: (v: T) => boolean,
  ): Promise<T | null> {
    return new Promise((resolve) => {
      const listener = {
        ...(test ? { test } : {}),
        deliver: (value: T) => {
          clearTimeout(timer)
          pool.delete(listener)
          resolve(value)
        },
      }
      const timer = setTimeout(() => {
        pool.delete(listener)
        resolve(null)
      }, ms)
      pool.add(listener)
    })
  }

  return {
    brief,
    get players() {
      return players
    },
    host: args.host,

    show: (scene, opts) => send(scene, opts, false),
    update: (scene, opts) => send(scene, opts, true),

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

    waitChat: (ms, test) => waitFor<ChatInput>(ms, session.chatListeners, test),
    waitPress: (ms, test) => waitFor<Press>(ms, session.pressListeners, test),

    /** يجمع كل من أجاب خلال المدة — أول إجابة صحيحة لكل لاعب هي المعتمدة. */
    collectChat(ms, test) {
      return new Promise<ChatInput[]>((resolve) => {
        const seen = new Map<string, ChatInput>()
        const listener = {
          test: (input: ChatInput) => (test ? test(input) : true),
          deliver: (input: ChatInput) => {
            if (!seen.has(input.userId)) seen.set(input.userId, input)
          },
        }
        session.chatListeners.add(listener)
        setTimeout(() => {
          session.chatListeners.delete(listener)
          resolve([...seen.values()])
        }, ms)
      })
    },

    /** يجمع كل الضغطات خلال المدة، ضغطة واحدة لكل لاعب — للتصويت. */
    collectPresses(ms, test) {
      return new Promise<Press[]>((resolve) => {
        const seen = new Map<string, Press>()
        const listener = {
          test: (p: Press) => (test ? test(p) : true),
          deliver: (p: Press) => {
            seen.set(p.userId, p) // آخر تصويت للاعب هو المعتمد
          },
        }
        session.pressListeners.add(listener)
        setTimeout(() => {
          session.pressListeners.delete(listener)
          resolve([...seen.values()])
        }, ms)
      })
    },

    sleep: (ms) => new Promise((r) => setTimeout(r, ms)),

    drop(userId) {
      players = players.filter((p) => p.id !== userId)
    },

    get aborted() {
      return session.aborted
    },
  }
}
