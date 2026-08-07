import type { ButtonDef, ChatInput, Press, ShowOptions, Table } from '../games/define.ts'
import type { Session } from '../games/running.ts'
import type { GameBrief, PlayerView, Scene } from '../scenes/scene.ts'

/**
 * تنفيذ `Table` فوق وصلة WebSocket.
 *
 * التوأم الثاني لـ `src/discord/table.ts`، وهو الدليل العملي على أن الفصل
 * المفروض بـ ESLint لم يكن ترفًا: الألعاب الثمانٍ والعشرون تعمل هنا بلا تعديل
 * حرف واحد فيها. الفارق كله أن ديسكورد يحوّل المشهد إلى PNG، وهنا يُرسل المشهد
 * كما هو ويرسمه التطبيق مكوّنات أصلية — وهذا هو بيت القصيد من `Scene`.
 */

export type Outgoing =
  | {
      type: 'scene'
      scene: Scene
      text?: string
      buttons?: ButtonDef[]
      /** true = استبدل المشهد السابق، false = مشهد جديد (يقابل update/show) */
      replace: boolean
      /** يتغيّر مع كل مشهد — الضغطات المتأخرة تُقاس عليه */
      sceneId: string
    }
  | { type: 'say'; text: string }
  | { type: 'whisper'; text: string }
  | { type: 'started'; gameId: string; guildId: string; players: PlayerView[] }
  | { type: 'ended'; result: { winnerId: string | null; scores: Record<string, number> } }
  | { type: 'error'; message: string }
  | { type: 'pong' }

export type Send = (message: Outgoing) => boolean

export function makeWsTable(args: {
  brief: GameBrief
  players: PlayerView[]
  host: PlayerView
  session: Session
  send: Send
}): Table {
  const { brief, session, send } = args
  let players = [...args.players]
  let scenes = 0

  function emit(scene: Scene, opts: ShowOptions | undefined, replace: boolean): Promise<void> {
    scenes += 1
    const sceneId = String(scenes)
    // نثبّت المشهد الحيّ قبل الإرسال: ضغطة تصل على مشهد سابق تُرفض في deliverPress
    session.liveMessageId = sceneId

    send({
      type: 'scene',
      scene,
      ...(opts?.text ? { text: opts.text } : {}),
      ...(opts?.buttons ? { buttons: opts.buttons } : {}),
      replace,
      sceneId,
    })
    return Promise.resolve()
  }

  /** ينتظر أول قيمة تصل من مستمع، أو null عند انتهاء المهلة. */
  function waitFor<T>(
    ms: number,
    pool: Set<{ test?: (value: T) => boolean; deliver: (value: T) => void }>,
    test?: (value: T) => boolean,
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

    show: (scene, opts) => emit(scene, opts, false),
    update: (scene, opts) => emit(scene, opts, true),

    say(text) {
      send({ type: 'say', text })
      return Promise.resolve()
    },

    /**
     * الوصلة واحدة لكل لاعب، فالهمس لغير صاحبها لا مكان له اليوم.
     * إعادة `false` هي نفس ما يحدث في ديسكورد حين يقفل اللاعب الخاص، والألعاب
     * تتعامل معها أصلًا (مافيا تعلن الدور علنًا حين يفشل الهمس).
     */
    whisper(userId, text) {
      if (userId !== args.host.id) return Promise.resolve(false)
      return Promise.resolve(send({ type: 'whisper', text }))
    },

    waitChat: (ms, test) => waitFor<ChatInput>(ms, session.chatListeners, test),
    waitPress: (ms, test) => waitFor<Press>(ms, session.pressListeners, test),

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

    collectPresses(ms, test) {
      return new Promise<Press[]>((resolve) => {
        const seen = new Map<string, Press>()
        const listener = {
          test: (press: Press) => (test ? test(press) : true),
          deliver: (press: Press) => {
            seen.set(press.userId, press)
          },
        }
        session.pressListeners.add(listener)
        setTimeout(() => {
          session.pressListeners.delete(listener)
          resolve([...seen.values()])
        }, ms)
      })
    },

    sleep: (ms) => new Promise((done) => setTimeout(done, ms)),

    drop(userId) {
      players = players.filter((player) => player.id !== userId)
    },

    get aborted() {
      return session.aborted
    },
  }
}
