import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type GuildMember,
  type Message,
  type TextBasedChannel,
} from 'discord.js'
import type { GameDef, Press } from '../games/define.ts'
import { activeIn, close, open, type Session } from '../games/running.ts'
import { isGameEnabled, type GuildConfig } from '../guilds/config.ts'
import { awardMany, recordPlayed } from '../players/points.ts'
import { prisma } from '../db/prisma.ts'
import type { LobbyScene, PlayerView } from '../scenes/scene.ts'
import { settings } from '../settings.ts'
import { playerView } from './players.ts'
import { editScene, sendScene } from './reply.ts'
import { makeTable } from './table.ts'

/**
 * يدير دورة حياة اللعبة كاملة: اللوبي، ثم اللعب، ثم النقاط.
 * كل الألعاب الثمانية والعشرين تمرّ من هنا، فالتعديل هنا يطال الجميع.
 */

const LOBBY_BUTTONS = [
  { id: 'lobby:join', label: 'دخول', style: 'join' as const },
  { id: 'lobby:leave', label: 'خروج', style: 'plain' as const },
  { id: 'lobby:start', label: 'بدء اللعبة', style: 'start' as const },
  { id: 'lobby:cancel', label: 'إلغاء', style: 'stop' as const },
]

export async function startGame(args: {
  game: GameDef
  channel: TextBasedChannel
  starter: GuildMember
  config: GuildConfig
  guildId: string
}): Promise<void> {
  const { game, channel, starter, config, guildId } = args
  const channelId = channel.id

  if (activeIn(channelId)) {
    if (channel.isSendable()) await channel.send('فيه لعبة شغّالة في هذه القناة بالفعل.')
    return
  }
  if (!isGameEnabled(config, game.key)) {
    if (channel.isSendable()) await channel.send(`لعبة **${game.name}** معطّلة في هذا السيرفر.`)
    return
  }
  if (config.gamesChannel && config.gamesChannel !== channelId) {
    if (channel.isSendable()) {
      await channel.send(`الألعاب مخصّصة لقناة <#${config.gamesChannel}>.`)
    }
    return
  }

  let aborted = false
  const session: Session = {
    game,
    guildId,
    channelId,
    hostId: starter.id,
    startedAt: Date.now(),
    abort() {
      aborted = true
    },
    get aborted() {
      return aborted
    },
    chatListeners: new Set(),
    pressListeners: new Set(),
    liveMessageId: null,
  }
  open(session)

  try {
    const players = await runLobby(session, game, channel, starter)
    if (!players) return

    const host = players[0]!
    const table = makeTable({ brief: brief(game), players, host, channel, session })

    const match = await prisma.matchRecord
      .create({ data: { guildId, gameKey: game.key, players: players.length } })
      .catch(() => null)

    const result = await game.play(table)

    if (result.scores) await awardMany(guildId, game.wallet, result.scores)
    await recordPlayed(
      guildId,
      players.map((p) => p.id),
      result.winnerId,
    )
    if (match) {
      await prisma.matchRecord
        .update({
          where: { id: match.id },
          data: { endedAt: new Date(), winnerId: result.winnerId ?? null },
        })
        .catch(() => {})
    }
  } catch (err) {
    console.error(`اللعبة ${game.key} تعطّلت:`, err)
    if (channel.isSendable()) {
      await channel.send('صار خطأ وأُلغيت اللعبة. جرّبوا مرة ثانية.').catch(() => {})
    }
  } finally {
    close(channelId)
  }
}

function brief(game: GameDef) {
  return { key: game.key, name: game.name, tagline: game.tagline, howTo: game.howTo }
}

/**
 * اللوبي: ينضم اللاعبون بالأزرار، والقائد يبدأ.
 * يُعاد رندر الصورة عند كل تغيّر حقيقي فقط — لا على المؤقت.
 */
async function runLobby(
  session: Session,
  game: GameDef,
  channel: TextBasedChannel,
  starter: GuildMember,
): Promise<PlayerView[] | null> {
  const joined = new Map<string, PlayerView>()
  joined.set(starter.id, await playerView(starter))

  const scene = (): LobbyScene => ({
    kind: 'lobby',
    game: brief(game),
    host: joined.values().next().value ?? null,
    players: [...joined.values()],
    min: game.players.min,
    max: game.players.max,
  })

  const deadline = Date.now() + settings.lobby.joinSeconds * 1000
  const text = () =>
    `**${game.name}** — اضغط دخول للانضمام. يبدأ التسجيل حتى <t:${Math.floor(deadline / 1000)}:R>`

  let message: Message | null = await sendScene(channel, scene(), text())
  if (!message) return null
  await message.edit({ components: buttonRows() }).catch(() => {})
  session.liveMessageId = message.id

  const outcome = await new Promise<'start' | 'cancel' | 'timeout'>((resolve) => {
    const timer = setTimeout(() => finishWith('timeout'), deadline - Date.now())

    const listener = {
      deliver: (press: Press) => {
        void handle(press)
      },
    }
    session.pressListeners.add(listener)

    function finishWith(value: 'start' | 'cancel' | 'timeout'): void {
      clearTimeout(timer)
      session.pressListeners.delete(listener)
      resolve(value)
    }

    async function handle(press: Press): Promise<void> {
      const isHost = press.userId === starter.id
      let changed = false

      switch (press.id) {
        case 'lobby:join':
          if (!joined.has(press.userId) && joined.size < game.players.max) {
            const member = await channel.client.users.fetch(press.userId).catch(() => null)
            if (member) {
              joined.set(press.userId, await playerView(member))
              changed = true
            }
          }
          break
        case 'lobby:leave':
          // القائد لا ينسحب من لعبته — إلغاؤها هو الخروج الصحيح
          if (!isHost && joined.delete(press.userId)) changed = true
          break
        case 'lobby:start':
          if (isHost && joined.size >= game.players.min) return finishWith('start')
          break
        case 'lobby:cancel':
          if (isHost) return finishWith('cancel')
          break
      }

      if (changed && message) {
        const updated = await editScene(message, scene(), text())
        if (updated) {
          message = updated
          await message.edit({ components: buttonRows() }).catch(() => {})
          session.liveMessageId = message.id
        }
      }
    }
  })

  await message.edit({ components: [] }).catch(() => {})

  if (outcome === 'cancel') {
    if (channel.isSendable()) await channel.send('أُلغيت اللعبة.')
    return null
  }
  if (joined.size < game.players.min) {
    if (channel.isSendable()) {
      await channel.send(`ما اكتمل العدد — تحتاج ${game.players.min} لاعبين على الأقل.`)
    }
    return null
  }

  return [...joined.values()]
}

const LOBBY_STYLES = {
  join: ButtonStyle.Primary,
  plain: ButtonStyle.Secondary,
  start: ButtonStyle.Success,
  stop: ButtonStyle.Danger,
} as const

function buttonRows(): ActionRowBuilder<ButtonBuilder>[] {
  const row = new ActionRowBuilder<ButtonBuilder>()
  for (const b of LOBBY_BUTTONS) {
    row.addComponents(
      new ButtonBuilder().setCustomId(b.id).setLabel(b.label).setStyle(LOBBY_STYLES[b.style]),
    )
  }
  return [row]
}
