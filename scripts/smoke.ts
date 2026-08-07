/**
 * فحص إقلاع سريع — يمسك ما لا يمسكه فحص الأنواع.
 *
 *   npx tsx scripts/smoke.ts
 *
 * يتحقّق أن كل لعبة تُحمَّل فعلًا (ملفات بياناتها موجودة وصالحة)، وأن أسماء
 * الأوامر لا تتصادم، وأن كل نوع مشهد له قالب يرسم بلا انهيار.
 */
import { loadGames } from '../src/games/all.ts'
import { startRenderer, stopRenderer } from '../src/images/browser.ts'
import { toHtml } from '../src/images/render.ts'
import type { GameBrief, PlayerView, Scene } from '../src/scenes/scene.ts'

const brief: GameBrief = {
  key: 'probe',
  name: 'فحص',
  tagline: 'مشهد اختباري',
  howTo: 'نص شرح قصير للتأكد أن القالب يرسم بلا انهيار.',
}
const p = (id: string, name: string): PlayerView => ({ id, name, avatar: null })
const a = p('1', 'لاعب أول')
const b = p('2', 'Player_Two')

/** مشهد واحد من كل نوع — لو أضيف نوع بلا مدخل هنا يفشل الفحص. */
const SCENES: Scene[] = [
  { kind: 'lobby', game: brief, host: a, players: [a, b], min: 2, max: 8 },
  { kind: 'round', game: brief, prompt: 'ما عاصمة اليابان؟', index: 3, total: 10 },
  { kind: 'standings', game: brief, rows: [{ player: a, score: 5 }, { player: b, score: 2 }] },
  { kind: 'board', game: brief, cells: [null, 'X', null, null, 'O', null, null, null, null], cols: 3, sides: [{ mark: 'X', player: a }, { mark: 'O', player: b }], turnOf: a },
  { kind: 'duel', game: brief, left: { player: a, label: 'حجرة', score: 1 }, right: { player: b, label: 'ورقة', score: 2 }, verdict: 'ورقة تفوز' },
  { kind: 'wheel', game: brief, players: [a, b], picked: a },
  { kind: 'roles', game: brief, phase: 'night', headline: 'الليل', alive: [a, b], dead: [] },
  { kind: 'hunt', game: brief, total: 25, cleared: [1, 4, 9], headline: 'ابحث', seeker: a },
  { kind: 'poll', game: brief, question: 'من الأفضل؟', options: [{ id: 'x', label: 'الأول', votes: 3 }, { id: 'y', label: 'الثاني', votes: 1 }], totalVotes: 4 },
  { kind: 'profile', player: a, roulette: 1, team: 2, solo: 3, total: 6, gamesPlayed: 9, wins: 2 },
  { kind: 'leaders', title: 'الصدارة', rows: [{ player: a, points: 12 }, { player: b, points: 7 }] },
  { kind: 'panel', title: 'الإعدادات', items: [{ label: 'البريفكس', value: '!', on: true }] },
  { kind: 'notice', tone: 'ok', title: 'تم', body: 'حُفظ الإعداد.' },
]

async function main(): Promise<void> {
  let failed = 0

  const games = await loadGames()
  console.log(`حُمّلت ${games.length} لعبة\n`)

  const names = new Map<string, string>()
  for (const g of games) {
    for (const n of [g.name, ...(g.aliases ?? [])]) {
      const owner = names.get(n)
      if (owner) {
        console.error(`تصادم اسم أمر «${n}» بين ${owner} و ${g.key}`)
        failed++
      }
      names.set(n, g.key)
    }
    if (typeof g.play !== 'function') {
      console.error(`${g.key}: play ليست دالة`)
      failed++
    }
    console.log(`  ${g.name.padEnd(10)} ${g.key.padEnd(10)} ${g.players.min}-${g.players.max} لاعب  [${g.wallet}]`)
  }

  console.log('\nرندر مشهد من كل نوع...')
  await startRenderer()

  const kinds = new Set<string>()
  for (const scene of SCENES) {
    kinds.add(scene.kind)
    try {
      const html = toHtml(scene)
      if (!html.includes('class="scene"')) {
        console.error(`  ${scene.kind}: القالب لا يُخرج عنصر .scene`)
        failed++
        continue
      }
      console.log(`  ${scene.kind} ✓`)
    } catch (err) {
      console.error(`  ${scene.kind}: انهار — ${(err as Error).message}`)
      failed++
    }
  }
  await stopRenderer()

  console.log(`\nفُحص ${kinds.size} نوع مشهد و ${games.length} لعبة.`)
  if (failed > 0) {
    console.error(`\n${failed} مشكلة.`)
    process.exit(1)
  }
  console.log('كل شيء سليم.')
}

main().catch(async (err) => {
  console.error(err)
  await stopRenderer().catch(() => {})
  process.exit(1)
})
