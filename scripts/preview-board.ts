/**
 * هارنس معاينة لقالبَي اللوحة والمواجهة.
 *
 * يستدعي القالبين مباشرة ويرسمهما بـ shoot() بدل المرور بـ renderScene،
 * فيبقى مستقلًا عن حالة render.ts أثناء العمل المتوازي.
 *
 *   npx tsx scripts/preview-board.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { shoot, startRenderer, stopRenderer } from '../src/images/browser.ts'
import { boardScene } from '../src/scenes/board.ts'
import { duelScene } from '../src/scenes/duel.ts'
import type { BoardScene, DuelScene, GameBrief, PlayerView } from '../src/scenes/scene.ts'

const OUT = path.join(process.cwd(), 'out')

const XO: GameBrief = {
  key: 'xo',
  name: 'xo',
  tagline: 'ثلاث خانات في صف واحد',
  howTo: 'كل لاعب يضع علامته في خانة، ومن يصفّ ثلاثًا يفوز.',
}

const ESHBEK: GameBrief = {
  key: 'eshbek',
  name: 'اشبك',
  tagline: 'أربعة أقراص في صف واحد',
  howTo: 'أسقط قرصك في عمود، ومن يشبك أربعة يفوز.',
}

const HAJRA: GameBrief = {
  key: 'hajra',
  name: 'حجرة',
  tagline: 'حجرة ورقة مقص',
  howTo: 'كل لاعب يختار سرًا، وتُكشف الاختيارات معًا.',
}

const NARD: GameBrief = {
  key: 'nard',
  name: 'نرد',
  tagline: 'ثلاث رميات ومن يجمع أكثر يفوز',
  howTo: 'ارمِ النرد ثلاث مرات، وأعلى مجموع يفوز.',
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

const P = {
  a: player('1', 'عبدالرحمن', 10),
  b: player('2', 'Sara_2010', 200),
  c: player('3', '.zja6', 320),
  d: player('4', 'xX_Sniper_Xx', 260),
  long: player('5', 'اسم طويل جدا جدا يتجاوز حدود العمود بكثير', 90),
  latin: player('6', 'ThePlayerWithAVeryLongLatinName', 40),
  none: { id: '7', name: 'بلا صورة', avatar: null } as PlayerView,
}

/** يبني لوحة من نص: '.' فارغة، وأي حرف آخر علامة. */
const board = (rowsText: string[]): (string | null)[] =>
  rowsText.flatMap((row) => [...row].map((ch) => (ch === '.' ? null : ch)))

