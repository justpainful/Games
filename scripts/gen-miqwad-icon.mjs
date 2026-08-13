// أيقونة تطبيق مِقود — 1024×1024.
//
//   node scripts/gen-miqwad-icon.mjs
//
// مرسومة بنفس توقيع المشروع: حدّ أسود سميك وظل صلب بلا تمويه (DESIGN.md §5).
// والشكل مقود سفينة لا عجلة سيارة: الأذرع الخارجة من الإطار تُقرأ عند 60 بكسل
// على الشاشة الرئيسية، بينما العجلة الملساء تصير دائرة بلا معنى.

import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const SIZE = 1024
const OUT = path.join(
  process.cwd(),
  'ios',
  'Miqwad',
  'Assets.xcassets',
  'AppIcon.appiconset',
  'icon.png',
)

const paper = '#EFE3CB'
const ink = '#1A1512'
const red = '#E03A2F'
const yellow = '#FBBF1E'
const cream = '#FFFDF7'

/** ذراع واحدة من الأذرع الستّ، مرسومة عند زاوية. */
function spoke(angle) {
  return `
    <g transform="rotate(${angle} 512 512)">
      <rect x="476" y="52" width="72" height="215" rx="32"
            fill="${cream}" stroke="${ink}" stroke-width="22" />
    </g>`
}

const svg = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1024 1024" width="1024" height="1024">
  <rect width="1024" height="1024" fill="${paper}" />

  <!-- الظل الصلب: نسخة من الشكل نفسه مزاحة، لا blur -->
  <g transform="translate(26 26)" opacity="1">
    <circle cx="512" cy="512" r="330" fill="${ink}" />
    ${[0, 60, 120, 180, 240, 300].map((a) => `
      <g transform="rotate(${a} 512 512)">
        <rect x="476" y="52" width="72" height="215" rx="32" fill="${ink}" />
      </g>`).join('')}
  </g>

  ${[0, 60, 120, 180, 240, 300].map(spoke).join('')}

  <circle cx="512" cy="512" r="330" fill="${red}" stroke="${ink}" stroke-width="26" />
  <circle cx="512" cy="512" r="228" fill="${paper}" stroke="${ink}" stroke-width="26" />
  <circle cx="512" cy="512" r="96" fill="${yellow}" stroke="${ink}" stroke-width="24" />
</svg>`

const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: SIZE, height: SIZE } })
await page.setContent(
  `<html><body style="margin:0">${svg}</body></html>`,
  { waitUntil: 'load' },
)
const shot = await page.screenshot({ type: 'png' })
await browser.close()

mkdirSync(path.dirname(OUT), { recursive: true })
writeFileSync(OUT, shot)
console.log(`كُتبت ${OUT} · ${(shot.length / 1024).toFixed(0)}KB`)
