/**
 * هارنس معاينة لمشهدي الجولة والترتيب.
 *
 * لا يمرّ عبر renderScene لأن render.ts لم يُوصَل بهذين القالبين بعد،
 * فيستدعي القالبين مباشرة ويرسمهما بـ shoot().
 *
 *   npx tsx scripts/preview-round.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { shoot, startRenderer, stopRenderer } from '../src/images/browser.ts'
import { roundScene } from '../src/scenes/round.ts'
import { standingsScene } from '../src/scenes/standings.ts'
import type { GameBrief, PlayerView, RoundScene, StandingsScene } from '../src/scenes/scene.ts'

const OUT = path.join(process.cwd(), 'out')

const KLMAT: GameBrief = {
  key: 'klmat',
  name: 'كلمات',
  tagline: 'اكتب أول كلمة تخطر لك قبل أن ينتهي الوقت',
  howTo: 'يُعرض سؤال في كل جولة، وأول من يكتب الإجابة الصحيحة في الشات يأخذ النقطة',
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
  d: player('4', '🔥 xX_Sniper_Xx 🔥', 260),
  e: player('5', 'اسم طويل جدا جدا يتجاوز حدود العمود بكثير', 90),
  f: player('6', 'Mo', 40),
  g: player('7', 'نواف', 140),
  h: player('8', 'ghost_99', 180),
  i: player('9', 'ليان', 300),
  j: player('10', 'A', 60),
}

const rounds: { name: string; scene: RoundScene }[] = [
  {
    // كلمة قصيرة — يجب أن تكبر حتى تملأ الشاشة
    name: 'round-word',
    scene: { kind: 'round', game: KLMAT, prompt: 'برتقال', index: 1, total: 8 },
  },
  {
    // سؤال متوسط مع تلميح
    name: 'round-question',
    scene: {
      kind: 'round',
      game: KLMAT,
      prompt: 'ما عاصمة المملكة المغربية؟',
      hint: 'الإجابة من 5 حروف',
      index: 3,
      total: 8,
    },
  },
  {
    // أسوأ حالة: سؤال طويل يجب ألا يتجاوز سطرين ولا يقفز خارج البطاقة
    name: 'round-long',
    scene: {
      kind: 'round',
      game: KLMAT,
      prompt: 'اكتب اسم حيوان يبدأ بحرف الطاء ولا يطير ولا يعيش في الماء',
      hint: 'عندك 30 ثانية للإجابة',
      index: 12,
      total: 12,
    },
  },
]

const standings: { name: string; scene: StandingsScene }[] = [
  {
    name: 'standings-one',
    scene: { kind: 'standings', game: KLMAT, rows: [{ player: P.a, score: 3 }] },
  },
  {
    name: 'standings-tie',
    scene: {
      kind: 'standings',
      game: KLMAT,
      heading: 'النتيجة النهائية',
      rows: [
        { player: P.b, score: 7 },
        { player: P.c, score: 7 },
        { player: P.e, score: 4 },
        { player: P.d, score: 4 },
        { player: P.f, score: 0 },
      ],
    },
  },
  {
    name: 'standings-ten',
    scene: {
      kind: 'standings',
      game: KLMAT,
      rows: [
        { player: P.a, score: 12 },
        { player: P.b, score: 11 },
        { player: P.c, score: 9 },
        { player: P.d, score: 8 },
        { player: P.e, score: 6 },
        { player: P.f, score: 5 },
        { player: P.g, score: 5 },
        { player: P.h, score: 3 },
        { player: P.i, score: 1 },
        { player: P.j, score: 0 },
      ],
    },
  },
  {
    name: 'standings-empty',
    scene: { kind: 'standings', game: KLMAT, rows: [] },
  },
]

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true })
  await startRenderer()

  const cases: { name: string; html: string }[] = [
    ...rounds.map((c) => ({ name: c.name, html: roundScene(c.scene) })),
    ...standings.map((c) => ({ name: c.name, html: standingsScene(c.scene) })),
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
