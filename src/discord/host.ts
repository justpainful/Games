import { EMOJI } from '../design/emoji.ts'
import type { GuildMember, TextBasedChannel } from 'discord.js'
import type { ButtonDef, GameDef, Press } from '../games/define.ts'
import { activeIn, close, open, type Session } from '../games/running.ts'
import {
  announce,
  fanout,
  makeJoinPoint,
  type LobbyControl,
  type MultiTable,
  type Surface,
} from '../games/surface.ts'
import { isGameEnabled, type GuildConfig } from '../guilds/config.ts'
import { tunerFor } from '../games/tunables.ts'
import { openMatch, settleMatch } from '../players/settle.ts'
import type { LobbyScene, PlayerView } from '../scenes/scene.ts'
import { settings } from '../settings.ts'
import { playerView } from './players.ts'
import { makeDiscordSurface, type DiscordSurface } from './table.ts'

/**
 * يدير دورة حياة اللعبة كاملة: اللوبي، ثم اللعب، ثم النقاط.
 * كل الألعاب السبع والعشرين تمرّ من هنا، فالتعديل هنا يطال الجميع.
 *
 * الجديد: القناة صارت **سطحًا** بين أسطح لا الطاولة كلها. الجلسة تنشر
 * `session.join` فيستطيع لاعب من التطبيق أن ينضم لنفس اللعبة — في اللوبي فيصير
 * لاعبًا، أو أثناء اللعب فيرى المشاهد. ما يراه لاعب ديسكورد لم يتغيّر حرفًا.
 */

const LOBBY_BUTTONS: ButtonDef[] = [
  { id: 'lobby:join', label: 'دخول', style: 'join', emoji: EMOJI.act_join },
  { id: 'lobby:leave', label: 'خروج', style: 'plain', emoji: EMOJI.act_leave },
  { id: 'lobby:start', label: 'بدء اللعبة', style: 'start', emoji: EMOJI.act_start },
  { id: 'lobby:cancel', label: 'إلغاء', style: 'stop', emoji: EMOJI.act_cancel },
]

/**
 * زر يُقعد بوتًا مأذونًا على الطاولة.
 *
 * سببه قيد في ديسكورد لا في هذا الكود: **البوت لا يستطيع الضغط على زر**.
 * التفاعلات تأتي من المستخدمين وحدهم، فلا سبيل لبوت أن يدخل لوبيًا بنفسه
 * مهما أُذن له. فيُقعده إنسان بضغطة، ويلعب بعدها بالكتابة.
 */
const SEAT_BOT: ButtonDef = {
  id: 'lobby:seatbot',
  label: 'أضف بوتًا',
  style: 'plain',
  emoji: EMOJI.act_bot,
}

