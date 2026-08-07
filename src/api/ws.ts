import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { activeIn } from '../games/running.ts'
import type { PlayerView } from '../scenes/scene.ts'
import { assertMember } from './access.ts'
import { avatarUrl, memberProfile } from './discord.ts'
import { config } from './env.ts'
import { HttpError } from './http.ts'
import { verifyToken } from './jwt.ts'
import {
  cancelRoom,
  createRoom,
  gameByKey,
  joinRoom,
  leaveRoom,
  listRooms,
  startRoom,
} from './rooms.ts'
import { makeSocketSurface, type Outgoing, type SocketSurface } from './table.ts'

/**
 * سطح اللعب للتطبيق.
 *
 * الوصلة **سطح لاعب واحد**، لا لعبة كاملة. تنضم لغرفة — لوبي بدأه جوال آخر،
 * أو لعبة قائمة في قناة ديسكورد — فتصبّ مدخلاتها في نفس مجمّع الجلسة الذي تصبّ
 * فيه رسائل القناة. لذلك زال قيد «الكتابة فقط»: كل الأنماط تعمل هنا لأن
 * الطاولة نفسها هي التي تعمل هناك.
 *
 * قاعدة أمنية: الهوية تُتحقّق عند الترقية **وفي كل رسالة**. وصلة عمرها ساعة
 * وصاحبها طُرد من السيرفر بعد دقيقة لا يجوز أن تبقى تلعب فيه.
 */

const HEARTBEAT_MS = 30_000
const MAX_PAYLOAD = 16 * 1024
const MAX_TEXT = 500
const MAX_ID = 100

type Incoming =
  /** قائمة الغرف التي يمكن الانضمام إليها في سيرفر */
  | { type: 'rooms'; guildId: string }
  /** غرفة جديدة يبدأها الجوال بلا قناة ديسكورد */
  | { type: 'create'; guildId: string; gameId: string }
  /** انضمام لغرفة قائمة — بما فيها لعبة جارية في قناة ديسكورد */
  | { type: 'join'; guildId: string; roomId: string }
  | { type: 'start' }
  | { type: 'cancel' }
  | { type: 'answer'; text: string }
  | { type: 'press'; id: string; sceneId: string | null }
  | { type: 'leave' }
  | { type: 'ping' }

function text(value: unknown, max: number): string | null {
  return typeof value === 'string' && value.length > 0 ? value.slice(0, max) : null
}

function parse(raw: string): Incoming | null {
  let body: unknown
  try {
    body = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof body !== 'object' || body === null) return null
  const row = body as Record<string, unknown>

  switch (row['type']) {
    case 'rooms': {
      const guildId = text(row['guildId'], 25)
      return guildId ? { type: 'rooms', guildId } : null
    }
    case 'create': {
      const guildId = text(row['guildId'], 25)
      const gameId = text(row['gameId'], 40)
      return guildId && gameId ? { type: 'create', guildId, gameId } : null
    }
    case 'join': {
      const guildId = text(row['guildId'], 25)
      if (!guildId) return null
      const roomId = text(row['roomId'], 80)
      if (roomId) return { type: 'join', guildId, roomId }
      // توافق مع العملاء القدامى: `join` بلعبة ولا غرفة = أنشئ غرفة
      const gameId = text(row['gameId'], 40)
      return gameId ? { type: 'create', guildId, gameId } : null
    }
    case 'start':
      return { type: 'start' }
    case 'cancel':
      return { type: 'cancel' }
    case 'answer': {
      const value = row['text']
      if (typeof value !== 'string') return null
      return { type: 'answer', text: value.slice(0, MAX_TEXT) }
    }
    case 'press': {
      const id = text(row['id'], MAX_ID)
      if (!id) return null
      return { type: 'press', id, sceneId: text(row['sceneId'], 40) }
    }
    case 'leave':
      return { type: 'leave' }
    case 'ping':
      return { type: 'ping' }
    default:
      return null
  }
}

export function attachWs(server: Server): WebSocketServer {
  const wss = new WebSocketServer({ noServer: true, maxPayload: MAX_PAYLOAD })

  server.on('upgrade', (req, socket, head) => {
    const host = req.headers.host ?? 'localhost'
    let url: URL
    try {
      url = new URL(req.url ?? '/', `http://${host}`)
    } catch {
      socket.destroy()
      return
    }

    if (url.pathname !== '/ws') {
      socket.destroy()
      return
    }

    // المصادقة قبل الترقية: وصلة مفتوحة بلا هوية هي مورد يُستهلك بلا صاحب
    const token = url.searchParams.get('token') ?? ''
    const claims =
      token.length > 0 && token.length < 4096 ? verifyToken(token, config.jwt.secret) : null
    if (!claims) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      serve(ws, claims.sub, token)
    })
  })

  const beat = setInterval(() => {
    for (const client of wss.clients) {
      if (client.readyState === client.OPEN) client.ping()
    }
  }, HEARTBEAT_MS)
  beat.unref()

  return wss
}

