import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import type { GameDef } from './define.ts'

const here = path.dirname(fileURLToPath(import.meta.url))

/**
 * يكتشف الألعاب تلقائيًا: كل مجلد داخل `games/` فيه `game.ts` هو لعبة.
 *
 * البديل — قائمة تسجيل يدوية — يعني أن إضافة لعبة تتطلب تعديل ملفين، وأن
 * نسيان السطر الثاني يجعل اللعبة موجودة وغير قابلة للتشغيل بلا خطأ ظاهر.
 */
export async function loadGames(): Promise<GameDef[]> {
  const entries = await fs.readdir(here, { withFileTypes: true })
  const games: GameDef[] = []

  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const file = path.join(here, entry.name, 'game.ts')
    try {
      await fs.access(file)
    } catch {
      continue // مجلد بيانات بلا لعبة — طبيعي
    }

    const mod: unknown = await import(pathToFileURL(file).href)
    const def = (mod as { default?: GameDef }).default
    if (!def?.key) {
      console.warn(`تجاهلت ${entry.name}: ما صدّر defineGame كـ default`)
      continue
    }
    games.push(def)
  }

  const keys = new Set<string>()
  for (const g of games) {
    if (keys.has(g.key)) throw new Error(`مفتاح لعبة مكرّر: ${g.key}`)
    keys.add(g.key)
  }

  return games.sort((a, b) => a.key.localeCompare(b.key))
}
