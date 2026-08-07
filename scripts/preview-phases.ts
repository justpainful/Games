/**
 * هارنس معاينة مشاهد الأطوار — العجلة والأدوار والبحث والتصويت.
 *
 * `preview.ts` يغطّي مشاهد ألعاب الكتابة. هذا ملفه المقابل لألعاب الأطوار،
 * وفيه الحالات التي تكسر هذه القوالب تحديدًا: عجلة بثلاثة قطاعات وبأخرى
 * اثني عشر، ليل ونهار ونتيجة، شبكة نصفها مشطوب، وتصويت بصفر أصوات.
 *
 *   npx tsx scripts/preview-phases.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { startRenderer, stopRenderer } from '../src/images/browser.ts'
import { renderScene } from '../src/images/render.ts'
import type { GameBrief, PlayerView, Scene } from '../src/scenes/scene.ts'

const OUT = path.join(process.cwd(), 'out')

const ROULETTE: GameBrief = {
  key: 'roulette',
  name: 'روليت',
  tagline: 'العجلة تدور، والاسم الذي يقف عند المؤشّر يتحمّل النتيجة',
  howTo: 'ادخلوا اللعبة، ثم تدور العجلة وتختار واحدًا منكم عشوائيًا',
}

const MAFIA: GameBrief = {
  key: 'mafia',
  name: 'مافيا',
  tagline: 'ليل يقتل ونهار يحاكم',
  howTo: 'المافيا تقتل ليلًا، والمواطنون يعدمون نهارًا بالتصويت',
}

const HIDE: GameBrief = {
  key: 'hide',
  name: 'هايد',
  tagline: 'واحد يختبئ والبقية يبحثون',
  howTo: 'المختبئ يختار خانة سرًا، وللباحثين محاولات معدودة',
}

const TASWEET: GameBrief = {
  key: 'tasweet',
  name: 'تصويت',
  tagline: 'سؤال واحد وخيارات، والأغلبية تحكم',
  howTo: 'القائد يكتب السؤال والخيارات، والبقية يصوّتون',
}

/** أفتار رمادي بسيط — يكفي لفحص التخطيط بلا شبكة. */
const stub = (hue: number): string =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
       <rect width="120" height="120" fill="hsl(${hue} 45% 62%)"/>
       <circle cx="60" cy="46" r="22" fill="rgba(255,255,255,.85)"/>
       <ellipse cx="60" cy="108" rx="38" ry="30" fill="rgba(255,255,255,.85)"/>
     </svg>`,
  )

const player = (id: string, name: string, hue: number): PlayerView => ({
  id,
  name,
  avatar: stub(hue),
})

/** خليط مقصود: عربي قصير، لاتيني، اسم طويل، ورقم في أول الاسم. */
const NAMES = [
  'عبدالرحمن',
  'Sara_2010',
  'خالد',
  '.zja6',
  'نورة',
  'xX_Sniper_Xx',
  'محمد بن سلطان الشمري',
  '7amoodi',
  'ريما',
  'Abu-Faisal',
  'يوسف',
  'TheLegend27',
  'دانة',
  'م',
  'عبدالله عبدالعزيز عبدالرحمن',
  'Zzz',
  'فهد',
  'Q8_Gamer',
  'لمياء',
  'K',
]

const roster = (n: number): PlayerView[] =>
  Array.from({ length: n }, (_, i) => player(String(i + 1), NAMES[i % NAMES.length] ?? 'لاعب', i * 37))

const twelve = roster(12)
const eight = roster(8)

const cases: { name: string; scene: Scene }[] = [
  /* ————— العجلة ————— */
  {
    name: 'wheel-3',
    scene: { kind: 'wheel', game: ROULETTE, players: roster(3), note: 'تدور بعد ثوانٍ' },
  },
  {
    name: 'wheel-12',
    scene: { kind: 'wheel', game: ROULETTE, players: twelve },
  },
  {
    name: 'wheel-20',
    scene: { kind: 'wheel', game: ROULETTE, players: roster(20) },
  },
  {
    name: 'wheel-picked',
    scene: {
      kind: 'wheel',
      game: ROULETTE,
      players: twelve,
      picked: twelve[6] ?? null,
      note: 'وقفت العجلة',
    },
  },
  {
    name: 'wheel-picked-long',
    scene: {
      kind: 'wheel',
      game: ROULETTE,
      players: [
        player('1', 'محمد بن سلطان الشمري', 10),
        player('2', 'TheLegend27', 120),
        player('3', '.zja6', 200),
      ],
      picked: player('1', 'محمد بن سلطان الشمري', 10),
    },
  },
  {
    name: 'wheel-teams',
    scene: {
      kind: 'wheel',
      game: ROULETTE,
      players: [
        { id: 'team:1', name: 'الفريق الأول', avatar: null },
        { id: 'team:2', name: 'الفريق الثاني', avatar: null },
      ],
      picked: { id: 'team:2', name: 'الفريق الثاني', avatar: null },
      note: 'روليت التيمات',
    },
  },

  /* ————— الأدوار ————— */
  {
    name: 'roles-night',
    scene: {
      kind: 'roles',
      game: MAFIA,
      phase: 'night',
      headline: 'نام أهل القرية، واستيقظت المافيا',
      detail: 'المافيا تختار ضحيتها الآن. الباقون ينتظرون الصباح.',
      alive: eight,
      dead: [],
    },
  },
  {
    name: 'roles-day',
    scene: {
      kind: 'roles',
      game: MAFIA,
      phase: 'day',
      headline: 'طلع النهار — من نعدم؟',
      detail: 'ناقشوا ثم صوّتوا. أعلى الأصوات يُعدم، والتعادل يعني إعادة التصويت.',
      alive: eight.slice(0, 6),
      dead: eight.slice(6),
      spotlight: eight[6] ?? null,
    },
  },
  {
    name: 'roles-day-long',
    scene: {
      kind: 'roles',
      game: MAFIA,
      phase: 'day',
      headline: 'قُتل محمد بن سلطان الشمري في الليل ولم يستطع الطبيب إنقاذه',
      detail: 'كان مواطنًا.',
      alive: twelve.slice(0, 9),
      dead: twelve.slice(9),
      spotlight: twelve[9] ?? null,
    },
  },
  {
    name: 'roles-result',
    scene: {
      kind: 'roles',
      game: MAFIA,
      phase: 'result',
      headline: 'فازت المافيا',
      detail: 'صار عدد المافيا مساويًا لعدد المواطنين، ولا مجال لقلب النتيجة.',
      alive: eight.slice(0, 3),
      dead: eight.slice(3),
      spotlight: eight[0] ?? null,
    },
  },

  /* ————— البحث ————— */
  {
    name: 'hunt-partial',
    scene: {
      kind: 'hunt',
      game: HIDE,
      total: 12,
      cleared: [2, 5, 6, 9, 11],
      seeker: player('2', 'Sara_2010', 200),
      headline: 'ابحثوا عن المختبئ',
      note: 'بقيت 3 محاولات',
    },
  },
  {
    name: 'hunt-wide',
    scene: {
      kind: 'hunt',
      game: HIDE,
      total: 18,
      cleared: [1, 3, 4, 7, 8, 12, 13, 17],
      seeker: player('7', 'محمد بن سلطان الشمري', 90),
      headline: 'آخر محاولة قبل أن يفوز المختبئ',
      note: 'محاولة واحدة',
    },
  },
  {
    name: 'hunt-fresh',
    scene: {
      kind: 'hunt',
      game: HIDE,
      total: 9,
      cleared: [],
      seeker: null,
      headline: 'اختبأ لاعب في إحدى الخانات',
    },
  },

  /* ————— التصويت ————— */
  {
    name: 'poll-mixed',
    scene: {
      kind: 'poll',
      game: TASWEET,
      question: 'وش أفضل لعبة نلعبها الحين؟',
      options: [
        { id: 'a', label: 'مافيا', votes: 9 },
        { id: 'b', label: 'كراسي', votes: 4 },
        { id: 'c', label: 'هايد', votes: 2 },
        { id: 'd', label: 'روليت', votes: 1 },
        { id: 'e', label: 'ولا وحدة منها', votes: 0 },
      ],
      totalVotes: 16,
      note: 'انتهى التصويت',
    },
  },
  {
    name: 'poll-zero',
    scene: {
      kind: 'poll',
      game: TASWEET,
      question: 'مين يستاهل يطلع من اللعبة؟',
      options: [
        { id: 'a', label: 'عبدالرحمن', votes: 0, player: player('1', 'عبدالرحمن', 10) },
        { id: 'b', label: 'Sara_2010', votes: 0, player: player('2', 'Sara_2010', 200) },
        { id: 'c', label: 'TheLegend27', votes: 0, player: player('3', 'TheLegend27', 300) },
      ],
      totalVotes: 0,
    },
  },
  {
    name: 'poll-tie',
    scene: {
      kind: 'poll',
      game: TASWEET,
      question: 'هل نكمل جولة ثانية ولا نوقف اللعبة عند هذا الحد؟',
      options: [
        { id: 'a', label: 'نكمل', votes: 5 },
        { id: 'b', label: 'نوقف', votes: 5 },
      ],
      totalVotes: 10,
      note: 'تعادل — يعاد التصويت',
    },
  },
  {
    name: 'poll-long',
    scene: {
      kind: 'poll',
      game: TASWEET,
      question: 'لو خيّرناكم بين لعبة طويلة فيها أدوار وبين لعبة سريعة تنتهي في دقيقتين، وش تختارون؟',
      options: [
        { id: 'a', label: 'لعبة طويلة فيها أدوار ونقاش وتصويت', votes: 7 },
        { id: 'b', label: 'Quick round, two minutes max', votes: 11 },
        { id: 'c', label: 'ما يفرق', votes: 3 },
      ],
      totalVotes: 21,
    },
  },
]

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true })
  await startRenderer()

  for (const c of cases) {
    const started = Date.now()
    const png = await renderScene(c.scene)
    await fs.writeFile(path.join(OUT, `${c.name}.png`), png)
    console.log(`${c.name}.png  ${(png.length / 1024).toFixed(0)}KB  ${Date.now() - started}ms`)
  }

  await stopRenderer()
  console.log(`\nتمّ. الصور في ${OUT}`)
}

main().catch(async (err) => {
  console.error(err)
  await stopRenderer()
  process.exit(1)
})
