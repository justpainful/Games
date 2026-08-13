/**
 * تشغيل جاف لكل لعبة — بلا ديسكورد وبلا متصفح.
 *
 *   npx tsx scripts/dryrun.ts
 *
 * يثبت ثلاثة أشياء لا يمسكها فحص الأنواع:
 *   1. ملف بيانات كل لعبة موجود ويُحمَّل فعلًا (التحميل كسول، فالخطأ لا يظهر
 *      إلا في أول جولة أمام اللاعبين).
 *   2. حلقة اللعبة **تنتهي** ولا تعلّق — كل لعبة تُشغَّل هنا بمهلات تنتهي دائمًا.
 *   3. كل مشهد تولّده اللعبة يمرّ عبر قالبه بلا انهيار، ببيانات حقيقية لا وهمية.
 *
 * هذا هو الفارق بين «الكود يُترجم» و«اللعبة تعمل».
 */
import { loadGames } from '../src/games/all.ts'
import type { ChatInput, GameDef, Press, Table } from '../src/games/define.ts'
import { toHtml } from '../src/images/render.ts'
import type { PlayerView, Scene } from '../src/scenes/scene.ts'

const PLAYERS: PlayerView[] = [
  { id: '1', name: 'عبدالرحمن', avatar: null },
  { id: '2', name: 'Sara_2010', avatar: null },
  { id: '3', name: '.zja6', avatar: null },
  { id: '4', name: 'نواف', avatar: null },
  { id: '5', name: 'ghost_99', avatar: null },
]

/** سقف زمني حقيقي: لعبة تعلّق تفشل الفحص بدل أن تجمّد الطرفية. */
const WALL_MS = 20_000

type Report = { key: string; scenes: number; kinds: Set<string>; error?: string }

function fakeTable(game: GameDef, log: Report): Table {
  const seen = (scene: Scene): void => {
    log.scenes++
    log.kinds.add(scene.kind)
    // القالب يُشغَّل ببيانات اللعبة الحقيقية — هنا تنكشف الحقول الناقصة
    const html = toHtml(scene)
    if (!html.includes('class="scene"')) {
      throw new Error(`قالب ${scene.kind} لا يُخرج عنصر .scene`)
    }
  }

  let players = [...PLAYERS].slice(0, Math.max(game.players.min, 3))

  return {
    brief: { key: game.key, name: game.name, tagline: game.tagline, howTo: game.howTo },
    get players() {
      return players
    },
    host: players[0]!,
    async show(scene) {
      seen(scene)
    },
    async update(scene) {
      seen(scene)
    },
    // التشغيل الجاف يفحص مسار الفعالية: اللعبة المفتوحة جولة واحدة بلا انتظار،
    // فلا تكشف التعليقات التي بُني هذا السكربت لكشفها
    open: false,
    // التشغيل الجاف لا يكتب أحد فيه، فالعدّاد صفر ثابت
    attempts: 0,
    async say() {},
    async whisper() {
      return true // نفترض أن الخاص مفتوح؛ مسار الرفض يُختبر يدويًا
    },
    async reveal(_press, scene) {
      // المشهد الخاص يُحصى مع البقيّة: التشغيل الجاف يرسم كل مشهد تنتجه
      // اللعبة، ولوح سيّد التجسّس أحوجها إلى الفحص لأنه لا يُرى في القناة.
      seen(scene)
      return true
    },
    // لا أحد يجيب ولا يضغط: يدفع كل لعبة إلى مسار «انتهى الوقت»،
    // وهو المسار الذي يُنسى اختباره عادة وفيه تكمن التعليقات.
    async waitChat(): Promise<ChatInput | null> {
      return null
    },
    async waitPress(): Promise<Press | null> {
      return null
    },
    async collectChat(): Promise<ChatInput[]> {
      return []
    },
    async collectPresses(): Promise<Press[]> {
      return []
    },
    async sleep() {}, // بلا انتظار حقيقي، وإلا استغرق الفحص ساعة
    drop(userId) {
      players = players.filter((p) => p.id !== userId)
    },
    aborted: false,
  }
}

async function main(): Promise<void> {
  const games = await loadGames()
  const reports: Report[] = []
  let failed = 0

  for (const game of games) {
    const log: Report = { key: game.key, scenes: 0, kinds: new Set() }
    try {
      await Promise.race([
        game.play(fakeTable(game, log)),
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error(`تجاوزت ${WALL_MS / 1000}s — الحلقة لا تنتهي`)), WALL_MS),
        ),
      ])
    } catch (err) {
      log.error = (err as Error).message
      failed++
    }
    reports.push(log)
  }

  for (const r of reports) {
    const kinds = [...r.kinds].join(', ') || '—'
    if (r.error) console.error(`  ✗ ${r.key.padEnd(10)} ${r.error}`)
    else console.log(`  ✓ ${r.key.padEnd(10)} ${String(r.scenes).padStart(3)} مشهد  [${kinds}]`)
  }

  console.log(`\n${games.length - failed}/${games.length} لعبة اكتملت بلا انهيار ولا تعليق.`)
  if (failed > 0) process.exit(1)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
