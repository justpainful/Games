/**
 * لعبة جماعية كاملة عبر WebSocket، بعميلين وهميين، بلا ديسكورد وبلا قاعدة بيانات.
 *
 *   npx tsx scripts/ws-play.ts            # xo ثم tasweet
 *   npx tsx scripts/ws-play.ts xo
 *
 * ما يثبته وحده لا يثبته `tsc` ولا `dryrun`:
 *   1. وصلتان منفصلتان تلعبان **لعبة واحدة** — لوبي، ثم أدوار، ثم نتيجة.
 *   2. المشهد يصل للاثنين، وضغطة كل لاعب تُحتسب في دوره هو.
 *   3. الغرفة تُدرج في `rooms` فيجدها الثاني وينضم إليها بمعرّفها.
 *
 * الخادم هنا هو الخادم الحقيقي: نفس `attachWs`، نفس `rooms.ts`، نفس المصادقة.
 * ما زُوّر شيئان فقط، وكلاهما كاش يُزرع من داخل العملية لا باب خلفي:
 * قائمة سيرفرات المستخدم (بدلًا من نداء ديسكورد) وبطاقة العضو (الاسم).
 * قاعدة البيانات غير مطلوبة: `settleMatch` تسجّل فشلها وتكمل.
 */
import { randomBytes } from 'node:crypto'
import type { AddressInfo } from 'node:net'
import { WebSocket } from 'ws'
// أنواع فقط — `import type` يُمحى بالكامل فلا يحمّل `env.ts` قبل ضبط البيئة
import type { Outgoing } from '../src/api/table.ts'
import type { Scene } from '../src/scenes/scene.ts'

// ما يطلبه `env.ts` يُضبط قبل استيراده؛ `dotenv` لا يدهس ما هو مضبوط أصلًا،
// فمن عنده `.env` حقيقي يعمل به. **لا قيمة ثابتة مكتوبة هنا**: المفتاح يُولَّد
// لكل تشغيل ويموت مع العملية، فلا سرّ في ملف يُلتزم به.
process.env['API_JWT_SECRET'] ??= randomBytes(48).toString('base64url')
process.env['DISCORD_CLIENT_ID'] ??= '000000000000000000'
process.env['DISCORD_CLIENT_SECRET'] ??= randomBytes(24).toString('base64url')
process.env['API_PUBLIC_URL'] ??= 'http://127.0.0.1:0'

const { rememberGuilds } = await import('../src/api/access.ts')
const { rememberProfile } = await import('../src/api/discord.ts')
const { config } = await import('../src/api/env.ts')
const { signToken } = await import('../src/api/jwt.ts')
const { startApiServer } = await import('../src/api/server.ts')

const GUILD = '123456789012345678'

const PEOPLE = [
  { id: '100000000000000001', name: 'عبدالرحمن' },
  { id: '100000000000000002', name: 'نواف' },
] as const

/** مهلة قصوى للسيناريو كله — سكربت يعلّق أسوأ من سكربت يفشل. */
const WALL_MS = 240_000

// ————————————————————— عميل وهمي —————————————————————

type Waiter = { test: (message: Outgoing) => boolean; resolve: (message: Outgoing) => void }

class Player {
  readonly id: string
  readonly name: string
  private readonly socket: WebSocket
  private readonly waiters: Waiter[] = []
  private readonly seen: Outgoing[] = []
  /** آخر مشهد وصل — الضغطات تُقاس عليه كما يفعل التطبيق */
  lastSceneId: string | null = null

  private constructor(id: string, name: string, socket: WebSocket) {
    this.id = id
    this.name = name
    this.socket = socket

    socket.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Outgoing
      if (message.type === 'scene') this.lastSceneId = message.sceneId
      this.seen.push(message)
      log(this, message)

      const at = this.waiters.findIndex((waiter) => waiter.test(message))
      if (at >= 0) this.waiters.splice(at, 1)[0]?.resolve(message)
    })
  }

  static connect(port: number, person: { id: string; name: string }): Promise<Player> {
    const token = signToken(person.id, config.jwt.secret, 600)
    const socket = new WebSocket(`ws://127.0.0.1:${port}/ws?token=${encodeURIComponent(token)}`)
    return new Promise((resolve, reject) => {
      socket.once('open', () => resolve(new Player(person.id, person.name, socket)))
      socket.once('error', reject)
    })
  }

  send(message: Record<string, unknown>): void {
    this.socket.send(JSON.stringify(message))
  }

  /** ينتظر أول رسالة تحقّق الشرط — بما فيها ما وصل قبل النداء. */
  await(test: (message: Outgoing) => boolean, label: string, ms = 60_000): Promise<Outgoing> {
    const already = this.seen.find(test)
    if (already) return Promise.resolve(already)

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        const at = this.waiters.findIndex((waiter) => waiter.resolve === wrapped)
        if (at >= 0) this.waiters.splice(at, 1)
        reject(new Error(`${this.name}: ما وصل ${label} خلال ${ms / 1000}s`))
      }, ms)
      const wrapped = (message: Outgoing): void => {
        clearTimeout(timer)
        resolve(message)
      }
      this.waiters.push({ test, resolve: wrapped })
    })
  }

  forget(): void {
    this.seen.length = 0
  }

  close(): void {
    this.socket.close()
  }
}

