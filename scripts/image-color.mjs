// اللون الغالب في صورة.
//
//   node scripts/image-color.mjs <url>
//
// يُستعمل لمطابقة لون رتبة بلون أفتار. والقراءة عبر canvas في متصفّح لا بفكّ
// PNG يدويًا: playwright موجود أصلًا لمحرّك المشاهد، وفكّ PNG بالمرشّحات
// الخمسة يدويًا مئة سطر تُكتب مرّة وتُصحَّح عشرًا.
//
// ————————————————— لماذا لا يُؤخذ المتوسّط —————————————————
//
// متوسّط بكسلات شعار ملوّن على خلفية بيضاء يعطي رماديًا باهتًا لا يشبه الشعار
// في شيء. فالبكسلات تُجمَّع في صناديق لونية، ويُختار أكثرها امتلاءً بعد إسقاط
// الشفاف وشبه الأبيض وشبه الأسود — وهي خلفيات لا هويّة.

import { chromium } from 'playwright'

const url = process.argv[2]
if (!url) {
  console.error('usage: node scripts/image-color.mjs <url>')
  process.exit(2)
}

const browser = await chromium.launch()
const page = await browser.newPage()

const color = await page.evaluate(async (src) => {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  await new Promise((resolve, reject) => {
    image.onload = resolve
    image.onerror = () => reject(new Error('تعذّر تحميل الصورة'))
    image.src = src
  })

  const canvas = document.createElement('canvas')
  canvas.width = image.width
  canvas.height = image.height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(image, 0, 0)
  const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)

  const bins = new Map()
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]]
    if (a < 200) continue
    const max = Math.max(r, g, b)
    const min = Math.min(r, g, b)
    // شبه أبيض وشبه أسود ورمادي بلا تشبّع: خلفيات وحدود لا لون هويّة
    if (max > 240 && min > 220) continue
    if (max < 28) continue
    if (max - min < 18 && max > 90) continue

    const key = `${r >> 4}:${g >> 4}:${b >> 4}`
    const bin = bins.get(key) ?? { n: 0, r: 0, g: 0, b: 0 }
    bin.n += 1
    bin.r += r
    bin.g += g
    bin.b += b
    bins.set(key, bin)
  }

  if (bins.size === 0) return null
  const best = [...bins.values()].sort((a, b) => b.n - a.n)[0]
  return {
    r: Math.round(best.r / best.n),
    g: Math.round(best.g / best.n),
    b: Math.round(best.b / best.n),
    share: best.n,
  }
}, url)

await browser.close()

if (!color) {
  console.error('ما وُجد لون واضح')
  process.exit(1)
}

const int = (color.r << 16) | (color.g << 8) | color.b
const hex = `#${int.toString(16).padStart(6, '0')}`
console.log(JSON.stringify({ hex, int, ...color }))
