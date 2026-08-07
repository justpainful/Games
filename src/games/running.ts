import type { ChatInput, GameDef, Press } from './define.ts'
import type { JoinPoint } from './surface.ts'

/**
 * سجلّ الألعاب النشطة، مفتاحه القناة: لعبة واحدة لكل قناة في وقت واحد.
 *
 * الحالة في الذاكرة لا في قاعدة البيانات، وهذا صحيح حتى مع الـ sharding لأن
 * ديسكورد يضمن ثبات السيرفر على نفس الشارد (`guild_id >> 22 % shards`)،
 * فرسائل القناة تصل دائمًا للعملية التي تحمل لعبتها. لا حاجة لـ Redis.
 *
 * الغرف التي يبدأها الجوال وحده تسكن نفس السجلّ بمعرّف مولّد بادئته `room:`،
 * فلا يوجد سجلّان لحالتين من نفس الشيء.
 */

export type Listener<T> = { test?: (value: T) => boolean; deliver: (value: T) => void }

export type Session = {
  game: GameDef
  guildId: string
  channelId: string
  hostId: string
  startedAt: number
  abort(): void
  aborted: boolean
  chatListeners: Set<Listener<ChatInput>>
  pressListeners: Set<Listener<Press>>
  /** معرّف آخر رسالة تحمل أزرارًا في **ديسكورد** — الضغطات على غيرها تُتجاهل */
  liveMessageId: string | null
  /**
   * كيف ينضم سطح جديد لهذه الجلسة، إن كانت تقبل الانضمام.
   * يملؤها مضيف اللعبة؛ `null` يعني جلسة مغلقة لا تُرى في قائمة الغرف.
   */
  join: JoinPoint | null
}

const sessions = new Map<string, Session>()

export function activeIn(channelId: string): Session | undefined {
  return sessions.get(channelId)
}

export function open(session: Session): void {
  sessions.set(session.channelId, session)
}

export function close(channelId: string): void {
  sessions.delete(channelId)
}

/** كل الجلسات الجارية — تبني عليها `src/api/rooms.ts` قائمة الغرف. */
export function allSessions(): Session[] {
  return [...sessions.values()]
}

/** يوقف كل الألعاب — يُستدعى عند الإطفاء الآمن حتى لا يبقى لاعبون ينتظرون. */
export function abortAll(): Session[] {
  const all = [...sessions.values()]
  for (const s of all) s.abort()
  sessions.clear()
  return all
}

export function countRunning(): number {
  return sessions.size
}

/**
 * يصبّ رسالة شات في مجمّع الجلسة.
 *
 * هذا هو **نقطة الدمج** بين الأسطح: ديسكورد يصل إليها عبر `deliverChat` أدناه،
 * ووصلات الجوال تصل إليها عبر `hubFor(session)` في `surface.ts`. المجمّع واحد،
 * فأول مطابق يفوز أيًّا كان السطح الذي جاء منه.
 */
export function feedChat(session: Session, input: ChatInput): void {
  if (session.aborted) return
  for (const listener of [...session.chatListeners]) {
    if (!listener.test || listener.test(input)) {
      listener.deliver(input)
      return // أول مستمع مطابق يأخذها — «أول إجابة صحيحة تفوز»
    }
  }
}

export function feedPress(session: Session, press: Press): boolean {
  if (session.aborted) return false
  for (const listener of [...session.pressListeners]) {
    if (!listener.test || listener.test(press)) {
      listener.deliver(press)
      return true
    }
  }
  return false
}

/**
 * يوصل رسالة شات للعبة القناة.
 * نقي تمامًا: يستقبل نصًا ومعرّفًا، لا كائن ديسكورد.
 */
export function deliverChat(channelId: string, input: ChatInput): void {
  const session = sessions.get(channelId)
  if (!session) return
  feedChat(session, input)
}

export function deliverPress(channelId: string, messageId: string, press: Press): boolean {
  const session = sessions.get(channelId)
  if (!session) return false
  // ضغطة على مشهد قديم تُتجاهل، وإلا صوّت اللاعب في جولة انتهت
  if (session.liveMessageId && session.liveMessageId !== messageId) return false
  return feedPress(session, press)
}
