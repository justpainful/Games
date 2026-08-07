import type { GameDef } from '../games/define.ts'

/**
 * ما تدعمه الوصلة، وبأي عدد لاعبين تبدأ.
 *
 * كان هذا الملف قيدًا: قائمة بيضاء تمنع كل ما ليس لعبة كتابة، لأن وصلة واحدة
 * كانت تعني لاعبًا واحدًا. زال القيد — الغرف في `./rooms.ts` تجمع عدة وصلات
 * (وقناة ديسكورد معها) في طاولة واحدة، **فكل الأنماط تعمل من التطبيق**:
 * لوحة، مواجهة، عجلة، تصويت، أطوار، فرق، كتابة.
 *
 * بقي من الملف معناه الحقيقي وحده: **من يستطيع البدء وحيدًا**. لا شيء في
 * المحرّك يمنع لعبة من الدوران بلاعب واحد، لكن `players.min: 2` مكتوب في كل
 * لعبة تقريبًا كقاعدة لوبي («لا تبدأ سباقًا بشخص واحد»). ألعاب الكتابة تدور
 * بلاعب واحد بلا تعديل حرف: مشهد ← انتظار إجابة ← ترتيب نهائي. أما إكس أو
 * ومافيا والكراسي فتحتاج خصمًا حقيقيًا، فتنتظر اكتمال لوبي الغرفة.
 */
export const SOLO_KEYS: ReadonlySet<string> = new Set([
  // مبنية على `typing()` المشتركة حرفيًا
  'aalam',
  'aks',
  'arqam',
  'asraa',
  'awasim',
  'event',
  'fakek',
  'hisab',
  'jam3',
  'maarifa',
  'mufrad',
  'qara',
  'rakeb',
  // حلقات خاصة بنفس الشكل: مشهد ← انتظار إجابة ← ترتيب نهائي
  'huroof',
  'khammen',
])

export function isSoloable(key: string): boolean {
  return SOLO_KEYS.has(key)
}

/**
 * أقل عدد يبدأ به لوبي غرفة على الوصلة.
 *
 * ليس `players.min` دائمًا: تلك قاعدة لوبي ديسكورد حيث الجميع في قناة واحدة
 * ويُتوقَّع أن ينضمّوا. من يفتح لعبة كتابة من جواله وحده يجب أن يلعبها الآن.
 */
export function minPlayersOnSocket(game: GameDef): number {
  return isSoloable(game.key) ? 1 : game.players.min
}

/**
 * نمط اللعبة — يحدّد أي شاشة يفتحها التطبيق.
 *
 * يقابل `GameMode` في `ios/Games/Models/Catalog.swift` حرفًا بحرف؛ كان محسوبًا
 * في التطبيق وحده، فكانت لعبة جديدة تعني إصدارًا جديدًا من التطبيق. صار يأتي
 * من الخادم مع الكتالوج.
 */
export type GameMode = 'typing' | 'board' | 'duel' | 'wheel' | 'poll' | 'phase' | 'teams'

const MODES: Readonly<Record<string, GameMode>> = {
  // كتابة بجولات
  aalam: 'typing',
  aks: 'typing',
  arqam: 'typing',
  asraa: 'typing',
  awasim: 'typing',
  bomb: 'typing',
  event: 'typing',
  fakek: 'typing',
  hisab: 'typing',
  huroof: 'typing',
  jam3: 'typing',
  khammen: 'typing',
  kt: 'typing',
  maarifa: 'typing',
  mufrad: 'typing',
  qara: 'typing',
  rakeb: 'typing',
  // شبكة خانات
  eshbek: 'board',
  xo: 'board',
  // مواجهة ثنائية
  hajra: 'duel',
  nard: 'duel',
  // عجلة
  roulette: 'wheel',
  // تصويت
  tasweet: 'poll',
  // أطوار
  hide: 'phase',
  karasi: 'phase',
  mafia: 'phase',
  // تقسيم فرق
  ghuraf: 'teams',
}

/** الافتراضي `typing` — لعبة جديدة بلا سطر هنا تفتح شاشة الكتابة لا شاشة فارغة. */
export function modeOf(key: string): GameMode {
  return MODES[key] ?? 'typing'
}