/** أزرار اللوبي، مع زر إقعاد البوت حين يوجد بوت مأذون لم يجلس بعد. */
function lobbyButtons(seatable: boolean): ButtonDef[] {
  return seatable ? [...LOBBY_BUTTONS, SEAT_BOT] : LOBBY_BUTTONS
}

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
  // قناة لا نستطيع النشر فيها تعني لوبي أعمى ينتهي بالمهلة — نخرج مبكرًا
  if (!channel.isSendable()) return

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
    attempts: 0,
    chatListeners: new Set(),
    pressListeners: new Set(),
    liveMessageId: null,
    join: null,
  }
  open(session)

  const discord = makeDiscordSurface({ channel, session })
  /** أسطح التطبيق المنضمة لهذه اللعبة */
  const sockets = new Set<Surface>()
  /**
   * القائد يُسجَّل **قبل** نشر جسر الانضمام وبلا انتظار جلب أفتاره: لاعب جوال
   * ينضم في تلك اللحظة كان سيصير أول من في الخريطة، أي قائد اللعبة.
   * `Map` تحفظ ترتيب الإدراج، فتحديث بطاقته لاحقًا لا يزحزح موقعه.
   */
  const joined = new Map<string, PlayerView>([
    [starter.id, { id: starter.id, name: starter.displayName, avatar: null }],
  ])

  let phase: 'lobby' | 'playing' = 'lobby'
  let table: MultiTable | null = null
  const control: LobbyControl = {
    refresh: () => {},
    start: () => false,
    cancel: () => false,
  }

  /**
   * جسر ديسكورد ← الجوال.
   *
   * `src/api/ws.ts` يجد هذه الجلسة بـ `guildId` + `channelId`، يتحقّق من عضوية
   * اللاعب في السيرفر، ثم ينادي `admit` بسطح وصلته. لا يعرف هذا الملف شيئًا عن
   * WebSocket، ولا يعرف ذاك الملف شيئًا عن ديسكورد.
   *
   * لا `hostLeaveCancels` ولا `emptyStops` هنا: اللوبي معروض في قناة ديسكورد،
   * فانقطاع وصلة القائد لا يعني أن أحدًا لم يعد يشاهد.
   */
  session.join = makeJoinPoint({
    origin: 'discord',
    session,
    hostId: starter.id,
    limits: game.players,
    joined,
    sockets,
    phase: () => phase,
    table: () => table,
    control,
  })

  try {
    joined.set(starter.id, await playerView(starter))

    /**
     * اللعبة تتجاوز اللوبي، والفعالية تمرّ به.
     *
     * اللوبي عقدٌ مع الفعالية: تحتاج عددًا لا تبدأ دونه، وأدوارًا تعرف أصحابها.
     * أما اللعبة فتُفتح لمن في القناة بلا انضمام، وانتظار زرّ فيها تأخيرٌ محض:
     * من كتب أمرها يريدها الآن، ومن أراد اللعب يكتب الجواب.
     */
    const open = game.mode === 'game'
    const players = open
      ? [joined.get(starter.id)!]
      : await runLobby({ session, game, starter, discord, joined, sockets, control })

    if (!players) {
      announce([...sockets], { type: 'cancelled', reason: 'أُلغي اللوبي' })
      return
    }

    phase = 'playing'
    const host = players[0]!
    table = fanout([discord, ...sockets], {
      brief: brief(game),
      players,
      host,
      session,
      open,
      tune: tunerFor(game, config),
    })
    announce(table.surfaces(), { type: 'started', players })

    const matchId = await openMatch(guildId, game.key, players.length)
    const result = await game.play(table)

    // نفس محاسبة الغرف في `src/api/rooms.ts` حرفيًا — محفظة واحدة أيًّا كان السطح
    await settleMatch({
      guildId,
      wallet: game.wallet,
      players: players.map((p) => p.id),
      result,
      matchId,
    })

    announce(table.surfaces(), {
      type: 'ended',
      winnerId: result.winnerId ?? null,
      scores: Object.fromEntries(result.scores ?? new Map<string, number>()),
    })
  } catch (err) {
    console.error(`اللعبة ${game.key} تعطّلت:`, err)
    announce([...sockets], { type: 'cancelled', reason: 'صار خطأ وأُلغيت اللعبة' })
    if (channel.isSendable()) {
      await channel.send('صار خطأ وأُلغيت اللعبة. جرّبوا مرة ثانية.').catch(() => {})
    }
  } finally {
    session.join = null
    for (const surface of [...sockets]) surface.detach()
    sockets.clear()
    close(channelId)
  }
}

function brief(game: GameDef) {
  return { key: game.key, name: game.name, tagline: game.tagline, howTo: game.howTo }
}

/**
 * اللوبي: ينضم اللاعبون بالأزرار، والقائد يبدأ.
 * يُعاد رندر الصورة عند كل تغيّر حقيقي فقط — لا على المؤقت.
 *
 * المشهد يُبثّ الآن لقناة ديسكورد **ولكل سطح جوال منضم**، فيرى الجميع نفس
 * قائمة اللاعبين بينما تتغيّر.
 */