// ————————————————————— طباعة المشاهد —————————————————————

function summarize(scene: Scene): string {
  switch (scene.kind) {
    case 'lobby':
      return `لوبي ${scene.game.name} — ${scene.players.length}/${scene.max}: ${scene.players
        .map((player) => player.name)
        .join('، ')}`
    case 'board': {
      const grid = []
      for (let row = 0; row < scene.cells.length / scene.cols; row++) {
        grid.push(
          scene.cells
            .slice(row * scene.cols, row * scene.cols + scene.cols)
            .map((cell) => cell ?? '·')
            .join(' '),
        )
      }
      const turn = scene.turnOf ? ` | دور ${scene.turnOf.name}` : ''
      return `لوحة [${grid.join(' / ')}]${turn}${scene.note ? ` | ${scene.note}` : ''}`
    }
    case 'poll':
      return `تصويت «${scene.question}» — ${scene.options
        .map((option) => `${option.label}:${option.votes}`)
        .join('، ')}${scene.note ? ` | ${scene.note}` : ''}`
    case 'round':
      return `جولة ${scene.index}/${scene.total} — ${scene.prompt}`
    case 'standings':
      return `ترتيب — ${scene.rows.map((row) => `${row.player.name}:${row.score}`).join('، ')}`
    case 'notice':
      return `إعلان [${scene.tone}] ${scene.title}${scene.body ? ` — ${scene.body}` : ''}`
    default:
      return scene.kind
  }
}

function log(player: Player, message: Outgoing): void {
  const who = `[${player.name}]`.padEnd(12)
  switch (message.type) {
    case 'scene':
      console.log(`${who} مشهد#${message.sceneId} ${summarize(message.scene)}`)
      if (message.buttons?.length) {
        const labels = message.buttons
          .filter((button) => !button.disabled)
          .map((button) => button.label)
        console.log(`${' '.repeat(12)}   أزرار: ${labels.join(' | ')}`)
      }
      return
    case 'rooms':
      console.log(
        `${who} غرف: ${message.rooms
          .map((room) => `${room.gameName}/${room.phase}/${room.players.length} لاعب`)
          .join('، ') || '(لا شيء)'}`,
      )
      return
    case 'joined':
      console.log(`${who} انضم للغرفة ${message.room.id} (${message.room.gameName})`)
      return
    case 'started':
      console.log(`${who} بدأت ${message.gameId} بـ ${message.players.length} لاعبين`)
      return
    case 'ended':
      console.log(
        `${who} انتهت — الفائز ${message.result.winnerId ?? 'لا أحد'} | النقاط ${JSON.stringify(
          message.result.scores,
        )}`,
      )
      return
    case 'say':
      console.log(`${who} نص: ${message.text.replace(/\n/g, ' ⏎ ')}`)
      return
    case 'whisper':
      console.log(`${who} همس: ${message.text}`)
      return
    default:
      console.log(`${who} ${message.type}${'message' in message ? `: ${message.message}` : ''}`)
  }
}

const isScene = (test: (scene: Scene) => boolean) => (message: Outgoing) =>
  message.type === 'scene' && test(message.scene)

// ————————————————————— السيناريوهات —————————————————————

/** لوبي مشترك: الأول ينشئ الغرفة، والثاني يجدها في القائمة وينضم، ثم تبدأ. */
async function openRoom(host: Player, guest: Player, gameId: string): Promise<void> {
  console.log(`\n——— ${gameId}: اللوبي ———`)
  host.send({ type: 'create', guildId: GUILD, gameId })
  const joined = await host.await((m) => m.type === 'joined', 'تأكيد إنشاء الغرفة')
  if (joined.type !== 'joined') throw new Error('رد غير متوقّع')
  const roomId = joined.room.id

  // الثاني لا يعرف المعرّف — يسأل عن الغرف كما يفعل التطبيق
  guest.send({ type: 'rooms', guildId: GUILD })
  const listed = await guest.await((m) => m.type === 'rooms', 'قائمة الغرف')
  if (listed.type !== 'rooms' || !listed.rooms.some((room) => room.id === roomId)) {
    throw new Error('الغرفة ما ظهرت في القائمة')
  }

  guest.send({ type: 'join', guildId: GUILD, roomId })
  await guest.await((m) => m.type === 'joined', 'تأكيد الانضمام')
  await host.await(
    isScene((scene) => scene.kind === 'lobby' && scene.players.length === 2),
    'لوبي بلاعبين',
  )

  console.log(`——— ${gameId}: البدء ———`)
  host.send({ type: 'start' })
  await Promise.all([
    host.await((m) => m.type === 'started', 'إشعار البدء'),
    guest.await((m) => m.type === 'started', 'إشعار البدء'),
  ])
}

