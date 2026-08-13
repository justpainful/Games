import { afterEach, describe, expect, it } from 'vitest'
import type { GameDef, ShowOptions } from '../games/define.ts'
import { close, deliverChat, open, type Session } from '../games/running.ts'
import {
  fanout,
  makeJoinPoint,
  type LobbyControl,
  type MultiTable,
  type Surface,
} from '../games/surface.ts'
import type { PlayerView, Scene } from '../scenes/scene.ts'
import { joinRoom, leaveRoom, listRooms } from './rooms.ts'
import { makeSocketSurface, type Outgoing } from './table.ts'

/**
 * جسر ديسكورد، من طرفه الآخر.
 *
 * `surface.test.ts` يثبت أن `fanout` يدمج سطحين. هذا يثبت الطريق الذي يسلكه
 * لاعب الجوال فعلًا: جلسة بدأت في **قناة ديسكورد** تظهر في `listRooms`، ثم
 * `joinRoom` بـ `guildId` + `channelId` يضم سطح وصلته إلى نفس الطاولة.
 *
 * الوحيد المزوَّر هنا هو سطح القناة (الحقيقي يحتاج عميل ديسكورد). كل ما عداه
 * إنتاجي: `makeJoinPoint` نفسه الذي ينادِيه `src/discord/host.ts`،
 * و`makeSocketSurface` نفسه الذي تبنيه الوصلة، و`joinRoom` نفسها.
 */

const GUILD = '111111111111111111'
const CHANNEL = '222222222222222222'

const LEADER: PlayerView = { id: '1', name: 'قائد ديسكورد', avatar: null }
const MOBILE: PlayerView = { id: '2', name: 'لاعب جوال', avatar: null }

const XO = {
  key: 'xo',
  name: 'xo',
  tagline: 'ثلاث خانات في صف',
  howTo: '',
  players: { min: 2, max: 2 },
  wallet: 'solo',
} as unknown as GameDef

/** سطح قناة ديسكورد الوهمي: عام، لا يملك لاعبًا، ويستقبل الهمس عن الجميع. */
type Channel = Surface & { scenes: Scene[] }

function fakeChannel(): Channel {
  const scenes: Scene[] = []
  return {
    id: 'discord:fake',
    owns: () => false,
    fallback: true,
    scenes,
    present(scene: Scene, _opts: ShowOptions | undefined, _replace: boolean): Promise<void> {
      scenes.push(scene)
      return Promise.resolve()
    },
    say: () => Promise.resolve(),
    whisper: () => Promise.resolve(true),
    reveal: () => Promise.resolve(true),
    attach: () => {},
    detach: () => {},
    drop: () => {},
  }
}

/** وصلة جوال حقيقية بمصرف وهمي مكان الـ WebSocket. */
function mobileSocket(player: PlayerView) {
  const sent: Outgoing[] = []
  const surface = makeSocketSurface({
    player,
    send: (message) => {
      sent.push(message)
      return true
    },
  })
  return { surface, sent, scenes: () => sent.filter((message) => message.type === 'scene') }
}

