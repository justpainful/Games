import { randomUUID } from 'node:crypto'
import { loadGames } from '../games/all.ts'
import type { ButtonDef, GameDef, Press } from '../games/define.ts'
import { activeIn, allSessions, close, open, type Session } from '../games/running.ts'
import {
  announce,
  fanout,
  hubFor,
  makeJoinPoint,
  type JoinDecision,
  type LobbyControl,
  type MultiTable,
  type Surface,
} from '../games/surface.ts'
import { openMatch, settleMatch } from '../players/settle.ts'
import type { LobbyScene, PlayerView } from '../scenes/scene.ts'
import { minPlayersOnSocket } from './solo.ts'

/**
 * الغرف: من يستطيع الانضمام لأي لعبة، وكيف تبدأ لعبة من الجوال وحده.
 *
 * **جسر ديسكورد هو أهم ما هنا.** لعبة بدأت في قناة ديسكورد هي جلسة في
 * `games/running.ts` مثلها مثل غرفة بدأها الجوال؛ الفرق الوحيد أن مفتاحها هو
 * معرّف قناة ديسكورد الحقيقي. فمن يعرف `guildId` + `channelId` ويثبت أنه عضو
 * في السيرفر ينضم إليها بسطح وصلته، ويصير المشهد نفسه صورةً في القناة
 * ومكوّناتٍ في يده. لا سجلّ ثانٍ ولا مزامنة بين حالتين.
 *
 * هذا الملف **لا يستورد** `./env.ts` ولا `./access.ts` عمدًا: التحقق من الهوية
 * والعضوية يقع في `./ws.ts` قبل أي نداء هنا، فيبقى هذا الملف صالحًا للتحميل
 * داخل عملية البوت التي لا تملك أسرار الـ API أصلًا.
 */

/** مهلة لوبي الغرف التي يبدأها الجوال — نظير `settings.lobby.joinSeconds`. */
const LOBBY_MS = 90_000

const LOBBY_BUTTONS: ButtonDef[] = [
  { id: 'lobby:join', label: 'دخول', style: 'join' },
  { id: 'lobby:leave', label: 'خروج', style: 'plain' },
  { id: 'lobby:start', label: 'بدء اللعبة', style: 'start' },
  { id: 'lobby:cancel', label: 'إلغاء', style: 'stop' },
]

/** الكتالوج يُقرأ من القرص مرة واحدة — `loadGames` تفتح سبعة وعشرين ملفًا. */
let cached: Promise<GameDef[]> | null = null

export function catalog(): Promise<GameDef[]> {
  cached ??= loadGames()
  return cached
}

export async function gameByKey(key: string): Promise<GameDef | undefined> {
  return (await catalog()).find((game) => game.key === key)
}

export type RoomBrief = {
  /** معرّف الغرفة = مفتاح الجلسة: قناة ديسكورد، أو `room:xxxxxxxx` */
  id: string
  guildId: string
  gameKey: string
  gameName: string
  origin: 'discord' | 'socket'
  phase: 'lobby' | 'playing'
  hostId: string
  players: PlayerView[]
  min: number
  max: number
  /** قناة ديسكورد إن نشأت الغرفة هناك — يعرضه التطبيق ليقول «في قناة #…» */
  channelId: string | null
  startedAt: number
}

export function describe(session: Session): RoomBrief | null {
  const join = session.join
  if (!join) return null
  return {
    id: session.channelId,
    guildId: session.guildId,
    gameKey: session.game.key,
    gameName: session.game.name,
    origin: join.origin,
    phase: join.phase(),
    hostId: session.hostId,
    players: join.roster(),
    min: join.limits.min,
    max: join.limits.max,
    channelId: join.origin === 'discord' ? session.channelId : null,
    startedAt: session.startedAt,
  }
}

/**
 * الغرف النشطة في سيرفر — لوبيات تُنتظر وألعاب جارية يمكن مشاهدتها.
 * الترتيب: اللوبيات أولًا (يمكن اللحاق بها فعلًا)، ثم الأحدث.
 */
export function listRooms(guildId: string): RoomBrief[] {
  return allSessions()
    .filter((session) => session.guildId === guildId && !session.aborted)
    .map(describe)
    .filter((room): room is RoomBrief => room !== null)
    .sort((a, b) => {
      if (a.phase !== b.phase) return a.phase === 'lobby' ? -1 : 1
      return b.startedAt - a.startedAt
    })
}

export function roomById(roomId: string): Session | undefined {
  return activeIn(roomId)
}

// ————————————————————— الانضمام لغرفة قائمة —————————————————————

export type JoinOutcome = { ok: true; room: RoomBrief } | { ok: false; reason: string }

/**
 * ينضم لاعب بسطحه لغرفة قائمة.
 *
 * `guildId` يُطابَق مع سيرفر الجلسة: من تحقّقت عضويته في سيرفر لا يفتح له ذلك
 * غرف سيرفر آخر. التحقق من العضوية نفسه واجب المتصل (`ws.ts`) قبل النداء.
 */
