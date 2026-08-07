import { describe, expect, it, vi } from 'vitest'
import type { GameDef, ShowOptions } from './define.ts'
import { deliverChat, deliverPress, open, close, type Session } from './running.ts'
import { announce, fanout, hubFor, type Surface } from './surface.ts'
import type { PlayerView, Scene } from '../scenes/scene.ts'

/**
 * جسر ديسكورد ← الجوال، مثبتًا منطقيًا.
 *
 * السطحان هنا وهميان لكن المسار حقيقي: نفس `Session`، نفس `fanout`، نفس
 * `deliverChat`/`deliverPress` التي ينادِيها عميل ديسكورد، ونفس `hubFor` الذي
 * تدفع فيه وصلة الجوال. ما يُثبَت: المشهد يصل للاثنين، وإجابة من أي منهما
 * تُحتسب، والهمس يذهب لصاحبه، وسطح ساقط لا يوقف اللعبة.
 */

const ALICE: PlayerView = { id: '1', name: 'ألِس', avatar: null }
const BASEL: PlayerView = { id: '2', name: 'باسل', avatar: null }

const NOTICE: Scene = { kind: 'notice', tone: 'info', title: 'جولة' }

function fakeSession(): Session {
  let aborted = false
  return {
    game: { key: 'test', name: 'اختبار' } as unknown as GameDef,
    guildId: '999',
    channelId: 'chan-1',
    hostId: ALICE.id,
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
    join: null,
  }
}

type Recorder = Surface & {
  scenes: Scene[]
  whispers: { userId: string; text: string }[]
  said: string[]
  events: string[]
  dropped: string[]
}

/** سطح «ديسكورد» وهمي: عام، يهمس لمن لا وصلة له، ولا يملك أحدًا. */
function fakeDiscord(opts?: { failing?: boolean }): Recorder {
  return recorder({
    id: 'discord:fake',
    owns: () => false,
    fallback: true,
    failing: opts?.failing ?? false,
  })
}

/** سطح وصلة: يملك لاعبه وحده. */
function fakeSocket(player: PlayerView): Recorder {
  return recorder({
    id: `socket:${player.id}`,
    owns: (userId) => userId === player.id,
    fallback: false,
    failing: false,
  })
}

function recorder(config: {
  id: string
  owns: (userId: string) => boolean
  fallback: boolean
  failing: boolean
}): Recorder {
  const scenes: Scene[] = []
  const whispers: { userId: string; text: string }[] = []
  const said: string[] = []
  const events: string[] = []
  const dropped: string[] = []

  return {
    id: config.id,
    owns: config.owns,
    fallback: config.fallback,
    scenes,
    whispers,
    said,
    events,
    dropped,

    present(scene: Scene, _opts: ShowOptions | undefined, _replace: boolean): Promise<void> {
      // لاعب انقطع نته: سطحه يرمي، ويجب ألا يوقف ذلك اللعبة
      if (config.failing) return Promise.reject(new Error('الوصلة انقطعت'))
      scenes.push(scene)
      return Promise.resolve()
    },
    say(text) {
      said.push(text)
      return Promise.resolve()
    },
    whisper(userId, text) {
      whispers.push({ userId, text })
      return Promise.resolve(true)
    },
    // المدخلات في هذه الاختبارات تُدفع عبر `hubFor(session)` مباشرة، تمامًا
    // كما تفعل الوصلة الحقيقية، فلا حاجة لحفظ المصرف هنا
    attach: () => {},
    detach: () => {},
    drop(userId) {
      dropped.push(userId)
    },
    lifecycle(event) {
      events.push(event.type)
    },
  }
}

