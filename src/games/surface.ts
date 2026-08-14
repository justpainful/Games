import type { ButtonDef, ChatInput, Press, ShowOptions, Table } from './define.ts'
import { feedChat, feedPress, type Session } from './running.ts'
import type { GameBrief, PlayerView, Scene } from '../scenes/scene.ts'

/**
 * تعميم `Table` على عدة أسطح عرض.
 *
 * `Table` واجهة لعبة واحدة أمام **سطح واحد**. هذا الملف يكسر ذلك القيد:
 * `Surface` هو سطح عرض واحد (قناة ديسكورد، أو وصلة WebSocket للاعب واحد)،
 * و`fanout` يبني `Table` واحدة فوق عدة أسطح — **لعبة واحدة، عدة أسطح**.
 * الألعاب السبع والعشرون لا تعرف بأي شيء من هذا: تبقى تنادي `show` و`waitPress`
 * كما كانت، ويصير المشهد نفسه صورةً في ديسكورد ومكوّناتٍ أصلية في الجوال في
 * اللحظة ذاتها.
 *
 * ممنوع `discord.js` هنا — القاعدة في `eslint.config.js` تكسر البناء، وهي
 * بالضبط ما يجعل هذا الملف ممكنًا أصلًا.
 */

/**
 * مصرف المدخلات المشترك للجلسة.
 *
 * كل سطح يدفع فيه ما يستقبله من لاعبيه بعد أن يتحقّق من حداثته (ضغطة على مشهد
 * انتهى تُرفض عند السطح لا هنا، لأن «آخر مشهد» يعني معرّف رسالة في ديسكورد
 * ومعرّف مشهد في الوصلة، وهما لا يتقاطعان).
 */
export type InputHub = {
  chat(input: ChatInput): void
  press(press: Press): void
}

/** يبني المصرف المشترك لجلسة — كل الأسطح تدفع فيه و`fanout` يقرأ منه. */
export function hubFor(session: Session): InputHub {
  return {
    chat: (input) => feedChat(session, input),
    press: (press) => feedPress(session, press),
  }
}

/**
 * سطح عرض واحد: يرسل مشهدًا ونصًا وهمسًا، ويستقبل مدخلات لاعبيه.
 *
 * التنفيذان اليوم: `src/discord/table.ts` (قناة ديسكورد) و`src/api/table.ts`
 * (وصلة WebSocket واحدة = لاعب واحد).
 */
export type Surface = {
  /** للتشخيص والسجلّات فقط */
  readonly id: string

  /**
   * هل هذا السطح هو القناة الخاصة بهذا اللاعب؟ يحدّد وجهة `whisper`.
   * وصلة الجوال تملك صاحبها وحده؛ قناة ديسكورد لا تملك أحدًا.
   */
  owns(userId: string): boolean

  /**
   * سطح عام يستقبل همس من لا سطح خاص له.
   * قناة ديسكورد `true` (تهمس بالخاص)، ووصلة الجوال `false`.
   */
  readonly fallback: boolean

  /** `replace = true` يقابل `update`: استبدل آخر مشهد بدل إرسال جديد. */
  present(scene: Scene, opts: ShowOptions | undefined, replace: boolean): Promise<void>
  say(text: string, opts?: { buttons?: ButtonDef[] }): Promise<void>
  whisper(userId: string, text: string): Promise<boolean>

  /**
   * مشهد خاص بضاغط الزر، داخل هذا السطح نفسه.
   *
   * يعود `false` إن لم تكن الضغطة صادرة عنه أو مضى وقت التفاعل، فيجرّب
   * `fanout` غيره. ولا يمرّ على `owns` كما يمرّ الهمس: الضغطة تحمل سطحها معها.
   */
  reveal(press: Press, scene: Scene, opts: ShowOptions | undefined): Promise<boolean>

  /** يربط السطح بمصرف الجلسة. الاستدعاء المكرّر بنفس المصرف بلا أثر. */
  attach(hub: InputHub): void
  /** يفكّ الربط — لاعب انقطع أو انتهت اللعبة. */
  detach(): void

  /** خرج لاعب من اللعبة. أغلب الأسطح لا تحمل حالة لكل لاعب فلا تفعل شيئًا. */
  drop(userId: string): void

  /**
   * أحداث دورة الحياة. ديسكورد يتجاهلها لأن المشاهد نفسها تحكي القصة، أما
   * وصلة الجوال فتحتاج حدثًا صريحًا لتغلق شاشة اللعب وتفتح شاشة النتيجة.
   */
  lifecycle?(event: LifecycleEvent): void
}