export async function joinRoom(args: {
  roomId: string
  guildId: string
  player: PlayerView
  surface: Surface
}): Promise<JoinOutcome> {
  const session = activeIn(args.roomId)
  if (!session || !session.join) return { ok: false, reason: 'الغرفة غير موجودة أو أُغلقت' }
  if (session.guildId !== args.guildId) return { ok: false, reason: 'الغرفة تتبع سيرفرًا آخر' }
  if (session.aborted) return { ok: false, reason: 'اللعبة أُوقفت' }

  const decision: JoinDecision = await session.join.admit(args.player, args.surface)
  if (!decision.ok) return { ok: false, reason: decision.reason }

  const room = describe(session)
  return room ? { ok: true, room } : { ok: false, reason: 'الغرفة أُغلقت أثناء الانضمام' }
}

export function leaveRoom(roomId: string, userId: string, surface: Surface): void {
  activeIn(roomId)?.join?.release(userId, surface)
}

/** القائد وحده يبدأ. يعيد false إن لم يكن قائدًا أو لم يكتمل العدد. */
export function startRoom(roomId: string, userId: string): boolean {
  return activeIn(roomId)?.join?.start(userId) ?? false
}

export function cancelRoom(roomId: string, userId: string): boolean {
  return activeIn(roomId)?.join?.cancel(userId) ?? false
}

/**
 * جسر اختياري يمنح غرف الجوال سطحًا إضافيًا — عمليًا: قناة ديسكورد تعكسها.
 *
 * ————————————————— لماذا حقنٌ لا استيراد —————————————————
 *
 * هذه الطبقة لا تعرف ديسكورد ولا يجوز أن تعرفه: هي تتكلّم `Surface` وحدها،
 * وذلك ما يجعل نفس الغرفة تعمل على أي سطح. فلو استوردت `makeDiscordSurface`
 * هنا لانقلبت العلاقة وصار الـAPI تابعًا لسطح بعينه.
 *
 * فالجسر يُسجَّل من طبقة ديسكورد عند الإقلاع، وهذه الطبقة تناديه ولا تعرف
 * ما وراءه. ومن لا يسجّله تعمل غرفه كما كانت.
 */
export type RoomMirror = (session: Session) => Promise<Surface | null>

let mirror: RoomMirror | null = null

/** يُنادى مرة عند الإقلاع من طبقة ديسكورد. */
export function setRoomMirror(next: RoomMirror | null): void {
  mirror = next
}

// ————————————————————— غرفة يبدأها الجوال وحده —————————————————————

/**
 * ينشئ غرفة بلا قناة ديسكورد ويبدأ دورة حياتها في الخلفية.
 *
 * تُعامَل تمامًا كلعبة ديسكورد: نفس `Session`، ونفس `fanout`، ونفس المحاسبة.
 * الفرق الوحيد أن قائمة أسطحها كلها وصلات.
 */
