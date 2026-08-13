import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs'
import path from 'node:path'
import type { FlagKey } from '../settings/flags.ts'

/**
 * المتجر: ما يُشترى، وبكم، وما بيد كل لاعب.
 *
 * ————————————————— لماذا الميزة تُستهلك ولا تُملَك —————————————————
 *
 * الميزة الدائمة تجعل من جمع نقاطًا أكثر أقوى ممن يلعب أحسن، وذلك يقلب معنى
 * الفوز في مافيا خاصة: من اشترى الحماية مرة صار لا يُطرد أبدًا، فلا يبقى في
 * اللعبة ما يُلعب. والاستهلاك يبقيها قرارًا: تملكها مرة، فتقرّر أي جولة
 * تستحقّها.
 *
 * ولذلك المخزون عدد لا صفة: `{userId: {protect: 2}}`، ينقص واحدًا كل استعمال.
 *
 * ————————————————— لماذا ملف لا جدول —————————————————
 *
 * نفس سبب المفاتيح: كميات صغيرة تُقرأ كثيرًا وتُكتب قليلًا، وإضافة جدول هنا
 * تعني هجرة في قاعدة طلبت إعادة تهيئة مدمّرة أكثر من مرة. والكتابة ذرّية.
 */

export type PerkKey = 'protect' | 'revive' | 'bomb_block' | 'swap' | 'peek' | 'snipe'

export type Perk = {
  key: PerkKey
  /** مفتاحه في لوحة المفاتيح — لا يُباع ولا يُستعمل وهو مطفأ */
  flag: FlagKey
  name: string
  about: string
  price: number
}

/**
 * الأسعار بنقاط اللعب.
 *
 * غالية عمدًا: النقطة تُكسب بجولة، فالحماية بمئة تعني مئة جولة فوز. وهذا هو
 * ما يمنع المتجر من أن يصير طريقًا أقصر من اللعب نفسه.
 */
export const PERKS: readonly Perk[] = [
  { key: 'protect', flag: 'shop.protect', name: 'حماية', about: 'تمنع طردك جولة واحدة', price: 100 },
  { key: 'revive', flag: 'shop.revive', name: 'إنعاش', about: 'يرجّعك بعد خروجك مرة', price: 150 },
  { key: 'bomb_block', flag: 'shop.bomb_block', name: 'منع قنبلة', about: 'يبطل قنبلة واحدة عنك', price: 80 },
  { key: 'swap', flag: 'shop.swap', name: 'تبديل', about: 'يبدّل دورك مع لاعب آخر', price: 120 },
  { key: 'peek', flag: 'shop.peek', name: 'كشف', about: 'يريك ورقة أو دورًا واحدًا', price: 90 },
  { key: 'snipe', flag: 'shop.snipe', name: 'قنص', about: 'يخرج لاعبًا خارج التصويت', price: 200 },
]

type Bag = Record<string, Partial<Record<PerkKey, number>>>

const FILE = path.join(process.cwd(), 'data', 'shop.json')
let cache: Bag | null = null

function load(): Bag {
  if (cache) return cache
  try {
    const parsed: unknown = JSON.parse(readFileSync(FILE, 'utf8'))
    cache = parsed && typeof parsed === 'object' ? (parsed as Bag) : {}
  } catch {
    cache = {}
  }
  return cache
}

function save(bag: Bag): void {
  mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(bag, null, 2), 'utf8')
  renameSync(tmp, FILE)
  cache = bag
}

const seat = (guildId: string, userId: string): string => `${guildId}:${userId}`

export function bagOf(guildId: string, userId: string): Partial<Record<PerkKey, number>> {
  return { ...(load()[seat(guildId, userId)] ?? {}) }
}

export function give(guildId: string, userId: string, perk: PerkKey, count = 1): number {
  const bag = load()
  const key = seat(guildId, userId)
  const held = bag[key] ?? {}
  const next = (held[perk] ?? 0) + count
  bag[key] = { ...held, [perk]: next }
  save(bag)
  return next
}

/**
 * يستهلك واحدة إن وُجدت. يعود `false` إن لم يملكها.
 *
 * الاستهلاك يقع عند **نفع الميزة** لا عند طلبها: من ضغط «حماية» ولم يُطرد
 * أصلًا لا تُخصم منه، وإلا صارت الميزة ضريبة على الحذر.
 */
export function spend(guildId: string, userId: string, perk: PerkKey): boolean {
  // الباقية في الحساب لا تنقص: امتلاكها هو استعمالها
  if (keepOf(perk)) return (load()[seat(guildId, userId)] ?? {})[perk] !== undefined
  const bag = load()
  const key = seat(guildId, userId)
  const held = bag[key] ?? {}
  const have = held[perk] ?? 0
  if (have <= 0) return false
  bag[key] = { ...held, [perk]: have - 1 }
  save(bag)
  return true
}

// ————————————————————— الضبط: السعر والبقاء —————————————————————

/**
 * ما يُضبط لكل ميزة بعد نشرها.
 *
 * السعر في `PERKS` تقدير أوّلي، والتوازن لا يُعرف إلا من اللعب: ميزة تبدو
 * غالية على الورق تصير رخيصة بعد أسبوع. ولذلك يُقرأ السعر من هنا أولًا، ولا
 * يُلمس الكود لتغييره.
 *
 * و`keep` يقلب طبيعة الميزة: مستهلكة تُصرف مرة، أو باقية في الحساب لا تنقص.
 * الافتراضي مستهلك لأن الدائم يجعل من جمع أكثر أقوى ممن لعب أحسن، لكن القرار
 * صار بيد صاحب السيرفر لا بيد من كتب الملف.
 */
type Tune = { price?: number; keep?: boolean }
type Tuning = Partial<Record<PerkKey, Tune>>

const TUNE_FILE = path.join(process.cwd(), 'data', 'shop-tuning.json')
let tuneCache: Tuning | null = null

function tuning(): Tuning {
  if (tuneCache) return tuneCache
  try {
    const parsed: unknown = JSON.parse(readFileSync(TUNE_FILE, 'utf8'))
    tuneCache = parsed && typeof parsed === 'object' ? (parsed as Tuning) : {}
  } catch {
    tuneCache = {}
  }
  return tuneCache
}

function saveTuning(next: Tuning): void {
  mkdirSync(path.dirname(TUNE_FILE), { recursive: true })
  const tmp = `${TUNE_FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  renameSync(tmp, TUNE_FILE)
  tuneCache = next
}

export function priceOf(perk: PerkKey): number {
  const set = tuning()[perk]?.price
  if (typeof set === 'number' && set >= 0) return set
  return PERKS.find((p) => p.key === perk)?.price ?? 0
}

/** true = تبقى في الحساب ولا تُصرف. */
export function keepOf(perk: PerkKey): boolean {
  return tuning()[perk]?.keep === true
}

export function setPrice(perk: PerkKey, price: number): void {
  const next = { ...tuning() }
  next[perk] = { ...next[perk], price: Math.max(0, Math.floor(price)) }
  saveTuning(next)
}

export function toggleKeep(perk: PerkKey): boolean {
  const next = { ...tuning() }
  const value = !keepOf(perk)
  next[perk] = { ...next[perk], keep: value }
  saveTuning(next)
  return value
}
