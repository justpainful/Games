/**
 * فحص ملفات محتوى الألعاب.
 *
 *   npm run check:words
 *
 * ملفات الكلمات مؤلّفة بشريًا وبالآلاف، والأخطاء فيها لا تظهر إلا أمام اللاعبين
 * في منتصف جولة. هذا السكربت يمسكها قبل ذلك.
 */
import fs from 'node:fs/promises'
import path from 'node:path'

const GAMES = path.join(process.cwd(), 'src', 'games')

/** الحقول التي تُقارن بها إجابة اللاعب، فيجب أن تكون نظيفة تمامًا. */
const ANSWER_FIELDS = ['plural', 'singular', 'opposite', 'word', 'capital', 'country', 'continent', 'answer']

// تُبنى من نصوص مهروبة لا من محارف حقيقية: المحرف غير المرئي داخل الكود
// يختفي في المراجعة ويُفقد عند النسخ، وهو بالضبط ما نبحث عنه في البيانات.
/** تشكيل وتطويل */
const DIACRITICS = new RegExp('[\\u064B-\\u0652\\u0670\\u0640]')
/** عرض صفري، محارف اتجاه، BOM، شرطة ناعمة */
const CONTROL = new RegExp('[\\u200B-\\u200F\\uFEFF\\u00AD]')

type Problem = { file: string; message: string }

async function main(): Promise<void> {
  const problems: Problem[] = []
  let filesChecked = 0
  let entriesChecked = 0

  const dirs = await fs.readdir(GAMES, { withFileTypes: true }).catch(() => [])

  for (const dir of dirs) {
    if (!dir.isDirectory()) continue
    const folder = path.join(GAMES, dir.name)
    const files = (await fs.readdir(folder)).filter((f) => f.endsWith('.json'))

    for (const file of files) {
      const rel = `${dir.name}/${file}`
      filesChecked++

      let data: unknown
      try {
        data = JSON.parse(await fs.readFile(path.join(folder, file), 'utf8'))
      } catch (err) {
        problems.push({ file: rel, message: `JSON غير صالح: ${(err as Error).message}` })
        continue
      }

      if (!Array.isArray(data)) {
        problems.push({ file: rel, message: 'الجذر ليس مصفوفة' })
        continue
      }
      if (data.length === 0) {
        problems.push({ file: rel, message: 'الملف فارغ' })
        continue
      }

      const seen = new Map<string, number>()

      data.forEach((entry, i) => {
        entriesChecked++
        if (typeof entry !== 'object' || entry === null) {
          problems.push({ file: rel, message: `المدخلة ${i} ليست كائنًا` })
          return
        }

        const record = entry as Record<string, unknown>

        for (const [key, value] of Object.entries(record)) {
          if (typeof value !== 'string') continue
          if (value !== value.trim()) {
            problems.push({ file: rel, message: `المدخلة ${i}: «${key}» فيها مسافات طرفية` })
          }
          if (value.length === 0) {
            problems.push({ file: rel, message: `المدخلة ${i}: «${key}» فارغ` })
          }
          if (ANSWER_FIELDS.includes(key)) {
            if (DIACRITICS.test(value)) {
              problems.push({ file: rel, message: `المدخلة ${i}: «${key}» فيها تشكيل أو تطويل` })
            }
            if (CONTROL.test(value)) {
              problems.push({ file: rel, message: `المدخلة ${i}: «${key}» فيها محارف تحكم مخفية` })
            }
          }
        }

        // مفتاح التكرار: أول حقل نصي في المدخلة
        const first = Object.values(record).find((v) => typeof v === 'string') as string | undefined
        if (first) {
          const at = seen.get(first)
          if (at !== undefined) {
            problems.push({ file: rel, message: `تكرار «${first}» في المدخلتين ${at} و ${i}` })
          } else {
            seen.set(first, i)
          }
        }
      })

      console.log(`${rel.padEnd(28)} ${String(data.length).padStart(5)} مدخلة`)
    }
  }

  console.log(`\nفُحص ${filesChecked} ملفًا و ${entriesChecked} مدخلة.`)

  if (problems.length > 0) {
    console.error(`\n${problems.length} مشكلة:\n`)
    // التكرارات تصير مئات أحيانًا — نعرض عيّنة ولا نغرق الطرفية
    for (const p of problems.slice(0, 60)) console.error(`  ${p.file}: ${p.message}`)
    if (problems.length > 60) console.error(`  ... و ${problems.length - 60} أخرى`)
    process.exit(1)
  }

  console.log('كل الملفات سليمة.')
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