export function createRoom(args: {
  game: GameDef
  guildId: string
  host: PlayerView
  surface: Surface
}): JoinOutcome {
  const { game, guildId, host, surface } = args

  const roomId = `room:${randomUUID().replace(/-/g, '').slice(0, 12)}`
  if (activeIn(roomId)) return { ok: false, reason: 'تعذّر توليد معرّف غرفة، أعد المحاولة' }

  let aborted = false
  const session: Session = {
    game,
    guildId,
    channelId: roomId,
    hostId: host.id,
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

  const joined = new Map<string, PlayerView>([[host.id, host]])
  const surfaces = new Set<Surface>([surface])
  let phase: 'lobby' | 'playing' = 'lobby'
  let table: MultiTable | null = null
  const control: LobbyControl = { refresh: () => {}, start: () => false, cancel: () => false }

  /**
   * غرفة بلا قناة: انقطاع القائد يُنهي لوبيًا لا أحد يستطيع بدءه، ومغادرة آخر
   * سطح تعني لعبة تدور بلا مشاهد — وكلاهما لا ينطبق على لوبي داخل قناة ديسكورد.
   */
  session.join = makeJoinPoint({
    origin: 'socket',
    session,
    hostId: host.id,
    limits: { min: minPlayersOnSocket(game), max: game.players.max },
    joined,
    sockets: surfaces,
    phase: () => phase,
    table: () => table,
    control,
    hostLeaveCancels: true,
    emptyStops: true,
  })

  open(session)
  surface.attach(hubFor(session))

  void runRoom({ session, game, host, joined, surfaces, control, setPhase: (p) => (phase = p), })
    .catch((error: unknown) => console.error(`غرفة ${roomId} تعطّلت:`, error))
    .finally(() => {
      session.join = null
      for (const live of [...surfaces]) live.detach()
      surfaces.clear()
      close(roomId)
    })

  const room = describe(session)
  return room ? { ok: true, room } : { ok: false, reason: 'تعذّر إنشاء الغرفة' }

  async function runRoom(inner: {
    session: Session
    game: GameDef
    host: PlayerView
    joined: Map<string, PlayerView>
    surfaces: Set<Surface>
    control: LobbyControl
    setPhase: (phase: 'lobby' | 'playing') => void
  }): Promise<void> {
    /**
     * المرآة تُركَّب قبل اللوبي لا بعده.
     *
     * أول مشهد يرسمه اللوبي هو ما يراه الناس في القناة، فلو رُكّبت بعده لظهرت
     * الغرفة في ديسكورد وقد فاتها إعلان فتحها. وفشل التركيب لا يُسقط الغرفة:
     * صاحبها على الجوال يلعب سواء عكسناها أم لا.
     */
    if (mirror) {
      const extra = await mirror(inner.session).catch(() => null)
      if (extra) {
        inner.surfaces.add(extra)
        extra.attach(hubFor(inner.session))
      }
    }

    const players = await runLobby(inner)
    if (!players) {
      announce([...inner.surfaces], { type: 'cancelled', reason: 'أُلغي اللوبي' })
      return
    }

    inner.setPhase('playing')
    const first = players[0]!
    table = fanout([...inner.surfaces], {
      brief: briefOf(inner.game),
      players,
      host: first,
      session: inner.session,
    })
    announce(table.surfaces(), { type: 'started', players })

    try {
      const matchId = await openMatch(inner.session.guildId, inner.game.key, players.length)
      const result = await inner.game.play(table)

      // نفس محاسبة `src/discord/host.ts` حرفيًا — رصيد اللاعب واحد أيًّا كان السطح
      await settleMatch({
        guildId: inner.session.guildId,
        wallet: inner.game.wallet,
        players: players.map((player) => player.id),
        result,
        matchId,
      })

      announce(table.surfaces(), {
        type: 'ended',
        winnerId: result.winnerId ?? null,
        scores: Object.fromEntries(result.scores ?? new Map<string, number>()),
      })
    } catch (error) {
      console.error(`اللعبة ${inner.game.key} تعطّلت في غرفة ${roomId}:`, error)
      announce(table?.surfaces() ?? [...inner.surfaces], {
        type: 'cancelled',
        reason: 'صار خطأ وأُلغيت اللعبة',
      })
    }
  }
}

function briefOf(game: GameDef) {
  return { key: game.key, name: game.name, tagline: game.tagline, howTo: game.howTo }
}

/**
 * لوبي الغرفة: نفس مشهد لوبي ديسكورد ونفس معرّفات الأزرار، فالتطبيق يرسم
 * الشاشة نفسها أينما بدأت اللعبة.
 */
async function runLobby(args: {
  session: Session
  game: GameDef
  host: PlayerView
  joined: Map<string, PlayerView>
  surfaces: Set<Surface>
  control: LobbyControl
}): Promise<PlayerView[] | null> {
  const { session, game, host, joined, surfaces, control } = args
  const minimum = minPlayersOnSocket(game)

  const scene = (): LobbyScene => ({
    kind: 'lobby',
    game: briefOf(game),
    host: joined.values().next().value ?? null,
    players: [...joined.values()],
    min: minimum,
    max: game.players.max,
  })

  let closed = false
  let first = true
  let queue: Promise<void> = Promise.resolve()

  function render(): Promise<void> {
    queue = queue.then(async () => {
      if (closed) return
      const replace = !first
      first = false
      const opts = { text: `${game.name} — بانتظار اللاعبين`, buttons: LOBBY_BUTTONS }
      await Promise.all(
        [...surfaces].map((surface) => surface.present(scene(), opts, replace).catch(() => {})),
      )
    })
    return queue
  }

  await render()

  const outcome = await new Promise<'start' | 'cancel' | 'timeout'>((resolve) => {
    const timer = setTimeout(() => finishWith('timeout'), LOBBY_MS)

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
      if (userId !== host.id || joined.size < minimum) return false
      finishWith('start')
      return true
    }
    control.cancel = (userId) => {
      if (userId !== host.id) return false
      finishWith('cancel')
      return true
    }

    async function handle(press: Press): Promise<void> {
      switch (press.id) {
        // الانضمام والخروج يمرّان برسائل الوصلة لا بالزر، لأنهما يحتاجان
        // سطحًا وتحققًا من العضوية — الزر هنا اختصار لمن هو داخل الغرفة أصلًا
        case 'lobby:leave':
          if (press.userId !== host.id && joined.delete(press.userId)) await render()
          break
        case 'lobby:start':
          control.start(press.userId)
          break
        case 'lobby:cancel':
          control.cancel(press.userId)
          break
      }
    }
  })

  closed = true
  await queue.catch(() => {})
  control.refresh = () => {}
  control.start = () => false
  control.cancel = () => false

  if (outcome === 'cancel' || session.aborted) return null
  if (joined.size < minimum) return null

  return [...joined.values()]
}
