/**
 * هارنس المعاينة — يرندر كل مشهد إلى out/ بلا ديسكورد ولا قاعدة بيانات.
 *
 * هذه أهم أداة في المشروع: الفحص البصري للعربية (وصل الحروف، الاتجاه،
 * الأسماء الطويلة، خلط اللاتيني بالعربي) يتم هنا في ثوانٍ بدل دورة
 * كاملة عبر سيرفر ديسكورد.
 *
 *   npm run preview
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { startRenderer, stopRenderer } from '../src/images/browser.ts'
import { renderScene } from '../src/images/render.ts'
import type { PlayerView, Scene } from '../src/scenes/scene.ts'

const OUT = path.join(process.cwd(), 'out')

const XO = {
  key: 'xo',
  name: 'إكس أو',
  tagline: 'لعبة ثنائية ممتعة، يمكنك لعبها مع الأصدقاء',
  howTo:
    'تُلعب بين شخصين على لوحة مكونة من 3×3 مربعات، يهدف كل لاعب إلى تكوين صف من ثلاث ' +
    'أفقيًا أو عموديًا أو قطريًا، ويفوز من يحقق ذلك أولًا، أو تنتهي بتعادل إذا امتلأت الخانات دون فائز',
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

/**
 * الحالات المختارة تتعمّد كشف ما يكسر التخطيط عادة:
 * خانة فارغة، اسم لاتيني داخل RTL، اسم طويل جدًا، واسم فيه إيموجي.
 */
const cases: { name: string; scene: Scene }[] = [
  {
    name: 'xo-lobby',
    scene: {
      kind: 'lobby',
      game: XO,
      host: player('1', '.zja6', 320),
      players: [player('1', '.zja6', 320)],
      min: 2,
      max: 2,
    },
  },
  {
    name: 'xo-lobby-full',
    scene: {
      kind: 'lobby',
      game: XO,
      host: player('1', 'عبدالرحمن', 10),
      players: [player('1', 'عبدالرحمن', 10), player('2', 'Sara_2010', 200)],
      min: 2,
      max: 2,
    },
  },
  {
    name: 'xo-lobby-stress',
    scene: {
      kind: 'lobby',
      game: XO,
      host: player('1', 'اسم طويل جدا جدا يتجاوز حدود العمود بكثير', 90),
      players: [
        player('1', 'اسم طويل جدا جدا يتجاوز حدود العمود بكثير', 90),
        player('2', '🔥 xX_Sniper_Xx 🔥', 260),
      ],
      min: 2,
      max: 2,
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