/** إكس أو: كل لاعب يضغط أول خانة فارغة حين يأتي دوره، حتى تنتهي اللعبة. */
async function playXo(host: Player, guest: Player): Promise<void> {
  await openRoom(host, guest, 'xo')

  const endings = await Promise.all(
    [host, guest].map(async (player) => {
      for (;;) {
        const message = await player.await(
          (m) =>
            m.type === 'ended' ||
            m.type === 'cancelled' ||
            (m.type === 'scene' &&
              m.scene.kind === 'board' &&
              (m.text ?? '').includes(`<@${player.id}>`) &&
              (m.buttons?.length ?? 0) > 0),
          'دوري أو نهاية اللعبة',
        )
        if (message.type !== 'scene') return message

        // ما مضى صار تاريخًا؛ الانتظار التالي يخصّ الدور القادم وحده
        player.forget()
        const free = message.buttons?.find((button) => !button.disabled)
        if (!free) throw new Error(`${player.name}: دوري بلا خانة فارغة`)
        console.log(`[${player.name}] يضغط ${free.label}`)
        player.send({ type: 'press', id: free.id, sceneId: message.sceneId })
      }
    }),
  )

  for (const ending of endings) {
    if (ending.type !== 'ended') throw new Error(`اللعبة ما انتهت بنتيجة: ${ending.type}`)
  }
}

/** تصويت: القائد يكتب السؤال والخيارات في الشات، ثم يصوّت الاثنان بالأزرار. */
async function playTasweet(host: Player, guest: Player): Promise<void> {
  await openRoom(host, guest, 'tasweet')

  await host.await(
    isScene((scene) => scene.kind === 'poll'),
    'طلب السؤال',
  )
  host.send({ type: 'answer', text: 'أي لعبة نلعب بعدين؟' })

  await host.await((m) => m.type === 'say' && m.text.includes('الخيارات'), 'طلب الخيارات')
  host.send({ type: 'answer', text: 'إكس أو\nمافيا' })

  const open = await guest.await(
    (m) => m.type === 'scene' && m.scene.kind === 'poll' && (m.buttons?.length ?? 0) > 0,
    'فتح التصويت',
  )
  if (open.type !== 'scene') throw new Error('رد غير متوقّع')

  for (const player of [host, guest]) {
    const first = open.buttons?.[0]
    if (!first) throw new Error('التصويت بلا خيارات')
    console.log(`[${player.name}] يصوّت ${first.label}`)
    player.send({ type: 'press', id: first.id, sceneId: player.lastSceneId })
  }

  console.log('(انتظار انتهاء مهلة التصويت — 45 ثانية)')
  await Promise.all([
    host.await((m) => m.type === 'ended', 'نتيجة التصويت', 90_000),
    guest.await((m) => m.type === 'ended', 'نتيجة التصويت', 90_000),
  ])
}

// ————————————————————— التشغيل —————————————————————

async function main(): Promise<void> {
  // ما كان سيأتي من ديسكورد: عضوية السيرفر واسم العضو. كلاهما كاش مزروع
  // من داخل العملية — `assertMember` تعمل بنفس منطقها بلا تعديل حرف.
  for (const person of PEOPLE) {
    rememberGuilds(person.id, [{ id: GUILD, name: 'سيرفر التجربة', iconHash: null }])
    rememberProfile(GUILD, person.id, { displayName: person.name, avatarHash: null })
  }

  const server = await startApiServer(0)
  const address = server.address() as AddressInfo
  console.log(`الخادم يستمع على المنفذ ${address.port}`)

  const [host, guest] = await Promise.all([
    Player.connect(address.port, PEOPLE[0]),
    Player.connect(address.port, PEOPLE[1]),
  ])

  const asked = process.argv.slice(2)
  const wanted = asked.length > 0 ? asked : ['xo', 'tasweet']

  try {
    for (const game of wanted) {
      host.forget()
      guest.forget()
      if (game === 'xo') await playXo(host, guest)
      else if (game === 'tasweet') await playTasweet(host, guest)
      else throw new Error(`سيناريو غير معروف: ${game}`)
      console.log(`✓ ${game}: اكتملت من اللوبي حتى النتيجة عبر وصلتين`)
    }
  } finally {
    host.close()
    guest.close()
    server.close()
  }

  console.log('\nاللعب الجماعي عبر WebSocket يعمل.')
}

const guard = setTimeout(() => {
  console.error(`تجاوز السكربت ${WALL_MS / 1000}s — شيء ما علّق`)
  process.exit(1)
}, WALL_MS)
guard.unref()

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error('فشل:', error)
    process.exit(1)
  })
