import type { Server } from 'node:http'
import { WebSocketServer, type WebSocket } from 'ws'
import { prisma } from '../db/prisma.ts'
import type { GameDef } from '../games/define.ts'
import { close, deliverChat, deliverPress, open, type Session } from '../games/running.ts'
import { awardMany, recordPlayed } from '../players/points.ts'
import type { PlayerView } from '../scenes/scene.ts'
import { assertMember } from './access.ts'
import { avatarUrl, memberProfile } from './discord.ts'
import { config } from './env.ts'
import { HttpError } from './http.ts'
import { verifyToken } from './jwt.ts'
import { games } from './routes.ts'
import { isSoloable } from './solo.ts'
import { makeWsTable, type Outgoing } from './table.ts'

/**
 * سطح اللعب للتطبيق.
 *
 * وصلة واحدة = لاعب واحد = لعبة واحدة في وقت واحد. اللوبي الجماعي عبر التطبيق
 * غير منفّذ بعد (انظر التقرير)، فما يُقبل هنا هو ما يمكن لعبه منفردًا —
 * وهو بالضبط ما يعرضه `Catalog.soloGames` في التطبيق.
 */

const HEARTBEAT_MS = 30_000
const MAX_PAYLOAD = 16 * 1024
const MAX_TEXT = 500

type Incoming =
  | { type: 'join'; gameId: string; guildId: string }
  | { type: 'answer'; text: string }
  | { type: 'press'; id: string }
  | { type: 'leave' }
  | { type: 'ping' }

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
    case 'join': {
      const gameId = row['gameId']
      const guildId = row['guildId']
      if (typeof gameId !== 'string' || typeof guildId !== 'string') return null
      return { type: 'join', gameId: gameId.slice(0, 40), guildId: guildId.slice(0, 25) }
    }
    case 'answer': {
      const text = row['text']
      if (typeof text !== 'string') return null
      return { type: 'answer', text: text.slice(0, MAX_TEXT) }
    }
    case 'press': {
      const id = row['id']
      if (typeof id !== 'string') return null
      return { type: 'press', id: id.slice(0, 100) }
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
    const claims = token.length > 0 && token.length < 4096 ? verifyToken(token, config.jwt.secret) : null
    if (!claims) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n')
      socket.destroy()
      return
    }

    wss.handleUpgrade(req, socket, head, (ws) => {
      serve(ws, claims.sub)
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

function serve(ws: WebSocket, userId: string): void {
  /** اللعبة الجارية على هذه الوصلة، إن وُجدت. */
  let live: { session: Session; channelId: string } | null = null

  const send: (message: Outgoing) => boolean = (message) => {
    if (ws.readyState !== ws.OPEN) return false
    ws.send(JSON.stringify(message))
    return true
  }

  ws.on('message', (data) => {
    const message = parse(data.toString().slice(0, MAX_PAYLOAD))
    if (!message) {
      send({ type: 'error', message: 'رسالة غير مفهومة' })
      return
    }

    switch (message.type) {
      case 'ping':
        send({ type: 'pong' })
        return
      case 'answer':
        if (live) deliverChat(live.channelId, { userId, text: message.text })
        return
      case 'press':
        if (live) {
          deliverPress(live.channelId, live.session.liveMessageId ?? '', { userId, id: message.id })
        }
        return
      case 'leave':
        live?.session.abort()
        return
      case 'join':
        if (live) {
          send({ type: 'error', message: 'عندك لعبة شغّالة — أنهها أو اخرج منها أولًا.' })
          return
        }
        void start(message.gameId, message.guildId)
        return
    }
  })

  ws.on('close', () => {
    // اللاعب أغلق التطبيق — الحلقة تفحص `aborted` في كل جولة فتخرج بنفسها
    if (live) {
      live.session.abort()
      close(live.channelId)
      live = null
    }
  })

  ws.on('error', () => {
    live?.session.abort()
  })

  async function start(gameId: string, guildId: string): Promise<void> {
    let def: GameDef | undefined
    let player: PlayerView

    try {
      await assertMember(userId, guildId)
      def = (await games()).find((game) => game.key === gameId)
      if (!def) {
        send({ type: 'error', message: 'لعبة غير معروفة' })
        return
      }
      if (!isSoloable(def.key)) {
        send({
          type: 'error',
          message: `«${def.name}» تحتاج لاعبين — اللعب الجماعي من التطبيق غير مدعوم بعد.`,
        })
        return
      }
      const profile = await memberProfile(guildId, userId)
      player = {
        id: userId,
        name: profile?.displayName ?? userId,
        // رابط CDN لا data: URI — التطبيق يحمّل الصور بنفسه ولا يرسم HTML
        avatar: avatarUrl(userId, profile?.avatarHash ?? null),
      }
    } catch (error) {
      send({
        type: 'error',
        message: error instanceof HttpError ? error.message : 'تعذّر بدء اللعبة',
      })
      return
    }

    const channelId = `ws:${userId}:${Date.now()}`
    let aborted = false
    const session: Session = {
      game: def,
      guildId,
      channelId,
      hostId: userId,
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
    }

    open(session)
    live = { session, channelId }

    const brief = { key: def.key, name: def.name, tagline: def.tagline, howTo: def.howTo }
    const table = makeWsTable({ brief, players: [player], host: player, session, send })

    send({ type: 'started', gameId: def.key, guildId, players: [player] })

    const match = await prisma.matchRecord
      .create({ data: { guildId, gameKey: def.key, players: 1 } })
      .catch(() => null)

    try {
      const result = await def.play(table)

      // نفس محاسبة `src/discord/host.ts` — لا يجوز أن يختلف رصيد اللاعب بحسب السطح
      if (result.scores) await awardMany(guildId, def.wallet, result.scores)
      await recordPlayed(guildId, [userId], result.winnerId)
      if (match) {
        await prisma.matchRecord
          .update({
            where: { id: match.id },
            data: { endedAt: new Date(), winnerId: result.winnerId ?? null },
          })
          .catch(() => {})
      }

      send({
        type: 'ended',
        result: {
          winnerId: result.winnerId ?? null,
          scores: Object.fromEntries(result.scores ?? new Map<string, number>()),
        },
      })
    } catch (error) {
      console.error(`اللعبة ${def.key} تعطّلت على الوصلة:`, error)
      send({ type: 'error', message: 'صار خطأ وأُلغيت اللعبة. جرّب مرة ثانية.' })
    } finally {
      close(channelId)
      live = null
    }
  }
}
