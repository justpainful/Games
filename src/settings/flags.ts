import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'

/**
 * مفاتيح الميزات — كل ميزة تدخل وهي **مطفأة**.
 *
 * ————————————————— لماذا ملف لا جدول —————————————————
 *
 * هذي عشرات القيم لا ملايين، تُقرأ في كل جولة وتُكتب مرة في الشهر. وجدول في
 * قاعدة البيانات يعني هجرة، والهجرة في هذا المشروع طلبت إعادة تهيئة مدمّرة
 * أكثر من مرة. والملف يُقرأ مرة ويُحفظ في الذاكرة، ويُكتب كتابة ذرّية فلا
 * ينكسر لو أُطفئ البوت في منتصفها.
 *
 * ————————————————— لماذا الافتراضي مطفأ —————————————————
 *
 * الميزة التي تمسّ توازن اللعب لا تدخل السيرفر لأنها كُتبت، بل لأن صاحبه
 * شغّلها. فالافتراضي هنا ليس تفضيلًا بل عقد: ما شُغّل ظاهر في اللوحة، وما لم
 * يُشغَّل لا أثر له في أي جولة.
 */

export type FlagKey =
  | 'shop'
  | 'shop.protect'
  | 'shop.revive'
  | 'shop.bomb_block'
  | 'shop.swap'
  | 'shop.peek'
  | 'shop.snipe'
  | 'stats'

export type Flag = { key: FlagKey; name: string; about: string }

/** ما يُعرض في اللوحة، بترتيبه. */
export const FLAGS: readonly Flag[] = [
  { key: 'stats', name: 'الإحصائيات', about: 'كم لعب وكم فاز وبأي لعبة' },
  { key: 'shop', name: 'المتجر', about: 'المفتاح الأعلى — إطفاؤه يطفئ كل ميزاته' },
  { key: 'shop.protect', name: 'حماية', about: 'تحميه من الطرد جولة واحدة' },
  { key: 'shop.revive', name: 'إنعاش', about: 'يرجع لاعبًا خرج' },
  { key: 'shop.bomb_block', name: 'منع قنبلة', about: 'يبطل قنبلة واحدة' },
  { key: 'shop.swap', name: 'تبديل', about: 'يبدّل دوره مع غيره' },
  { key: 'shop.peek', name: 'كشف', about: 'يرى ورقة أو دورًا' },
  { key: 'shop.snipe', name: 'قنص', about: 'يخرج لاعبًا خارج التصويت' },
]

const FILE = path.join(process.cwd(), 'data', 'flags.json')

let cache: Record<string, boolean> | null = null

function load(): Record<string, boolean> {
  if (cache) return cache
  try {
    const parsed: unknown = JSON.parse(readFileSync(FILE, 'utf8'))
    cache = parsed && typeof parsed === 'object' ? (parsed as Record<string, boolean>) : {}
  } catch {
    // ملف غير موجود أو تالف: الافتراضي مطفأ، وذلك أسلم من إسقاط البوت
    cache = {}
  }
  return cache
}

/**
 * هل الميزة شغّالة؟ الميزة تحت «المتجر» تحتاج مفتاحها ومفتاحه معًا.
 *
 * وهذا ما يجعل زر المتجر الواحد كافيًا لإيقاف كل شيء دفعة واحدة حين تنقلب
 * الجولة على أحد، بدل أن يُطارَد ستة أزرار.
 */
export function on(key: FlagKey): boolean {
  const flags = load()
  if (key.startsWith('shop.') && flags['shop'] !== true) return false
  return flags[key] === true
}

export function toggle(key: FlagKey): boolean {
  const flags = load()
  const next = !on(key)
  flags[key] = next
  save(flags)
  return next
}

export function all(): Record<string, boolean> {
  return { ...load() }
}

/** كتابة ذرّية: ملف مؤقت ثم استبدال، فلا يبقى نصف ملف لو انقطع البوت. */
function save(flags: Record<string, boolean>): void {
  mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(flags, null, 2), 'utf8')
  renameSync(tmp, FILE)
  cache = flags
}