export type LifecycleEvent =
  | { type: 'started'; players: PlayerView[] }
  | { type: 'ended'; winnerId: string | null; scores: Record<string, number> }
  | { type: 'cancelled'; reason: string }

/** يبلّغ كل الأسطح بحدث دورة حياة؛ فشل واحد لا يمنع الباقين. */
export function announce(surfaces: readonly Surface[], event: LifecycleEvent): void {
  for (const surface of surfaces) {
    try {
      surface.lifecycle?.(event)
    } catch (error) {
      console.error(`سطح ${surface.id} فشل في استقبال ${event.type}:`, error)
    }
  }
}

/**
 * `Table` مبنية فوق عدة أسطح، مع إمكان إضافة سطح أو نزعه **أثناء** اللعب:
 * لاعب جوال انضم لجلسة ديسكورد جارية، أو انقطع اتصاله ثم عاد.
 */
export type MultiTable = Table & {
  addSurface(surface: Surface): void
  removeSurface(surface: Surface): void
  surfaces(): readonly Surface[]
}

export type FanoutContext = {
  brief: GameBrief
  players: PlayerView[]
  host: PlayerView
  /** طاولة مفتوحة بلا لوبي — انظر `Table.open` */
  open?: boolean
  /**
   * قارئ مقابض هذه اللعبة في هذا السيرفر.
   *
   * اختياري لأن الاختبارات تبني طاولات بلا سيرفر، وغيابه يعني «لا مقبض مضبوط»
   * فتعمل كل لعبة بافتراضيّاتها المكتوبة في تعريفها.
   */
  tune?: (key: string) => number
  /** مصدر `aborted` ومجمّع المستمعين — واحد لكل لعبة جارية */
  session: Session
}

/** ينتظر أول قيمة تصل من مستمع، أو `null` عند انتهاء المهلة. */
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

/**
 * يبني `Table` واحدة تبثّ لكل الأسطح وتدمج مدخلاتها.
 *
 * `fanout(surfaces)` هو جوهر اللعب عبر السطحين: `show`/`update`/`say` تذهب
 * للجميع، والمدخلات من أي سطح تصبّ في مجمّع واحد فيفوز **أول مطابق** أيًّا كان
 * مصدره — إجابة من ديسكورد وإجابة من الجوال تتنافسان على نفس السطر.
 */
