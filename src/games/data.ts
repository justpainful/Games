import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

/**
 * يحمّل ملف بيانات اللعبة من مجلدها.
 *
 * القراءة وقت التشغيل لا عبر `import ... from './words.json'` لسببين: ملفات
 * الكلمات كبيرة ولا داعي لتحميلها كلها عند بدء البوت لو عُطّلت اللعبة، وحتى
 * لا يرتبط فحص الأنواع بوجود ملف بيانات ما زال يُؤلَّف.
 */
export function loadData<T>(metaUrl: string, file: string): T[] {
  const dir = path.dirname(fileURLToPath(metaUrl))
  const raw = readFileSync(path.join(dir, file), 'utf8')
  const parsed: unknown = JSON.parse(raw)
  if (!Array.isArray(parsed)) throw new Error(`${file}: الجذر يجب أن يكون مصفوفة`)
  if (parsed.length === 0) throw new Error(`${file}: فارغ`)
  return parsed as T[]
}

/**
 * يسحب عناصر بلا تكرار حتى تنفد، ثم يخلط من جديد.
 *
 * السحب العشوائي المباشر يكرّر السؤال نفسه مرتين في لعبة من عشر جولات كثيرًا
 * (مفارقة عيد الميلاد)، واللاعبون يعتبرونه خللًا.
 */
export function dealer<T>(items: readonly T[]): () => T {
  let bag: T[] = []
  return () => {
    if (bag.length === 0) {
      bag = [...items]
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1))
        ;[bag[i], bag[j]] = [bag[j]!, bag[i]!]
      }
    }
    return bag.pop()!
  }
}