function serve(ws: WebSocket, userId: string, token: string): void {
  let surface: SocketSurface | null = null
  let roomId: string | null = null
  let guildId: string | null = null

  const send: (message: Outgoing) => boolean = (message) => {
    // نهاية اللعبة تحرّر الوصلة: الغرفة أُغلقت من جهة المضيف، فلا تبقى مربوطة بها
    if (message.type === 'ended' || message.type === 'cancelled') roomId = null
    if (ws.readyState !== ws.OPEN) return false
    ws.send(JSON.stringify(message))
    return true
  }

  /**
   * الهوية والعضوية تُفحصان في **كل** رسالة.
   * الرمز قد ينتهي والوصلة مفتوحة، والعضوية قد تُسحب بعد الاتصال بدقائق.
   */
  async function guard(forGuild: string | null): Promise<boolean> {
    if (!verifyToken(token, config.jwt.secret)) {
      send({ type: 'error', message: 'انتهت جلستك — أعد تسجيل الدخول' })
      ws.close(4001, 'token expired')
      return false
    }
    if (!forGuild) return true
    try {
      await assertMember(userId, forGuild)
      return true
    } catch (error) {
      send({
        type: 'error',
        message: error instanceof HttpError ? error.message : 'تعذّر التحقق من عضويتك',
      })
      return false
    }
  }

  /** صورة اللاعب تُجلب مرة ثم تُعاد استعمالها في كل غرفة يدخلها. */
  let cachedPlayer: PlayerView | null = null

  function mine(): SocketSurface {
    surface ??= makeSocketSurface({
      player: cachedPlayer ?? { id: userId, name: userId, avatar: null },
      send,
      context: () => ({
        gameId: (roomId && activeIn(roomId)?.game.key) || '',
        guildId: guildId ?? '',
      }),
    })
    return surface
  }

  async function player(inGuild: string): Promise<PlayerView> {
    if (cachedPlayer) return cachedPlayer
    const profile = await memberProfile(inGuild, userId)
    cachedPlayer = {
      id: userId,
      name: profile?.displayName ?? userId,
      // رابط CDN لا data: URI — التطبيق يحمّل الصور بنفسه ولا يرسم HTML
      avatar: avatarUrl(userId, profile?.avatarHash ?? null),
    }
    return cachedPlayer
  }

  function detachFromRoom(): void {
    if (roomId && surface) leaveRoom(roomId, userId, surface)
    roomId = null
  }

  ws.on('message', (data) => {
    const message = parse(data.toString().slice(0, MAX_PAYLOAD))
    if (!message) {
      send({ type: 'error', message: 'رسالة غير مفهومة' })
      return
    }
    void handle(message).catch((error: unknown) => {
      console.error('فشلت معالجة رسالة الوصلة:', error)
      send({ type: 'error', message: 'تعذّر تنفيذ الطلب' })
    })
  })

  ws.on('close', () => {
    // اللاعب أغلق التطبيق — يُسقَط من الغرفة ولا تنتظره الجولة حتى المهلة
    detachFromRoom()
    surface?.detach()
  })

  ws.on('error', () => {
    detachFromRoom()
    surface?.detach()
  })

  async function handle(message: Incoming): Promise<void> {
    switch (message.type) {
      case 'ping':
        send({ type: 'pong' })
        return

      case 'rooms': {
        if (!(await guard(message.guildId))) return
        send({ type: 'rooms', guildId: message.guildId, rooms: listRooms(message.guildId) })
        return
      }

      case 'create': {
        if (!(await guard(message.guildId))) return
        if (roomId) {
          send({ type: 'error', message: 'أنت في غرفة — اخرج منها أولًا.' })
          return
        }
        const game = await gameByKey(message.gameId)
        if (!game) {
          send({ type: 'error', message: 'لعبة غير معروفة' })
          return
        }
        guildId = message.guildId
        const me = await player(message.guildId)
        const outcome = createRoom({
          game,
          guildId: message.guildId,
          host: me,
          surface: mine(),
        })
        if (!outcome.ok) {
          send({ type: 'error', message: outcome.reason })
          return
        }
        roomId = outcome.room.id
        send({ type: 'joined', room: outcome.room })
        return
      }

      case 'join': {
        if (!(await guard(message.guildId))) return
        if (roomId) {
          send({ type: 'error', message: 'أنت في غرفة — اخرج منها أولًا.' })
          return
        }
        guildId = message.guildId
        const me = await player(message.guildId)
        const outcome = await joinRoom({
          roomId: message.roomId,
          guildId: message.guildId,
          player: me,
          surface: mine(),
        })
        if (!outcome.ok) {
          send({ type: 'error', message: outcome.reason })
          return
        }
        roomId = outcome.room.id
        send({ type: 'joined', room: outcome.room })
        return
      }

      case 'start': {
        const room = roomId
        if (!room) {
          send({ type: 'error', message: 'لست في غرفة' })
          return
        }
        if (!(await guard(activeIn(room)?.guildId ?? guildId))) return
        if (!startRoom(room, userId)) {
          send({ type: 'error', message: 'ما تقدر تبدأ — إما لست القائد أو ما اكتمل العدد.' })
        }
        return
      }

      case 'cancel': {
        const room = roomId
        if (!room) return
        if (!(await guard(activeIn(room)?.guildId ?? guildId))) return
        if (!cancelRoom(room, userId)) {
          send({ type: 'error', message: 'الإلغاء للقائد وحده.' })
        }
        return
      }

      case 'answer': {
        const room = roomId
        if (!room || !surface) return
        if (!(await guard(activeIn(room)?.guildId ?? guildId))) return
        surface.receiveChat(message.text)
        return
      }

      case 'press': {
        const room = roomId
        if (!room || !surface) return
        if (!(await guard(activeIn(room)?.guildId ?? guildId))) return
        surface.receivePress(message.id, message.sceneId)
        return
      }

      case 'leave': {
        const room = roomId
        detachFromRoom()
        if (room) send({ type: 'left', roomId: room })
        return
      }
    }
  }
}