describe('fanout — لعبة واحدة، عدة أسطح', () => {
  it('المشهد يصل لسطح ديسكورد ولسطح الوصلة معًا', async () => {
    const session = fakeSession()
    const discord = fakeDiscord()
    const socket = fakeSocket(BASEL)
    const table = fanout([discord, socket], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    await table.show(NOTICE, { text: 'ابدأ' })

    expect(discord.scenes).toHaveLength(1)
    expect(socket.scenes).toHaveLength(1)
    expect(discord.scenes[0]).toBe(socket.scenes[0])
  })

  it('إجابة من ديسكورد تُحتسب', async () => {
    const session = fakeSession()
    open(session)
    const discord = fakeDiscord()
    const socket = fakeSocket(BASEL)
    const table = fanout([discord, socket], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    const answer = table.waitChat(1000)
    // نفس النداء الذي يطلقه `src/discord/client.ts` عند كل رسالة في القناة
    deliverChat('chan-1', { userId: ALICE.id, text: 'من ديسكورد' })

    expect(await answer).toEqual({ userId: ALICE.id, text: 'من ديسكورد' })
    close('chan-1')
  })

  it('إجابة من الوصلة تُحتسب في نفس الجدول', async () => {
    const session = fakeSession()
    const discord = fakeDiscord()
    const socket = fakeSocket(BASEL)
    const table = fanout([discord, socket], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    const answer = table.waitChat(1000)
    // ما تفعله وصلة الجوال بالضبط: تدفع في مصرف الجلسة نفسه
    hubFor(session).chat({ userId: BASEL.id, text: 'من الجوال' })

    expect(await answer).toEqual({ userId: BASEL.id, text: 'من الجوال' })
  })

  it('أول مطابق يفوز أيًّا كان سطحه', async () => {
    const session = fakeSession()
    open(session)
    const table = fanout([fakeDiscord(), fakeSocket(BASEL)], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    const race = table.waitChat(1000, (input) => input.text === 'صح')
    deliverChat('chan-1', { userId: ALICE.id, text: 'غلط' })
    hubFor(session).chat({ userId: BASEL.id, text: 'صح' })
    deliverChat('chan-1', { userId: ALICE.id, text: 'صح' })

    expect((await race)?.userId).toBe(BASEL.id)
    close('chan-1')
  })

  it('collectChat تدمج السطحين', async () => {
    vi.useFakeTimers()
    const session = fakeSession()
    open(session)
    const table = fanout([fakeDiscord(), fakeSocket(BASEL)], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    const collected = table.collectChat(5000)
    deliverChat('chan-1', { userId: ALICE.id, text: 'أ' })
    hubFor(session).chat({ userId: BASEL.id, text: 'ب' })
    await vi.advanceTimersByTimeAsync(5001)

    expect((await collected).map((input) => input.userId).sort()).toEqual(['1', '2'])
    close('chan-1')
    vi.useRealTimers()
  })

  it('الضغطة من ديسكورد تمرّ بحارس المشهد الحيّ', async () => {
    const session = fakeSession()
    open(session)
    const table = fanout([fakeDiscord()], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE],
      host: ALICE,
      session,
    })
    session.liveMessageId = 'msg-2'

    const press = table.waitPress(1000)
    expect(deliverPress('chan-1', 'msg-1', { userId: ALICE.id, id: 'قديم' })).toBe(false)
    expect(deliverPress('chan-1', 'msg-2', { userId: ALICE.id, id: 'جديد' })).toBe(true)

    expect((await press)?.id).toBe('جديد')
    close('chan-1')
  })

  it('whisper يذهب لسطح صاحبه وحده، ولمن لا سطح له عبر ديسكورد', async () => {
    const session = fakeSession()
    const discord = fakeDiscord()
    const socket = fakeSocket(BASEL)
    const table = fanout([discord, socket], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    expect(await table.whisper(BASEL.id, 'أنت مافيا')).toBe(true)
    expect(socket.whispers).toEqual([{ userId: BASEL.id, text: 'أنت مافيا' }])
    expect(discord.whispers).toHaveLength(0)

    // ألِس لاعبة ديسكورد بلا وصلة — الهمس يصلها بالخاص كما كان دائمًا
    expect(await table.whisper(ALICE.id, 'أنت مواطن')).toBe(true)
    expect(discord.whispers).toEqual([{ userId: ALICE.id, text: 'أنت مواطن' }])
  })

  it('سطح يفشل لا يوقف اللعبة ولا يمنع البقية', async () => {
    const session = fakeSession()
    const broken = fakeDiscord({ failing: true })
    const socket = fakeSocket(BASEL)
    const table = fanout([broken, socket], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    await expect(table.show(NOTICE)).resolves.toBeUndefined()
    expect(socket.scenes).toHaveLength(1)
  })

  it('drop يزيل اللاعب من الجدول ومن كل الأسطح', async () => {
    const session = fakeSession()
    const discord = fakeDiscord()
    const socket = fakeSocket(BASEL)
    const table = fanout([discord, socket], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    table.drop(BASEL.id)

    expect(table.players.map((player) => player.id)).toEqual([ALICE.id])
    expect(discord.dropped).toEqual([BASEL.id])
    expect(socket.dropped).toEqual([BASEL.id])
    await Promise.resolve()
  })

  it('سطح يلتحق أثناء اللعب يستقبل المشاهد التالية', async () => {
    const session = fakeSession()
    const discord = fakeDiscord()
    const table = fanout([discord], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    await table.show(NOTICE)
    const latecomer = fakeSocket(BASEL)
    table.addSurface(latecomer)
    await table.update(NOTICE)

    expect(discord.scenes).toHaveLength(2)
    expect(latecomer.scenes).toHaveLength(1)

    // وانضمامه يجعل إجاباته تُحتسب فورًا
    const answer = table.waitChat(1000)
    hubFor(session).chat({ userId: BASEL.id, text: 'لحقت' })
    expect((await answer)?.text).toBe('لحقت')
  })

  it('نزع سطح يوقف بثّه ولا يؤثر على الباقين', async () => {
    const session = fakeSession()
    const discord = fakeDiscord()
    const socket = fakeSocket(BASEL)
    const table = fanout([discord, socket], {
      brief: { key: 'test', name: 'اختبار', tagline: '', howTo: '' },
      players: [ALICE, BASEL],
      host: ALICE,
      session,
    })

    table.removeSurface(socket)
    await table.show(NOTICE)

    expect(discord.scenes).toHaveLength(1)
    expect(socket.scenes).toHaveLength(0)
  })

  it('announce يبلّغ الأسطح بنهاية اللعبة', () => {
    const socket = fakeSocket(BASEL)
    announce([socket], { type: 'ended', winnerId: BASEL.id, scores: { '2': 1 } })
    expect(socket.events).toEqual(['ended'])
  })
})