async function runLobby(args: {
  session: Session
  game: GameDef
  starter: GuildMember
  discord: DiscordSurface
  joined: Map<string, PlayerView>
  sockets: Set<Surface>
  control: LobbyControl
}): Promise<PlayerView[] | null> {
  const { session, game, starter, discord, joined, sockets, control } = args

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
    `**${game.name}**. اضغط دخول للانضمام. يبدأ التسجيل حتى <t:${Math.floor(deadline / 1000)}:R>`

  let closed = false
  let first = true
  // الرندرات تُسلسل: ضغطتان متتاليتان لا تتسابقان على تحرير نفس الرسالة
  let queue: Promise<void> = Promise.resolve()

  function render(): Promise<void> {
    queue = queue.then(async () => {
      if (closed) return
      const replace = !first
      first = false
      // زر إقعاد البوت يظهر فقط حين يوجد مأذون لم يجلس بعد وفي الطاولة متسع
      const seatable = [...settings.botPlayers].some(
        (id) => !joined.has(id) && joined.size < game.players.max,
      )
      console.log(
        `[لوبي] بوتات مأذونة ${settings.botPlayers.size} · جالسون ${joined.size}/${game.players.max} · زر البوت ${seatable}`,
      )
      const opts = { text: text(), buttons: lobbyButtons(seatable) }
      await Promise.all(
        [discord, ...sockets].map((surface) =>
          surface.present(scene(), opts, replace).catch(() => {}),
        ),
      )
    })
    return queue
  }

  await render()

  const outcome = await new Promise<'start' | 'cancel' | 'timeout'>((resolve) => {
    const timer = setTimeout(() => finishWith('timeout'), Math.max(0, deadline - Date.now()))

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

    control.refresh = () => void render()
    control.start = (userId) => {
      if (userId !== starter.id || joined.size < game.players.min) return false
      finishWith('start')
      return true
    }
    control.cancel = (userId) => {
      if (userId !== starter.id) return false
      finishWith('cancel')
      return true
    }

    async function handle(press: Press): Promise<void> {
      const isHost = press.userId === starter.id
      let changed = false

      switch (press.id) {
        case 'lobby:join':
          if (!joined.has(press.userId) && joined.size < game.players.max) {
            const member = await discordUser(press.userId)
            if (member) {
              joined.set(press.userId, member)
              changed = true
            }
          }
          // اكتمال العدد يبدأ اللعبة فورًا.
          //
          // لا شيء ينتظره اللوبي بعد امتلائه: لا مكان لداخل جديد، وزر البدء
          // لن يغيّر النتيجة. إبقاء المهلة تعمل هنا يعني انتظارًا خالصًا،
          // وهو أظهر ما يكون في لعبة لاعبَين حيث يمتلئ اللوبي بأول ضغطة.
          if (joined.size >= game.players.max) {
            control.start(starter.id)
            return
          }
          break
        case 'lobby:seatbot': {
          // القائد وحده يُقعد بوتًا: من يفتح الطاولة يقرر من يجلس عليها
          if (!isHost) break
          const id = [...settings.botPlayers].find((b) => !joined.has(b))
          if (!id || joined.size >= game.players.max) break
          const member = await discordUser(id)
          if (member) {
            joined.set(id, member)
            changed = true
          }
          break
        }
        case 'lobby:leave':
          // القائد لا ينسحب من لعبته — إلغاؤها هو الخروج الصحيح
          if (!isHost && joined.delete(press.userId)) changed = true
          break
        case 'lobby:start':
          if (control.start(press.userId)) return
          break
        case 'lobby:cancel':
          if (control.cancel(press.userId)) return
          break
      }

      if (changed) await render()
    }
  })

  closed = true
  await queue.catch(() => {})
  control.refresh = () => {}
  control.start = () => false
  control.cancel = () => false
  await discord.clearButtons()

  if (outcome === 'cancel') {
    await discord.say('أُلغيت اللعبة.')
    return null
  }
  if (joined.size < game.players.min) {
    await discord.say(`ما اكتمل العدد. تحتاج ${game.players.min} لاعبين على الأقل.`)
    return null
  }

  return [...joined.values()]

  async function discordUser(userId: string): Promise<PlayerView | null> {
    const user = await starter.client.users.fetch(userId).catch(() => null)
    return user ? await playerView(user) : null
  }
}