export function fanout(surfaces: Surface[], ctx: FanoutContext): MultiTable {
  const { session } = ctx
  const hub = hubFor(session)
  const live: Surface[] = []
  let players = [...ctx.players]

  function addSurface(surface: Surface): void {
    if (live.includes(surface)) return
    live.push(surface)
    surface.attach(hub)
  }

  function removeSurface(surface: Surface): void {
    const at = live.indexOf(surface)
    if (at < 0) return
    live.splice(at, 1)
    surface.detach()
  }

  for (const surface of surfaces) addSurface(surface)

  /**
   * يبثّ لكل الأسطح ولا يسمح لفشل واحد بإسقاط اللعبة.
   * لاعب أغلق تطبيقه ليس عطلًا في اللعبة — هو حدث متوقّع كل جولة.
   */
  async function broadcast(run: (surface: Surface) => Promise<unknown>): Promise<void> {
    const targets = [...live]
    await Promise.all(
      targets.map(async (surface) => {
        try {
          await run(surface)
        } catch (error) {
          console.error(`سطح ${surface.id} فشل في البث:`, error)
        }
      }),
    )
  }

  return {
    brief: ctx.brief,
    get players() {
      return players
    },
    host: ctx.host,
    surfaces: () => [...live],
    addSurface,
    removeSurface,

    show: (scene, opts) => broadcast((surface) => surface.present(scene, opts, false)),
    update: (scene, opts) => broadcast((surface) => surface.present(scene, opts, true)),
    say: (text, opts) => broadcast((surface) => surface.say(text, opts)),

    /**
     * الهمس لصاحبه وحده: السطح الذي يملك اللاعب.
     * من لا سطح خاص له (لاعب ديسكورد بلا تطبيق) يُهمس له عبر سطح `fallback`،
     * وهو ما يبقي توزيع أدوار مافيا يعمل كما كان بالضبط.
     */
    async whisper(userId, text) {
      const owners = live.filter((surface) => surface.owns(userId))
      const targets = owners.length > 0 ? owners : live.filter((surface) => surface.fallback)
      if (targets.length === 0) return false

      const results = await Promise.all(
        targets.map(async (surface) => {
          try {
            return await surface.whisper(userId, text)
          } catch {
            return false
          }
        }),
      )
      return results.some(Boolean)
    },

    async reveal(press, scene, opts) {
      // بلا تصفية بـ`owns`: أول سطح يعرف تفاعل هذه الضغطة يعرضه، والباقي يردّ
      // false. وأي سطح يعرض يكفي، فالمشهد لصاحب الضغطة لا لكل من يملكه.
      for (const surface of live) {
        try {
          if (await surface.reveal(press, scene, opts)) return true
        } catch {
          // سطح تعثّر لا يمنع غيره من العرض
        }
      }
      return false
    },

    open: ctx.open === true,

    // صفر يعني «لا مقبض مضبوط»، وهو خارج مدى كل مقبض حقيقي
    tune: ctx.tune ?? (() => 0),

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

    /** يجمع الضغطات خلال المدة، ضغطة واحدة لكل لاعب — آخر تصويت هو المعتمد. */
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

    get attempts() {
      return session.attempts
    },

    /** يخرج اللاعب من الجدول ومن كل الأسطح معًا. */
    drop(userId) {
      players = players.filter((player) => player.id !== userId)
      for (const surface of [...live]) surface.drop(userId)
    },

    get aborted() {
      return session.aborted
    },
  }
}

// ————————————————————— الانضمام —————————————————————

export type JoinDecision = { ok: true } | { ok: false; reason: string }

/**
 * نقطة الالتحاق بجلسة قائمة — هي **جسر ديسكورد**.
 *
 * يملؤها من يدير دورة حياة اللعبة (`src/discord/host.ts` للجلسات التي تبدأ في
 * قناة ديسكورد، و`src/api/rooms.ts` للغرف التي يبدأها الجوال وحده)، ويستهلكها
 * `src/api/ws.ts` حين يطلب لاعب جوال الانضمام. بهذا لا يعرف مضيف ديسكورد شيئًا
 * عن الوصلات، ولا تعرف الوصلات شيئًا عن ديسكورد.
 */
export type JoinPoint = {
  readonly origin: 'discord' | 'socket'
  phase(): 'lobby' | 'playing'
  roster(): PlayerView[]
  readonly limits: { min: number; max: number }
  /** يضم لاعبًا بسطحه. أثناء اللعب يُقبل السطح للعرض دون تغيير قائمة اللاعبين. */
  admit(player: PlayerView, surface: Surface): Promise<JoinDecision>
  /** خروج أو انقطاع — يجب ألا يعلّق الجولة أبدًا. */
  release(userId: string, surface: Surface): void
  /** القائد وحده يبدأ من اللوبي. */
  start(userId: string): boolean
  /** القائد وحده يلغي. */
  cancel(userId: string): boolean
}

