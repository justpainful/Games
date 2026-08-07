/**
 * يولّد توكنات التصميم لـ SwiftUI من `src/design/tokens.ts`.
 *
 *   npm run gen:swift
 *
 * DESIGN.md ينصّ على مصدر واحد لكل قيمة بصرية. نسخ الألوان يدويًا إلى سويفت كان
 * سيكسر ذلك بصمت: تعديل الأحمر في مكان واحد يترك التطبيق بأحمر قديم بلا أي خطأ.
 * الملف المولّد لا يُحرَّر — يُعاد توليده.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { color, leading, lift, radius, size, space, stroke, weight } from '../src/design/tokens.ts'

const OUT = path.join(process.cwd(), 'ios', 'Games', 'Design', 'Tokens.swift')

/** #RRGGBB → قيم Double لـ SwiftUI. */
function swiftColor(hex: string): string {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  return `Color(red: ${r.toFixed(4)}, green: ${g.toFixed(4)}, blue: ${b.toFixed(4)})`
}

function pascal(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1)
}

async function main(): Promise<void> {
  const lines: string[] = [
    '// ⚠️ ملف مولّد — لا تحرّره.',
    '// المصدر: src/design/tokens.ts  ·  أعد التوليد: npm run gen:swift',
    '',
    'import SwiftUI',
    '',
    'public enum Ink {',
  ]

  for (const [k, v] of Object.entries(color)) {
    lines.push(`    public static let ${k} = ${swiftColor(v)}`)
  }
  lines.push('}', '')

  lines.push('public enum Metric {')
  for (const [k, v] of Object.entries(size)) lines.push(`    public static let size${pascal(k)}: CGFloat = ${v}`)
  for (const [k, v] of Object.entries(stroke)) lines.push(`    public static let stroke${pascal(k)}: CGFloat = ${v}`)
  for (const [k, v] of Object.entries(lift)) lines.push(`    public static let lift${pascal(k)}: CGFloat = ${v}`)
  for (const [k, v] of Object.entries(radius)) lines.push(`    public static let radius${pascal(k)}: CGFloat = ${v}`)
  for (const [k, v] of Object.entries(space)) lines.push(`    public static let space${pascal(k)}: CGFloat = ${v}`)
  for (const [k, v] of Object.entries(leading)) lines.push(`    public static let leading${pascal(k)}: CGFloat = ${v}`)
  lines.push('}', '')

  // المقاسات أعلاه محسوبة لمشهد عرضه 1500px، والجوال أضيق بكثير.
  lines.push(
    '/// أوزان الخطوط كما سُجّلت أسماؤها في الحزمة (PostScript names).',
    'public enum Face {',
    '    public static let display = "BalooBhaijaan2-ExtraBold"',
    '    public static let displaySoft = "BalooBhaijaan2-Bold"',
    '    public static let body = "Cairo-Regular"',
    '    public static let bodyBold = "Cairo-Bold"',
    '}',
    '',
    `/// أوزان رقمية للرجوع إليها عند الحاجة: ${Object.entries(weight)
      .map(([k, v]) => `${k}=${v}`)
      .join(' · ')}`,
    '',
  )

  await fs.mkdir(path.dirname(OUT), { recursive: true })
  await fs.writeFile(OUT, lines.join('\n'), 'utf8')
  console.log(`كُتب ${OUT}`)
  console.log(`${Object.keys(color).length} لونًا · ${Object.keys(size).length} حجم نص`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
