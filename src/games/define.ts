import type { GameBrief, PlayerView, Scene } from '../scenes/scene.ts'

/**
 * تعريف اللعبة.
 *
 * اللعبة لا تعرف ديسكورد ولا الصور. تتكلّم مع `Table` وحده، وهو واجهة مجرّدة
 * ينفّذها سطح العرض. اليوم ينفّذها ديسكورد، وغدًا ينفّذها تطبيق الجوال بلا
 * تعديل حرف واحد في أي لعبة. قاعدة ESLint تفرض هذا ولا تتركه للانضباط.
 */

export type ChatInput = { userId: string; text: string }
export type Press = {
  userId: string
  id: string
  /**
   * مقبض معتم يمسك بالتفاعل الذي وُلدت منه هذه الضغطة، تستعمله `reveal` وحدها.
   *
   * اللعبة لا تفتحه ولا تعرف ما بداخله، وهو موجود لأن الرسالة المخفية داخل
   * القناة لا تُرسَل ابتداءً في ديسكورد: هي ردّ على تفاعل بعينه، فيلزم الإمساك
   * به. وعمره قصير، فديسكورد يُبطل التفاعل بعد ربع ساعة.
   */
  ticket?: string
}

export type ButtonStyle = 'start' | 'join' | 'stop' | 'plain'
export type ButtonDef = {
  id: string
  label: string
  style?: ButtonStyle
  disabled?: boolean
  /**
   * أي صف يجلس فيه الزر. بلا هذا تُرصّ الأزرار خمسة في الصف.
   *
   * ديسكورد يسمح بخمسة صفوف في خمسة أزرار، فشبكة 3×3 ممكنة تمامًا. لكن الرصّ
   * التلقائي يخرج التسعة صفّين (5+4) فتُقرأ شريطين لا شبكة، وهو ما دفع اللعبة
   * إلى ترقيم الخانات أصلًا. هذا الحقل يجعل اللعبة تقول شكل شبكتها.
   */
  row?: number
  /** إيموجي مخصّص بصيغة `<:name:id>`، يظهر على الزر بدل النص أو معه. */
  emoji?: string
}

export type ShowOptions = {
  /** نص يرافق الصورة — إلزامي للحالات الحرجة (DESIGN.md §6) */
  text?: string
  buttons?: ButtonDef[]
}

export type Table = {
  /** بطاقة اللعبة كما تظهر في المشاهد — تُغني عن تمرير الاسم في كل مشهد */
  brief: GameBrief
  /** اللاعبون بعد اكتمال اللوبي. لا يتغيّر أثناء اللعبة إلا عبر `drop`. */
  players: PlayerView[]
  host: PlayerView

  /** يرسل مشهدًا جديدًا. */
  show(scene: Scene, opts?: ShowOptions): Promise<void>
  /** يحدّث آخر مشهد مُرسل بدل إغراق القناة برسائل. */
  update(scene: Scene, opts?: ShowOptions): Promise<void>
  /** نص وحده، للإعلانات القصيرة. */
  say(text: string): Promise<void>
  /** رسالة خاصة للاعب — تُستخدم لتوزيع الأدوار في مافيا. */
  whisper(userId: string, text: string): Promise<boolean>

  /**
   * مشهد يراه ضاغط الزر وحده، **في نفس القناة** لا في الخاص.
   *
   * الفرق عن `whisper` ليس في الوجهة بل في ما يصلح له كلٌّ منهما. الهمس نصّ
   * يُرسل متى شئنا، وهذا صورة تُعرض بجوار المشهد العام فتُقارن به بلا تنقّل.
   * وهو ما يحتاجه لوح سيّد التجسّس: كلماته هي كلمات اللوح نفسها وقد لُوّنت،
   * فقراءته في نافذة أخرى تُفقده معناه. وكذلك يد اللاعب في لعبة أوراق.
   *
   * ويحلّ عيبًا في الهمس أيضًا: كثيرون يقفلون الخاص، فتسقط رسالة الدور بصمت.
   *
   * ويُشترط أن ينبع من ضغطة زر: الرسالة المخفية ردٌّ على تفاعل ولا تُبتدأ.
   */
  reveal(press: Press, scene: Scene, opts?: ShowOptions): Promise<boolean>

  /** أول رسالة شات تحقق الشرط، أو null عند انتهاء المهلة. */
  waitChat(ms: number, test?: (input: ChatInput) => boolean): Promise<ChatInput | null>
  /**
   * يجمع كل من أجاب خلال المدة، إجابة واحدة لكل لاعب.
   * تحتاجه ألعاب الإقصاء: «من لم يجب يخرج» يستلزم معرفة الجميع لا الأول فقط.
   */
  collectChat(ms: number, test?: (input: ChatInput) => boolean): Promise<ChatInput[]>
  /** أول ضغطة زر على آخر مشهد، أو null عند انتهاء المهلة. */
  waitPress(ms: number, test?: (press: Press) => boolean): Promise<Press | null>
  /** يجمع كل الضغطات خلال المدة — للتصويت. */
  collectPresses(ms: number, test?: (press: Press) => boolean): Promise<Press[]>

  sleep(ms: number): Promise<void>

  /** يخرج لاعبًا (انسحب أو أُقصي). */
  drop(userId: string): void
  /** صار true عند إيقاف اللعبة إداريًا — كل حلقة يجب أن تفحصه. */
  readonly aborted: boolean
}

export type GameResult = {
  /** الفائز الأوحد إن وُجد */
  winnerId?: string | null
  /** نقاط تُضاف لكل لاعب */
  scores?: Map<string, number>
}

export type GameDef = {
  key: string
  /** الاسم العربي — هو أيضًا اسم الأمر */
  name: string
  aliases?: string[]
  tagline: string
  howTo: string
  players: { min: number; max: number }
  /** أي محفظة نقاط تُغذّيها هذه اللعبة */
  wallet: 'solo' | 'team' | 'roulette'
  play(table: Table): Promise<GameResult>
}

/** لا تفعل شيئًا سوى تثبيت الأنواع — القيمة في أن كل لعبة تُكتب بنفس الشكل. */
export function defineGame(def: GameDef): GameDef {
  if (def.players.min < 1) throw new Error(`${def.key}: أقل عدد لاعبين لا يقل عن 1`)
  if (def.players.max < def.players.min) throw new Error(`${def.key}: الحد الأقصى أقل من الأدنى`)
  return def
}

/** يبني خريطة نقاط فارغة لكل اللاعبين — يوفّر تكرارها في كل لعبة. */
export function zeroScores(players: PlayerView[]): Map<string, number> {
  return new Map(players.map((p) => [p.id, 0]))
}
