/**
 * كاش صغير بعمر محدّد.
 *
 * لوحة الصدارة تعرض خمسة وعشرين صفًا، وكل صف يحتاج اسمًا وأفتارًا من ديسكورد.
 * بلا كاش يعني ذلك خمسة وعشرين طلبًا لكل فتح شاشة، ومعها 429 خلال دقائق.
 */
export class TtlCache<V> {
  private readonly entries = new Map<string, { value: V; expires: number }>()
  private readonly max: number
  private readonly ttlMs: number

  constructor(max: number, ttlMs: number) {
    this.max = max
    this.ttlMs = ttlMs
  }

  get(key: string): V | undefined {
    const hit = this.entries.get(key)
    if (!hit) return undefined
    if (hit.expires <= Date.now()) {
      this.entries.delete(key)
      return undefined
    }
    // إعادة الإدراج تنقل المفتاح لآخر الترتيب — Map تحفظ ترتيب الإدراج فيصير LRU
    this.entries.delete(key)
    this.entries.set(key, hit)
    return hit.value
  }

  set(key: string, value: V): void {
    if (!this.entries.has(key) && this.entries.size >= this.max) {
      const oldest = this.entries.keys().next().value
      if (oldest !== undefined) this.entries.delete(oldest)
    }
    this.entries.set(key, { value, expires: Date.now() + this.ttlMs })
  }

  forget(key: string): void {
    this.entries.delete(key)
  }
}

/**
 * يمنع ازدواج الطلب نفسه على الطيران.
 *
 * صفوف الصدارة تُجلب بالتوازي، وقد يتكرر نفس اللاعب في أكثر من محفظة؛ بلا هذا
 * يخرج طلبان متطابقان لديسكورد في نفس اللحظة لأن الكاش لم يمتلئ بعد.
 */
export function once<V>(
  pending: Map<string, Promise<V>>,
  key: string,
  make: () => Promise<V>,
): Promise<V> {
  const running = pending.get(key)
  if (running) return running

  const started = make().finally(() => pending.delete(key))
  pending.set(key, started)
  return started
}