const boards: { name: string; scene: BoardScene }[] = [
  {
    // 3×3 فارغة — كل خانة تحمل رقمها، والدور على الأول
    name: 'board-xo-empty',
    scene: {
      kind: 'board',
      game: XO,
      cells: board(['...', '...', '...']),
      cols: 3,
      sides: [
        { mark: 'X', player: P.a },
        { mark: 'O', player: P.b },
      ],
      turnOf: P.a,
    },
  },
  {
    // 3×3 بفوز قطري — الخانات الفائزة تُبرز واللوحة بلا دور
    name: 'board-xo-diagonal',
    scene: {
      kind: 'board',
      game: XO,
      cells: board(['XOO', '.X.', 'O.X']),
      cols: 3,
      sides: [
        { mark: 'X', player: P.a },
        { mark: 'O', player: P.b },
      ],
      turnOf: null,
      winning: [0, 4, 8],
      note: 'فاز عبدالرحمن بصفّ قطري',
    },
  },
  {
    // 3×3 ممتلئة بتعادل — لا رقم ولا دور، فقط النتيجة
    name: 'board-xo-draw',
    scene: {
      kind: 'board',
      game: XO,
      cells: board(['XOX', 'XOO', 'OXX']),
      cols: 3,
      sides: [
        { mark: 'X', player: P.latin },
        { mark: 'O', player: P.c },
      ],
      turnOf: null,
      note: 'تعادل — امتلأت اللوحة بلا صفّ',
    },
  },
  {
    // 7×6 ممتلئة جزئيًا — رأس أعمدة، عمود واحد ممتلئ، وأسماء طويلة
    name: 'board-eshbek-mid',
    scene: {
      kind: 'board',
      game: ESHBEK,
      // العمود الرابع ممتلئ حتى أعلاه — رأسه يجب أن يُطفأ وحده
      cells: board([
        '...ح...',
        '...ح...',
        '..صص...',
        '..حصح..',
        '.صححص..',
        'حصححصحص',
      ]),
      cols: 7,
      sides: [
        { mark: 'ح', player: P.long },
        { mark: 'ص', player: P.latin },
      ],
      turnOf: P.long,
      note: 'أسقط قرصك قبل انتهاء المهلة',
    },
  },
  {
    // 7×6 بفوز مائل + عمود ممتلئ يُطفأ رأسه
    name: 'board-eshbek-win',
    scene: {
      kind: 'board',
      game: ESHBEK,
      cells: board([
        'ح......',
        'صح.....',
        'حصح....',
        'صحصح...',
        'حصحصح..',
        'صحصحصح.',
      ]),
      cols: 7,
      sides: [
        { mark: 'ح', player: P.a },
        { mark: 'ص', player: P.b },
      ],
      turnOf: null,
      winning: [0, 8, 16, 24],
      note: 'فاز عبدالرحمن بأربعة مائلة',
    },
  },
  {
    // بلا أفتار وبلا ملاحظة — أسوأ حالة للعمود الجانبي
    name: 'board-xo-bare',
    scene: {
      kind: 'board',
      game: XO,
      cells: board(['X..', '.O.', '..X']),
      cols: 3,
      sides: [
        { mark: 'X', player: P.none },
        { mark: 'O', player: P.d },
      ],
      turnOf: P.d,
    },
  },
]

const duels: { name: string; scene: DuelScene }[] = [
  {
    // قبل الكشف — صندوقان متقطّعان بنفس مقاس المكشوف
    name: 'duel-hajra-hidden',
    scene: {
      kind: 'duel',
      game: HAJRA,
      left: { player: P.a, label: '؟', score: 1 },
      right: { player: P.b, label: '؟', score: 0 },
      verdict: 'اختاروا سرًا',
      round: { index: 2, total: 5 },
    },
  },
  {
    // بعد الكشف
    name: 'duel-hajra-reveal',
    scene: {
      kind: 'duel',
      game: HAJRA,
      left: { player: P.a, label: 'حجرة', score: 2 },
      right: { player: P.b, label: 'مقص', score: 0 },
      verdict: 'فاز عبدالرحمن بالمواجهة',
      round: { index: 3, total: 5 },
    },
  },
  {
    // أسماء طويلة: عربي طويل مقابل لاتيني طويل، وحكم طويل
    name: 'duel-stress-names',
    scene: {
      kind: 'duel',
      game: HAJRA,
      left: { player: P.long, label: 'ورقة', score: 12 },
      right: { player: P.latin, label: 'ورقة', score: 12 },
      verdict: 'تعادل — تُعاد الجولة بلا احتساب',
      round: { index: 5, total: 5 },
    },
  },
  {
    // نرد: نتيجة رقمية على الطرفين، وأحدهما بلا أفتار
    name: 'duel-nard-roll',
    scene: {
      kind: 'duel',
      game: NARD,
      left: { player: P.c, label: '5 + 6 = 11', score: 24 },
      right: { player: P.none, label: '2 + 3 = 5', score: 19 },
      verdict: 'الرمية 3 من 3',
      round: { index: 3, total: 3 },
    },
  },
  {
    // بلا حكم وبلا جولة وبلا نقاط — أقل مشهد ممكن
    name: 'duel-bare',
    scene: {
      kind: 'duel',
      game: NARD,
      left: { player: P.d, label: '؟' },
      right: { player: P.c, label: '؟' },
    },
  },
]

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true })
  await startRenderer()

  const cases: { name: string; html: string }[] = [
    ...boards.map((c) => ({ name: c.name, html: boardScene(c.scene) })),
    ...duels.map((c) => ({ name: c.name, html: duelScene(c.scene) })),
  ]

  for (const c of cases) {
    const started = Date.now()
    const png = await shoot(c.html)
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
