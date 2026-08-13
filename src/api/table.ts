import type { ButtonDef, ShowOptions } from '../games/define.ts'
import type { InputHub, LifecycleEvent, Surface } from '../games/surface.ts'
import type { PlayerView, Scene } from '../scenes/scene.ts'
import type { RoomBrief } from './rooms.ts'

/**
 * وصلة WebSocket بوصفها **سطحًا** — لاعب واحد، وليست طاولة كاملة.
 *
 * كان هذا الملف ينفّذ `Table` بأكملها، ولذلك كانت وصلة واحدة = لعبة واحدة =
 * لاعب واحد، ولم يعمل إلا اللعب المنفرد. صار ينفّذ `Surface` وحده، وتجمعه
 * `fanout` مع وصلات أخرى ومع قناة ديسكورد في طاولة واحدة. هذا كل الفرق بين
 * «لعبة سوليتير» و«لعب جماعي عبر السطحين».
 *
 * ما يميّز هذا السطح عن سطح ديسكورد: يملك لاعبه (`owns`)، فالهمس يصل إليه
 * وحده؛ ولا يرسم صورة بل يرسل `Scene` كما هي ويرسمها التطبيق مكوّنات أصلية.
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
  /**
   * مشهد يخصّ صاحب الوصلة وحده: لوح سيّد التجسّس، أو يد اللاعب في لعبة أوراق.
   *
   * منفصل عن `scene` لأنه لا يدخل تسلسل المشاهد ولا يُستبدل بما بعده، وعن
   * `whisper` لأن ذاك نصّ وهذا صورة تُقرأ بجوار اللوح العام.
   */
  | { type: 'private'; scene: Scene; text?: string }
  /** قائمة الغرف التي يمكن الانضمام إليها في سيرفر */
  | { type: 'rooms'; guildId: string; rooms: RoomBrief[] }
  /** نجح الانضمام أو الإنشاء — التطبيق يفتح شاشة اللوبي */
  | { type: 'joined'; room: RoomBrief }
  | { type: 'left'; roomId: string }
  | { type: 'started'; gameId: string; guildId: string; players: PlayerView[] }
  | { type: 'ended'; result: { winnerId: string | null; scores: Record<string, number> } }
  | { type: 'cancelled'; reason: string }
  | { type: 'error'; message: string }
  | { type: 'pong' }

export type Send = (message: Outgoing) => boolean

export type SocketSurface = Surface & {
  readonly player: PlayerView
  /** رسالة شات من هذه الوصلة — تُنسب لصاحبها لا لما يدّعيه العميل */
  receiveChat(text: string): void
  /**
   * ضغطة زر. تُرفض إن كانت على مشهد سابق: `sceneId` يقابل معرّف الرسالة في
   * ديسكورد، وكلٌّ يقيس على مشهده هو لأن السطحين لا يتشاركان ترقيمًا.
   */
  receivePress(id: string, sceneId?: string | null): boolean
  /** يرسل رسالة خدمية للعميل مباشرة (خارج مجرى اللعبة) */
  emit(message: Outgoing): boolean
}

export function makeSocketSurface(args: {
  player: PlayerView
  send: Send
  /** اللعبة والسيرفر يُعرفان بعد الانضمام — تُستعمل في `started` */
  context?: () => { gameId: string; guildId: string }
}): SocketSurface {
  const { player, send } = args
  let hub: InputHub | null = null
  let scenes = 0
  let liveSceneId: string | null = null

  return {
    id: `socket:${player.id}`,
    player,

    /** الوصلة قناة خاصة بصاحبها — الهمس له وحده يصل هنا. */
    owns: (userId) => userId === player.id,
    fallback: false,

    present(scene: Scene, opts: ShowOptions | undefined, replace: boolean): Promise<void> {
      // سطح التحق متأخرًا يستقبل `update` كأول رسالة له ولا مشهد سابق ليستبدله؛
      // نحوّلها إلى `show` بدل أن يعرض التطبيق شاشة فارغة
      const isFirst = scenes === 0
      scenes += 1
      const sceneId = String(scenes)
      liveSceneId = sceneId
      send({
        type: 'scene',
        scene,
        ...(opts?.text ? { text: opts.text } : {}),
        ...(opts?.buttons ? { buttons: opts.buttons } : {}),
        replace: replace && !isFirst,
        sceneId,
      })
      return Promise.resolve()
    },

    say(text) {
      send({ type: 'say', text })
      return Promise.resolve()
    },

    whisper(userId, text) {
      if (userId !== player.id) return Promise.resolve(false)
      return Promise.resolve(send({ type: 'whisper', text }))
    },

    /**
     * وصلة الجوال تخدم لاعبًا واحدًا، فالمشهد الخاص يذهب إليه إن كان الضاغط.
     *
     * ولا تلزم هنا تذكرة تفاعل كما في ديسكورد: الوصلة مفتوحة على صاحبها أصلًا،
     * فخصوصية الرسالة من كونها وصلته لا من كونها ردًّا على ضغطة بعينها.
     */
    reveal(press, scene, opts) {
      if (press.userId !== player.id) return Promise.resolve(false)
      return Promise.resolve(
        send({ type: 'private', scene, ...(opts?.text ? { text: opts.text } : {}) }),
      )
    },

    attach(next) {
      hub = next
    },
    detach() {
      hub = null
    },

    /** خروج اللاعب من الجدول — الوصلة تبقى مفتوحة وتشاهد ما تبقّى. */
    drop(userId) {
      if (userId !== player.id) return
      liveSceneId = null
    },

    lifecycle(event: LifecycleEvent) {
      switch (event.type) {
        case 'started': {
          const where = args.context?.()
          send({
            type: 'started',
            gameId: where?.gameId ?? '',
            guildId: where?.guildId ?? '',
            players: event.players,
          })
          return
        }
        case 'ended':
          send({ type: 'ended', result: { winnerId: event.winnerId, scores: event.scores } })
          return
        case 'cancelled':
          send({ type: 'cancelled', reason: event.reason })
          return
      }
    },

    receiveChat(text) {
      hub?.chat({ userId: player.id, text })
    },

    receivePress(id, sceneId) {
      if (!hub) return false
      // ضغطة على مشهد انتهى تُتجاهل، وإلا صوّت اللاعب في جولة مضت
      if (sceneId && liveSceneId && sceneId !== liveSceneId) return false
      hub.press({ userId: player.id, id })
      return true
    },

    emit: (message) => send(message),
  }
}
