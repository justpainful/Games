/**
 * توكنات التصميم — المصدر الوحيد لكل قيمة بصرية في المشروع.
 * مشتقة حرفيًا من DESIGN.md. أي تعديل يبدأ هناك ثم ينزل هنا.
 *
 * هذا الملف كائنات TypeScript خالصة بلا أي اعتماد خارجي، لأن
 * تطبيق الجوال سيستهلكه كما هو بينما يستهلكه الويب كـ CSS variables.
 */

export const color = {
  /** رمل دافئ — خلفية المشهد. أعمق من الأسطح عمدًا فتطفو البطاقات فوقه. */
  paper: '#EFE3CB',
  /** رمل أعمق — كتل الخلفية العضوية وحدها. لا يحمل نصًا أبدًا. */
  paperTint: '#E6D8BC',
  /** كريمي فاتح — سطح البطاقات. أفتح من الخلفية، عكس علاقة المرجع. */
  surface: '#FBF5E8',
  ink: '#1A1512',
  red: '#E03A2F',
  /** أحمر غامق — يُستخدم ظلًا تحت الأصفر، وهو موضع اندماج اللونين. */
  redDeep: '#A8231A',
  yellow: '#FBBF1E',
  cream: '#FFFDF7',
} as const

/** النص الذي يُقرأ فوق كل لون. لا يُختار بالحدس — التباين محسوب في DESIGN.md §3. */
export const onColor = {
  paper: color.ink,
  paperTint: color.ink,
  surface: color.ink,
  ink: color.cream,
  red: color.cream,
  redDeep: color.cream,
  /** ink لا أبيض — الأصفر فاتح ولا يحمل نصًا فاتحًا */
  yellow: color.ink,
  cream: color.ink,
} as const

export const font = {
  display: "'Baloo Bhaijaan 2'",
  body: "'Cairo'",
} as const

/**
 * المقياس بعرض مشهد 1180px.
 *
 * ————————————————— لماذا كبر المقياس وضاقت اللوحة —————————————————
 *
 * المشهد كان 1500 بكسل والنصّ 26، وذلك يُقرأ جيدًا في ملف مفتوح على شاشة.
 * لكن ديسكورد يعرض الصورة المرفقة بنحو 550 بكسل داخل الرسالة، فالنسبة 0.37
 * والنصّ يصل العين عند **عشرة بكسلات**. فالصورة التي بدت متّزنة عندنا كانت
 * تُقرأ بالتكبير عند من يلعب.
 *
 * والعلاج طرفان معًا لأن أحدهما وحده لا يكفي: ضيّقنا اللوحة فقلّ التصغير الذي
 * يفرضه ديسكورد، وكبّرنا الخط فوق ذلك. وحاصلهما نحو **ضعف** الحجم المقروء.
 *
 * وتضييق اللوحة يخدم عيبًا ثانيًا شكا منه: الفراغ. مساحة أوسع من محتواها
 * تُملأ هواءً، فالضيق يقارب العناصر بعضها من بعض بلا تصغير أيّ منها.
 */
export const size = {
  /** اسم اللعبة — أثقل وأكبر من المرجع ليحمل المشهد وحده بعد حذف الشعار */
  display: 88,
  title: 44,
  body: 32,
  label: 30,
  meta: 25,
} as const

export const weight = {
  regular: 400,
  medium: 500,
  bold: 700,
  black: 800,
} as const

/**
 * الحد والظل هما التوقيع (DESIGN.md §5): قصاصة ورقية مقصوصة ومرفوعة.
 * الظل صلب بلا blur، واتجاهه يسار-أسفل ليتبع اتجاه القراءة RTL.
 */
export const stroke = {
  thin: 3,
  base: 5,
  thick: 8,
} as const

/** ظلال أثقل من المرجع — القصاصة مرفوعة أعلى عن الورقة فتزيد الجرأة. */
export const lift = {
  sm: 7,
  base: 11,
  lg: 15,
} as const

export const radius = {
  sm: 14,
  base: 24,
  lg: 34,
  pill: 999,
} as const

export const space = {
  xs: 10,
  sm: 18,
  base: 28,
  lg: 44,
  xl: 64,
} as const

/** أبعاد المشهد الافتراضية. الرندر يضاعفها بـ deviceScaleFactor. */
export const scene = {
  width: 1180,
  /** الارتفاع يتمدد مع المحتوى — هذا حد أدنى لا سقف. */
  minHeight: 640,
} as const

/** العربية تحتاج مساحة رأسية أكبر — لا ينزل تحت 1.7 (DESIGN.md §4). */
export const leading = {
  tight: 1.7,
  base: 1.8,
} as const

const cssVars: Record<string, string | number> = {
  ...Object.fromEntries(Object.entries(color).map(([k, v]) => [`color-${kebab(k)}`, v])),
  ...Object.fromEntries(Object.entries(onColor).map(([k, v]) => [`on-${kebab(k)}`, v])),
  'font-display': font.display,
  'font-body': font.body,
  ...Object.fromEntries(Object.entries(size).map(([k, v]) => [`size-${k}`, `${v}px`])),
  ...Object.fromEntries(Object.entries(weight).map(([k, v]) => [`weight-${k}`, v])),
  ...Object.fromEntries(Object.entries(stroke).map(([k, v]) => [`stroke-${k}`, `${v}px`])),
  ...Object.fromEntries(Object.entries(lift).map(([k, v]) => [`lift-${k}`, `${v}px`])),
  ...Object.fromEntries(Object.entries(radius).map(([k, v]) => [`radius-${k}`, `${v}px`])),
  ...Object.fromEntries(Object.entries(space).map(([k, v]) => [`space-${k}`, `${v}px`])),
  'leading-tight': leading.tight,
  'leading-base': leading.base,
  'scene-width': `${scene.width}px`,
  'scene-min-height': `${scene.minHeight}px`,
}

function kebab(s: string): string {
  return s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
}

/** يولّد كتلة :root — تُحقن في الصفحة مرة واحدة فلا تتفرّق القيم بين TS و CSS. */
export function cssVariables(): string {
  const lines = Object.entries(cssVars).map(([k, v]) => `  --${k}: ${v};`)
  return `:root {\n${lines.join('\n')}\n}`
}