/** مقابض اللوبي التي يملؤها المضيف — `makeJoinPoint` ينادِيها ولا يعرف كيف تُنفَّذ. */
export type LobbyControl = {
  /** أعد رسم اللوبي بعد تغيّر حقيقي في قائمة اللاعبين */
  refresh(): void
  start(userId: string): boolean
  cancel(userId: string): boolean
}

export type JoinPointOptions = {
  origin: 'discord' | 'socket'
  session: Session
  hostId: string
  limits: { min: number; max: number }
  /** خريطة اللاعبين المشتركة مع اللوبي — الترتيب هو ترتيب الانضمام */
  joined: Map<string, PlayerView>
  /** أسطح الوصلات المنضمة، مشتركة مع اللوبي ليبثّ لها */
  sockets: Set<Surface>
  phase(): 'lobby' | 'playing'
  table(): MultiTable | null
  /** كائن حيّ: المضيف يستبدل دواله حين يفتح اللوبي ويغلقه */
  control: LobbyControl
  /** خروج القائد من اللوبي يلغيه — صحيح لغرف الجوال، لا للوبي داخل قناة */
  hostLeaveCancels?: boolean
  /** مغادرة آخر سطح توقف اللعبة — غرفة بلا قناة لا يبقى فيها من يشاهد */
  emptyStops?: boolean
}

/**
 * تنفيذ واحد لقواعد الانضمام، يستعمله مضيف ديسكورد ومضيف الغرف معًا.
 *
 * وجودهما بنسختين كان يعني أن قاعدة مثل «لاعب انقطع يُسقط» تُصلَح في مكان
 * وتُنسى في الآخر، فيختلف سلوك اللعبة بحسب من بدأها. هي هنا مرة واحدة.
 */
export function makeJoinPoint(opts: JoinPointOptions): JoinPoint {
  const { session, joined, sockets, control } = opts

  return {
    origin: opts.origin,
    limits: opts.limits,
    phase: opts.phase,
    roster: () => [...joined.values()],

    admit(player, surface): Promise<JoinDecision> {
      if (session.aborted) return Promise.resolve({ ok: false, reason: 'اللعبة أُوقفت' })

      if (opts.phase() === 'playing') {
        // انضمام متأخر: يرى المشاهد فورًا، ويشارك فعليًا إن كان أصلًا من اللاعبين
        surface.attach(hubFor(session))
        sockets.add(surface)
        opts.table()?.addSurface(surface)
        return Promise.resolve({ ok: true })
      }

      if (!joined.has(player.id) && joined.size >= opts.limits.max) {
        return Promise.resolve({ ok: false, reason: 'اكتمل عدد اللاعبين' })
      }
      surface.attach(hubFor(session))
      joined.set(player.id, player)
      sockets.add(surface)
      control.refresh()
      return Promise.resolve({ ok: true })
    },

    release(userId, surface) {
      sockets.delete(surface)
      surface.detach()

      if (opts.phase() === 'lobby') {
        // القائد لا ينسحب من لوبيه — إلغاؤه هو الخروج الصحيح
        if (userId === opts.hostId) {
          if (opts.hostLeaveCancels) control.cancel(userId)
          return
        }
        if (joined.delete(userId)) control.refresh()
        return
      }

      const table = opts.table()
      table?.removeSurface(surface)
      // ما عاد للاعب طريق يجيب منه؛ إبقاؤه يجعل الجميع ينتظر مهلة كاملة كل جولة
      const reachable = table?.surfaces().some((other) => other.owns(userId)) ?? false
      if (!reachable) table?.drop(userId)
      if (opts.emptyStops && sockets.size === 0) session.abort()
    },

    start: (userId) => control.start(userId),
    cancel: (userId) => control.cancel(userId),
  }
}
