import type { ChatInput, GameDef, Press } from './define.ts'

/**
 * سجلّ الألعاب النشطة، مفتاحه القناة: لعبة واحدة لكل قناة في وقت واحد.
 *
 * الحالة في الذاكرة لا في قاعدة البيانات، وهذا صحيح حتى مع الـ sharding لأن
 * ديسكورد يضمن ثبات السيرفر على نفس الشارد (`guild_id >> 22 % shards`)،
 * فرسائل القناة تصل دائمًا للعملية التي تحمل لعبتها. لا حاجة لـ Redis.
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
  /** معرّف آخر رسالة تحمل أزرارًا — الضغطات على غيرها تُتجاهل */
  liveMessageId: string | null
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
 * يوصل رسالة شات للعبة القناة.
 * نقي تمامًا: يستقبل نصًا ومعرّفًا، لا كائن ديسكورد — وهذا ما يبقي هذا الملف
 * صالحًا لتطبيق الجوال لاحقًا.
 */
export function deliverChat(channelId: string, input: ChatInput): void {
  const session = sessions.get(channelId)
  if (!session || session.aborted) return
  for (const listener of session.chatListeners) {
    if (!listener.test || listener.test(input)) {
      listener.deliver(input)
      return // أول مستمع مطابق يأخذها — «أول إجابة صحيحة تفوز»
    }
  }
}

export function deliverPress(channelId: string, messageId: string, press: Press): boolean {
  const session = sessions.get(channelId)
  if (!session || session.aborted) return false
  // ضغطة على مشهد قديم تُتجاهل، وإلا صوّت اللاعب في جولة انتهت
  if (session.liveMessageId && session.liveMessageId !== messageId) return false
  for (const listener of session.pressListeners) {
    if (!listener.test || listener.test(press)) {
      listener.deliver(press)
      return true
    }
  }
  return false
}
