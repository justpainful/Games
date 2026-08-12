/**
 * عقد المشهد — يصف *ما يجب عرضه*، لا كيف يُرسم.
 *
 * هذا هو الفاصل الوحيد في المشروع: ديسكورد يحوّل المشهد إلى PNG،
 * وتطبيق الجوال لاحقًا يرسم نفس الكائن مكوّنات أصلية. لذلك ممنوع
 * في هذا الملف أي إشارة لديسكورد أو Playwright أو HTML.
 */

/** لاعب كما يُعرض — لا كائن ديسكورد، فقط ما تحتاجه الصورة. */
export type PlayerView = {
  id: string
  name: string
  /** data: URI جاهز للعرض. يُحضّره سطح العرض قبل بناء المشهد. */
  avatar: string | null
}

export type GameBrief = {
  key: string
  /** اسم اللعبة بالعربي كما يظهر في الرأس */
  name: string
  /** سطر واحد يصف اللعبة */
  tagline: string
  /** شرح القواعد — يظهر أسفل مشهد اللوبي */
  howTo: string
}

export type Scene =
  | LobbyScene
  | RoundScene
  | StandingsScene
  | BoardScene
  | DuelScene
  | WheelScene
  | RolesScene
  | HuntScene
  | PollScene
  | ProfileScene
  | CardScene
  | LeadersScene
  | PanelScene
  | NoticeScene

/**
 * بطاقة اللاعب: هويته، وخريطة نشاطه، وأربعة أرقام تلخّصه.
 *
 * مشهد مستقل عن `profile` لا بديل عنه. `profile` جواب سؤال «كم نقطة عندي؟»
 * ويُقرأ في لمحة، وهذه جواب «من أنا في هذا السيرفر؟» وتُقرأ مرة وتُحفظ.
 * دمجهما يعني مشهدًا يخدم سؤالين فلا يخدم أيًّا منهما.
 */
export type CardScene = {
  kind: 'card'
  player: PlayerView
  /** يومٌ لكل خانة، الأقدم أولًا. العدد كم لعبة لُعبت في ذلك اليوم. */
  days: { date: string; games: number }[]
  /** أربع خانات أسفل الخريطة: رقم كبير وتسمية تحته. */
  stats: { value: string; label: string }[]
}

/** شاشة الانتظار: من انضم، ومن يبدأ، وكيف تدخل. */
export type LobbyScene = {
  kind: 'lobby'
  game: GameBrief
  host: PlayerView | null
  players: PlayerView[]
  min: number
  max: number
}

/** جولة سؤال في ألعاب الكتابة. */
export type RoundScene = {
  kind: 'round'
  game: GameBrief
  prompt: string
  /** تلميح اختياري تحت السؤال (مثل عدد الحروف) */
  hint?: string
  index: number
  total: number
}

/** الترتيب بعد الجولة أو في نهاية اللعبة. */
export type StandingsScene = {
  kind: 'standings'
  game: GameBrief
  rows: { player: PlayerView; score: number }[]
  /** عنوان بديل، مثل «النتيجة النهائية» */
  heading?: string
}

/** لوحة خانات — إكس أو، أربعة في صف. */
export type BoardScene = {
  kind: 'board'
  game: GameBrief
  /** الخانات بالترتيب؛ null = فارغة */
  cells: (string | null)[]
  cols: number
  /** لاعب لكل رمز، لعرض من يلعب بماذا */
  sides: { mark: string; player: PlayerView }[]
  turnOf?: PlayerView | null
  /** فهارس الخانات الفائزة، تُبرز عند النهاية */
  winning?: number[]
  note?: string
}

/** مواجهة ثنائية — حجرة ورقة مقص، نرد. */
export type DuelScene = {
  kind: 'duel'
  game: GameBrief
  left: { player: PlayerView; label: string; score?: number }
  right: { player: PlayerView; label: string; score?: number }
  /** نص المنتصف: «مواجهة»، «فاز»، النتيجة */
  verdict?: string
  round?: { index: number; total: number }
}

/** عجلة الروليت بأسماء اللاعبين. */
export type WheelScene = {
  kind: 'wheel'
  game: GameBrief
  players: PlayerView[]
  picked?: PlayerView | null
  note?: string
}

/** طور في لعبة أدوار — مافيا. */
export type RolesScene = {
  kind: 'roles'
  game: GameBrief
  phase: 'night' | 'day' | 'result'
  headline: string
  detail?: string
  alive: PlayerView[]
  dead?: PlayerView[]
  /** لاعب محوري في هذا الطور (الضحية، المتّهم) */
  spotlight?: PlayerView | null
}

/** شبكة بحث — لعبة هايد. */
export type HuntScene = {
  kind: 'hunt'
  game: GameBrief
  /** أرقام الخانات المتاحة */
  total: number
  /** الخانات المستبعدة */
  cleared: number[]
  seeker?: PlayerView | null
  headline: string
  note?: string
}

/** تصويت مفتوح. */
export type PollScene = {
  kind: 'poll'
  game: GameBrief
  question: string
  options: { id: string; label: string; votes: number; player?: PlayerView | null }[]
  totalVotes: number
  note?: string
}

/** شاشة «نقاطي». */
export type ProfileScene = {
  kind: 'profile'
  player: PlayerView
  roulette: number
  team: number
  solo: number
  total: number
  gamesPlayed: number
  wins: number
  rank?: number | null
}

/** لوحة الصدارة. */
export type LeadersScene = {
  kind: 'leaders'
  title: string
  rows: { player: PlayerView; points: number }[]
}

/** لوحة إعدادات — عنوان وقائمة بنود بحالتها. */
export type PanelScene = {
  kind: 'panel'
  title: string
  subtitle?: string
  items: { label: string; value: string; on?: boolean }[]
  footer?: string
}

/** بطاقة رسالة عامة — نجاح، خطأ، إعلان. */
export type NoticeScene = {
  kind: 'notice'
  tone: 'ok' | 'warn' | 'info'
  title: string
  body?: string
}

/** كل قالب مشهد هو دالة نقية من المشهد إلى HTML. */
export type Template<S extends Scene> = (scene: S) => string
