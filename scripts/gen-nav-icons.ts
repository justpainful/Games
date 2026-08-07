/**
 * يولّد أيقونات شريط التنقّل إلى asset catalog.
 *
 *   npm run gen:navicons
 *
 * لماذا لا نستعمل SF Symbols: هندستها هندسة آبل — خطوط رفيعة ونهايات حادة —
 * بينما هوية المشروع سميكة مدوّرة (DESIGN.md §5). أيقونة النظام وسط بطاقاتنا
 * القصاصية تبدو مستعارة من تطبيق آخر.
 *
 * تُرسم أحادية اللون وتُعلَّم `template` في الـ catalog، فيصبغها النظام بالأحمر
 * عند الاختيار — نحتفظ بسلوك iOS الأصلي ونستبدل الهندسة وحدها.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { shoot, startRenderer, stopRenderer } from '../src/images/browser.ts'

const OUT = path.join(process.cwd(), 'ios', 'Games', 'Assets.xcassets')
/** مقاس أيقونة التبويب بالنقاط. */
const PT = 28
const SCALES = [1, 2, 3]

/**
 * تجمّع الصفحات يعمل بـ `deviceScaleFactor: 2`، فبكسل CSS واحد يخرج بكسلين.
 * بدون القسمة هنا يخرج `@1x` بحجم `@2x` ويصبح كل شيء ضعف مقاسه في الشريط.
 */
const DEVICE_SCALE = 2

/**
 * الأيقونات بخطوط سُمكها 8.5 على شبكة 100 — نحو 8.5% مقابل ~6% في SF Symbols،
 * وهو ما يجعلها تصمد بجانب حدودنا السوداء بدل أن تبدو باهتة.
 */
const STROKE = 8.5

const ICONS: Record<string, string> = {
  // ذراع تحكّم: جسم عريض بمقبضين، صليب اتجاهات وزرّان
  NavGames: `
    <path d="M30 36h40a26 26 0 0 1 24 30l-3 15a13 13 0 0 1-24 4l-5-9H38l-5 9a13 13 0 0 1-24-4l-3-15a26 26 0 0 1 24-30z"/>
    <path d="M28 58h14M35 51v14"/>
    <path d="M66 52h.01M76 62h.01"/>`,

  // شريحة معالج: مربّع بأطراف — لغة "الخصم الآلي"
  NavSolo: `
    <rect x="31" y="31" width="38" height="38" rx="10"/>
    <rect x="46" y="46" width="8" height="8" rx="2"/>
    <path d="M42 31V17M58 31V17M42 69v14M58 69v14M31 42H17M31 58H17M69 42h14M69 58h14"/>`,

  // كأس: وعاء بمقبضين وقاعدة عريضة
  NavLeaders: `
    <path d="M33 20h34v22a17 17 0 0 1-34 0z"/>
    <path d="M33 26H21v6a13 13 0 0 0 12 13"/>
    <path d="M67 26h12v6a13 13 0 0 1-12 13"/>
    <path d="M50 59v13"/>
    <path d="M35 84h30l-4-12H39z"/>`,

  // شخص: رأس وكتفان بسماكة الهوية
  NavProfile: `
    <circle cx="50" cy="36" r="15"/>
    <path d="M22 84a28 28 0 0 1 56 0"/>`,
}

function svg(body: string, px: number): string {
  // viewBox بهامش: نصف سُمك الخط يمتد خارج الإحداثيات، وبلا الهامش تُقصّ الحواف
  return `<svg id="icon" width="${px}" height="${px}" viewBox="-6 -6 112 112" fill="none"
     stroke="#000" stroke-width="${STROKE}" stroke-linecap="round" stroke-linejoin="round"
     style="display:block">${body}</svg>`
}

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true })
  await fs.writeFile(
    path.join(OUT, 'Contents.json'),
    JSON.stringify({ info: { author: 'xcode', version: 1 } }, null, 2),
  )

  await startRenderer()

  for (const [name, body] of Object.entries(ICONS)) {
    const dir = path.join(OUT, `${name}.imageset`)
    await fs.mkdir(dir, { recursive: true })

    for (const scale of SCALES) {
      const cssPx = (PT * scale) / DEVICE_SCALE
      const html = `<div style="width:${cssPx}px;height:${cssPx}px">${svg(body, cssPx)}</div>`
      const png = await shoot(html, { selector: '#icon', transparent: true })
      const file = scale === 1 ? 'icon.png' : `icon@${scale}x.png`
      await fs.writeFile(path.join(dir, file), png)
    }

    await fs.writeFile(
      path.join(dir, 'Contents.json'),
      JSON.stringify(
        {
          images: SCALES.map((s) => ({
            filename: s === 1 ? 'icon.png' : `icon@${s}x.png`,
            idiom: 'universal',
            scale: `${s}x`,
          })),
          info: { author: 'xcode', version: 1 },
          // template = يصبغها النظام بلون التبويب المختار
          properties: { 'template-rendering-intent': 'template' },
        },
        null,
        2,
      ),
    )
    console.log(`${name} ✓`)
  }

  await stopRenderer()
  console.log(`\nكُتبت ${Object.keys(ICONS).length} أيقونة في ${OUT}`)
}

main().catch(async (err) => {
  console.error(err)
  await stopRenderer().catch(() => {})
  process.exit(1)
})