/** جلسة ديسكورد كما يبنيها `startGame`. */
function discordSession() {
  let aborted = false
  let phase: 'lobby' | 'playing' = 'lobby'
  let table: MultiTable | null = null

  const session: Session = {
    game: XO,
    guildId: GUILD,
    channelId: CHANNEL,
    hostId: LEADER.id,
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

  const channel = fakeChannel()
  const joined = new Map<string, PlayerView>([[LEADER.id, LEADER]])
  const sockets = new Set<Surface>()
  const control: LobbyControl & { refreshes: number } = {
    refreshes: 0,
    refresh() {
      control.refreshes += 1
    },
    start: () => true,
    cancel: () => true,
  }

  session.join = makeJoinPoint({
    origin: 'discord',
    session,
    hostId: LEADER.id,
    limits: XO.players,
    joined,
    sockets,
    phase: () => phase,
    table: () => table,
    control,
  })
  open(session)

  /** ما يفعله `startGame` بعد اكتمال اللوبي بالضبط. */
  function begin(): MultiTable {
    phase = 'playing'
    table = fanout([channel, ...sockets], {
      brief: { key: 'xo', name: 'xo', tagline: '', howTo: '' },
      players: [LEADER, MOBILE],
      host: LEADER,
      session,
    })
    return table
  }

  return { session, channel, joined, sockets, control, begin }
}

afterEach(() => close(CHANNEL))

describe('جسر ديسكورد ← الجوال', () => {
  it('لعبة قناة ديسكورد تظهر في قائمة الغرف', () => {
    discordSession()
    const rooms = listRooms(GUILD)

    expect(rooms).toHaveLength(1)
    expect(rooms[0]?.id).toBe(CHANNEL)
    expect(rooms[0]?.origin).toBe('discord')
    expect(rooms[0]?.channelId).toBe(CHANNEL)
    expect(rooms[0]?.players.map((player) => player.name)).toEqual(['قائد ديسكورد'])
  })

  it('لا تظهر لسيرفر آخر', () => {
    discordSession()
    expect(listRooms('999999999999999999')).toHaveLength(0)
  })

  it('الانضمام بسيرفر خاطئ يُرفض ولو صحّ معرّف الغرفة', async () => {
    discordSession()
    const mobile = mobileSocket(MOBILE)

    const outcome = await joinRoom({
      roomId: CHANNEL,
      guildId: '999999999999999999',
      player: MOBILE,
      surface: mobile.surface,
    })

    expect(outcome).toEqual({ ok: false, reason: 'الغرفة تتبع سيرفرًا آخر' })
  })

  it('لاعب الجوال ينضم للوبي القناة فيصير من اللاعبين', async () => {
    const world = discordSession()
    const mobile = mobileSocket(MOBILE)

    const outcome = await joinRoom({
      roomId: CHANNEL,
      guildId: GUILD,
      player: MOBILE,
      surface: mobile.surface,
    })

    expect(outcome.ok).toBe(true)
    expect(world.joined.get(MOBILE.id)).toEqual(MOBILE)
    expect(world.sockets.has(mobile.surface)).toBe(true)
    // اللوبي أُعيد رسمه ليرى لاعبو القناة الاسم الجديد
    expect(world.control.refreshes).toBe(1)
    expect(listRooms(GUILD)[0]?.players).toHaveLength(2)
  })

  it('المشهد يصل للقناة وللجوال، وإجابة أيٍّ منهما تُحتسب', async () => {
    const world = discordSession()
    const mobile = mobileSocket(MOBILE)
    await joinRoom({ roomId: CHANNEL, guildId: GUILD, player: MOBILE, surface: mobile.surface })

    const table = world.begin()
    await table.show({ kind: 'notice', tone: 'info', title: 'دورك' })

    expect(world.channel.scenes).toHaveLength(1)
    expect(mobile.scenes()).toHaveLength(1)

    // من القناة — نفس نداء `src/discord/client.ts` عند كل رسالة
    const fromDiscord = table.waitChat(500)
    deliverChat(CHANNEL, { userId: LEADER.id, text: 'من القناة' })
    expect(await fromDiscord).toEqual({ userId: LEADER.id, text: 'من القناة' })

    // من الوصلة — نفس ما يفعله `ws.ts` عند رسالة `answer`
    const fromMobile = table.waitChat(500)
    mobile.surface.receiveChat('من الجوال')
    expect(await fromMobile).toEqual({ userId: MOBILE.id, text: 'من الجوال' })
  })

  it('الهمس للاعب الجوال يذهب لوصلته لا للقناة', async () => {
    const world = discordSession()
    const mobile = mobileSocket(MOBILE)
    await joinRoom({ roomId: CHANNEL, guildId: GUILD, player: MOBILE, surface: mobile.surface })
    const table = world.begin()

    expect(await table.whisper(MOBILE.id, 'أنت مافيا')).toBe(true)
    expect(mobile.sent.some((message) => message.type === 'whisper')).toBe(true)
  })

  it('انقطاع لاعب الجوال وسط اللعبة يُسقطه ولا يوقف اللعبة', async () => {
    const world = discordSession()
    const mobile = mobileSocket(MOBILE)
    await joinRoom({ roomId: CHANNEL, guildId: GUILD, player: MOBILE, surface: mobile.surface })
    const table = world.begin()

    leaveRoom(CHANNEL, MOBILE.id, mobile.surface)

    expect(table.players.map((player) => player.id)).toEqual([LEADER.id])
    expect(table.surfaces()).not.toContain(mobile.surface)
    // اللعبة مستمرة لسطح القناة — الانقطاع لا يُوقف الجلسة
    expect(world.session.aborted).toBe(false)
    await table.show({ kind: 'notice', tone: 'info', title: 'مستمرة' })
    expect(world.channel.scenes).toHaveLength(1)
    expect(mobile.scenes()).toHaveLength(0)
  })

  it('اللوبي الممتلئ يرفض الانضمام برسالة واضحة', async () => {
    const world = discordSession()
    world.joined.set(MOBILE.id, MOBILE)
    const third = mobileSocket({ id: '3', name: 'ثالث', avatar: null })

    const outcome = await joinRoom({
      roomId: CHANNEL,
      guildId: GUILD,
      player: { id: '3', name: 'ثالث', avatar: null },
      surface: third.surface,
    })

    expect(outcome).toEqual({ ok: false, reason: 'اكتمل عدد اللاعبين' })
  })
})
