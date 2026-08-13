/**
 * يرسم إيموجيات البوت ويرفعها إلى التطبيق، ويولّد خريطة معرّفاتها.
 *
 *   npm run gen:emojis           يرسم ويرفع ويكتب src/design/emoji.ts
 *   npm run gen:emojis -- --dry  يرسم إلى out/emoji/ ولا يرفع ولا يكتب
 *
 * إيموجيات ديسكورد القياسية يرسمها كل نظام تشغيل بأسلوبه، فالزر الواحد يخرج
 * بثلاثة أشكال عند ثلاثة لاعبين. وهذا ما يمنعه `src/design/icons.ts` داخل
 * المشاهد؛ الأزرار كانت الثغرة الباقية.
 *
 * ————————————————————— لماذا كل إيموجي على قرص —————————————————————
 *
 * المشكلة التي تحكم التصميم هنا ليست الشكل بل **الخلفية**. ديسكورد يعرض
 * الإيموجي على ثيم المستخدم: فاتح، غامق، أونيكس شبه أسود، وثيمات ملوّنة
 * يختارها هو. ورسمٌ بلون واحد بلا أرضية يذوب في الثيم الذي يوافق لونه:
 * الأسود يختفي على الغامق، والكريمي يختفي على الفاتح.
 *
 * فكل إيموجي هنا **قرص يحمل أرضيته معه**: تعبئة كريمية، وحدّ حبر سميك حولها،
 * والرمز فوقها. القرص يفصل الرمز عن أي خلفية مهما كان لونها، وهو نفسه لغة
 * DESIGN.md §2: قصاصة مقصوصة لها حدّ أسود.
 *
 * والحدّ الخارجي كريمي فوق الحبر: على ثيم شبه أسود يصير الحدّ الأسود وحده
 * غير مرئي، فالحلقة الفاتحة حوله هي ما يبقي حافة القرص مقروءة هناك.
 *
 * ————————————————————— لماذا الطقم بهذا الحجم —————————————————————
 *
 * الطقم مبني على ثلاث مفردات فقط: ستٌّ وعشرون أيقونة من `icons.ts`، وخمسة
 * ألوان من `tokens.ts`، وخطّ المشروع. وكل ما تحته مشتقّ منها بالتركيب لا
 * بالابتكار، فلا يدخل الطقم شكل لم يمرّ على نظام التصميم.
 *
 * والأرضية تحمل معنى ثابتًا في الطقم كلّه، وهذا ما يجعل مئتي إيموجي قابلة
 * للحفظ: **حبر** حالة محايدة، و**أصفر** حالة مُنجزة أو مختارة، و**أحمر**
 * حالة خطر أو خطأ. فاللاعب يقرأ اللون قبل أن يقرأ الرمز.
 *
 * ————————————————————————— المقاس —————————————————————————
 *
 * 256×256. ديسكورد يعرض الإيموجي بـ32 بكسل في السطر، و48 في اللوحة، وحتى 160
 * حين يكون وحده في الرسالة. و256 تكفي كل ذلك على شاشات الرتينا بلا تنعيم،
 * وتبقى تحت سقف 256 كيلوبايت بمراحل لأن الرسم مسطّح.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { PATHS, type IconName } from '../src/design/icons.ts'
import { ARABIC } from '../src/design/letters.ts'
import { color, font } from '../src/design/tokens.ts'
import { shoot, startRenderer, stopRenderer } from '../src/images/browser.ts'
import { settings } from '../src/settings.ts'

const DRY = process.argv.includes('--dry')
/** `--only=num_3,num_5` يرفع المذكورين وحدهم — إصلاح ما تعثّر بلا إعادة الطقم. */
const ONLY = (process.argv.find((a) => a.startsWith('--only='))?.slice('--only='.length) ?? '')
  .split(',')
  .filter(Boolean)
const OUT = path.join(process.cwd(), 'out', 'emoji')
const MAP = path.join(process.cwd(), 'src', 'design', 'emoji.ts')

/** تحت deviceScaleFactor 2 يخرج 256 بكسل. */
const PX = 128

type Face = { name: string; body: string }

/**
 * لون الهالة: عكس درجة الرمز.
 *
 * هذه هي القاعدة التي تُغني عن اللوحة تحت الرمز. الرمز الغامق يحمل هالة فاتحة
 * فيُرى على الثيم الغامق، والرمز الفاتح يحمل هالة غامقة فيُرى على الفاتح. وأيًّا
 * كان ثيم اللاعب فإحدى الطبقتين تباينه، فيبقى الشكل مقصوصًا بلا مربّع حوله.
 */
function halo(core: string): string {
  return core === color.yellow || core === color.cream ? color.ink : color.cream
}

/**
 * الرمز بلا أرضية، تفصله عن الثيم هالةٌ حوله.
 *
 * كان كل إيموجي على قرص كريمي بحدّ حبري، وذلك يحلّ التباين حلًّا مضمونًا لكنه
 * يعطي طقمًا من المربّعات: يظهر القرص قبل الرمز، ويكبر الإطار على حساب ما
 * بداخله. والهالة تشتري التباين نفسه تقريبًا وتترك الشكل مقصوصًا كما ينبغي
 * للإيموجي أن يكون.
 *
 * وحين تسقط اللوحة يسقط معها هامشها، فالرمز يكبر: النسبة 3.6 بدل 3.15.
 */
function outlined(inner: (stroke: string, width: number) => string, core: string): string {
  return `${inner(halo(core), 5.2)}${inner(core, 2.9)}`
}

/** أيقونة من `design/icons.ts`. الأصل شبكة 24 بخط 2.4. */
function iconFace(name: IconName, core: string): string {
  return outlined(
    (stroke, width) => `
      <g transform="translate(50 50) scale(4.05) translate(-12 -12)"
         fill="none" stroke="${stroke}" stroke-width="${width}"
         stroke-linecap="round" stroke-linejoin="round">
        ${PATHS[name]}
      </g>`,
    core,
  )
}

/**
 * نصّ كريمي على قرص حبري.
 *
 * كان حبرًا على كريمي بحجم 52، فخرج رماديًا غير مقروء عند 32 بكسل. الأبيض
 * على الغامق أعلى تباينًا من العكس عند المقاسات الصغيرة، والحجم تضاعف تقريبًا.
 *
 * والقرص الحبري يفيد معنًى أيضًا: الخانة الفارغة غامقة والمختارة صفراء، فيُقرأ
 * الفرق قبل قراءة الرمز نفسه.
 */
/**
 * حرف أو رقم بهالته.
 *
 * `paint-order="stroke"` يرسم الحدّ تحت التعبئة لا فوقها، وبدونه تأكل الهالةُ
 * نصفَ سُمك الحرف من الداخل فيرقّ الحرف كلّما غلظت هالته.
 */
function glyph(text: string, core: string, size: number): string {
  // direction:ltr لازم لا تجميل: النصّ هنا عربيّ السياق، فـ«1+» تخرج «+1»
  // معكوسة بقاعدة الاتجاه الثنائي. الرقم والعلامة معًا رمز رياضي لا جملة.
  return `<text x="50" y="54" text-anchor="middle" dominant-baseline="central"
           style="direction:ltr;unicode-bidi:bidi-override"
           font-family="${font.display}" font-size="${size}" font-weight="800"
           paint-order="stroke" stroke="${halo(core)}" stroke-width="16"
           stroke-linejoin="round" fill="${core}">${text}</text>`
}

/**
 * الرقم يحتمل خطًّا أعرض من الحرف العربي، والحرف يحتاج هامشًا لنزوله.
 * ورقمان يضيقان بالمربّع عند 92، فالحجم يتبع عدد الخانات لا الثابت.
 */
const digit = (n: number, core: string) => glyph(String(n), core, n > 9 ? 88 : 122)
/**
 * الحروف العربية تتفاوت عرضًا تفاوتًا كبيرًا: «ا» شرطة و«س» ثلاث أسنان.
 * فحجم واحد يناسب الضيّق يقصّ الواسع، وقد قُصّت «س» عند 104 فخرجت مشوّهة.
 * والحجم هنا يتبع أعرضها لا أضيقها، فالقصّ عيب والصِّغَر ليس كذلك.
 */
const WIDE = new Set(["س", "ش", "ص", "ض", "ط", "ظ", "ع", "غ", "م", "ه"])
const letter = (ch: string, core: string) => glyph(ch, core, WIDE.has(ch) ? 84 : 104)

/**
 * وجه نرد بنقاطه لا برقمه.
 *
 * الرقم مقروء، لكن وجه النرد يُعرف بلمحة بلا قراءة، وهذا فارق حقيقي في لعبة
 * يتتابع فيها الرمي. والمواضع السبعة هي شبكة النرد المعروفة، والوجه يختار منها.
 */
const PIPS: Record<number, readonly [number, number][]> = {
  1: [[50, 50]],
  2: [
    [32, 32],
    [68, 68],
  ],
  3: [
    [32, 32],
    [50, 50],
    [68, 68],
  ],
  4: [
    [32, 32],
    [68, 32],
    [32, 68],
    [68, 68],
  ],
  5: [
    [32, 32],
    [68, 32],
    [50, 50],
    [32, 68],
    [68, 68],
  ],
  6: [
    [32, 30],
    [68, 30],
    [32, 50],
    [68, 50],
    [32, 70],
    [68, 70],
  ],
}

/**
 * وجه النرد مربّع بطبيعته، فالمربّع هنا هو الحجر لا لوحة تحته. وهذا الفرق هو
 * ما يجعله مقبولًا بينما اللوحة تحت كل رمز ليست كذلك.
 */
function diceFace(n: number): string {
  const pips = (PIPS[n] ?? [])
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="9.5" fill="${color.cream}"/>`)
    .join('')
  return `<rect x="4" y="4" width="92" height="92" rx="20"
            fill="${color.ink}" stroke="${color.cream}" stroke-width="6"/>${pips}`
}

/** الأيقونة مدارة بزاوية — أربعة اتجاهات من مسار واحد. */
function turned(name: IconName, deg: number, core: string): string {
  return outlined(
    (stroke, width) => `
      <g transform="translate(50 50) rotate(${deg}) scale(4.05) translate(-12 -12)"
         fill="none" stroke="${stroke}" stroke-width="${width}"
         stroke-linecap="round" stroke-linejoin="round">
        ${PATHS[name]}
      </g>`,
    core,
  )
}

/**
 * شريط تقدّم من خمس درجات — أرباع لا نسبة مئوية، فالعين تقرأ الامتلاء.
 *
 * كان أربع خانات منفصلة، وذلك يعمل على شاشة كبيرة ويسقط عند 32 بكسل: عرض
 * الخانة يصير بكسلين ونصفًا فتُقرأ الأربع خدوشًا لا شريطًا. الشريط الواحد
 * بطول تعبئة متغيّر يبقى مقروءًا لأن العين تقيس نسبة لا تعدّ خانات.
 */
function bar(filled: number): string {
  const x = 4
  const full = 92
  const width = Math.max((full * filled) / 4, 30)
  return `<rect x="${x}" y="28" width="${full}" height="44" rx="22"
           fill="${color.ink}" stroke="${color.cream}" stroke-width="6"/>
     ${filled > 0 ? `<rect x="${x}" y="28" width="${width}" height="44" rx="22"
           fill="${color.yellow}" stroke="${color.cream}" stroke-width="6"/>` : ''}`
}

/**
 * وجه لكل لعبة.
 *
 * المفردات ستٌّ وعشرون أيقونة والألعاب سبع وعشرون، فبعض الأيقونات تتكرّر.
 * وهذا مقبول حين تكون القرابة حقيقية: «اشبك» و«روليت» كلتاهما تصويب على هدف.
 * وما يفرق بينهما الأرضية: الصفراء لألعاب اللوح، والكريمية لألعاب المعرفة،
 * فيُقرأ نوع اللعبة قبل اسمها.
 */
const GAMES: readonly (readonly [string, IconName, string])[] = [
  ['aalam', 'flag', color.ink],
  ['aks', 'shuffle', color.ink],
  ['arqam', 'target', color.ink],
  ['asraa', 'timer', color.ink],
  ['awasim', 'globe', color.ink],
  ['bomb', 'bomb', color.yellow],
  ['eshbek', 'target', color.yellow],
  ['event', 'star', color.ink],
  ['fakek', 'shuffle', color.yellow],
  ['ghuraf', 'chair', color.ink],
  ['hajra', 'hand', color.yellow],
  ['hide', 'eye', color.yellow],
  ['hisab', 'keyboard', color.ink],
  ['huroof', 'keyboard', color.yellow],
  ['jam3', 'users', color.ink],
  ['karasi', 'chair', color.yellow],
  ['khammen', 'question', color.ink],
  ['kt', 'vote', color.ink],
  ['maarifa', 'star', color.yellow],
  ['mafia', 'mask', color.yellow],
  ['mufrad', 'mic', color.ink],
  ['nard', 'dice', color.yellow],
  ['qara', 'eye', color.ink],
  ['rakeb', 'arrow', color.ink],
  ['roulette', 'target', color.red],
  ['tasweet', 'vote', color.yellow],
  ['xo', 'crown', color.yellow],
]

const ICONS = Object.keys(PATHS) as IconName[]

const FACES: Face[] = [
  // إكس أو: العلامتان بلوني الهوية على قرص فاتح
  // العلامتان أغلظ خطًّا من الأيقونات بكثير، فهالتهما تُقاس بالإضافة لا بالنسبة:
  // هامش ثابت حول الخطّ. ومضاعفة عرض الأيقونة هنا تبتلع الشكل وتخرجه كتلة.
  {
    name: 'xo_x',
    body: [halo(color.red), color.red]
      .map(
        (stroke, i) =>
          `<path d="M22 22 L78 78 M78 22 L22 78" fill="none" stroke="${stroke}"
             stroke-width="${i === 0 ? 30 : 19}" stroke-linecap="round"/>`,
      )
      .join(''),
  },
  {
    name: 'xo_o',
    body: [halo(color.yellow), color.yellow]
      .map(
        (stroke, i) =>
          `<circle cx="50" cy="50" r="30" fill="none" stroke="${stroke}"
             stroke-width="${i === 0 ? 30 : 19}"/>`,
      )
      .join(''),
  },

  // ————— الأرقام —————
  // خمسة وعشرون لأن ديسكورد لا يعطي أكثر من خمسة وعشرين زرًا في الرسالة، فهذا
  // سقف أي شبكة أو تصويت أو قائمة خيارات في البوت كلّه.
  { name: 'num_0', body: digit(0, color.ink) },
  ...Array.from({ length: 25 }, (_, i) => ({
    name: `num_${i + 1}`,
    body: digit(i + 1, color.ink),
  })),
  // النسخة الصفراء تقول «هذا اختيارك» بلا نص: التصويت يعرض صوتك مضيئًا
  ...Array.from({ length: 25 }, (_, i) => ({
    name: `pick_${i + 1}`,
    body: digit(i + 1, color.yellow),
  })),

  // ————— الحروف العربية —————
  // «حروف» تعرض حرف الجولة، وبقيّة ألعاب الكلمات تعرض أول حرف الإجابة
  ...ARABIC.map(([slug, ch]) => ({ name: `ar_${slug}`, body: letter(ch, color.ink) })),

  // ————— النرد —————
  ...Array.from({ length: 6 }, (_, i) => ({ name: `dice_${i + 1}`, body: diceFace(i + 1) })),

  // ————— وجه لكل لعبة —————
  ...GAMES.map(([key, icon, core]) => ({ name: `game_${key}`, body: iconFace(icon, core) })),

  // ————— الأيقونات الستّ والعشرون في حالاتها الثلاث —————
  // محايدة حبرية، منجزة صفراء، خطر حمراء. أي أيقونة قد تحتاج الحالات الثلاث،
  // فالتغطية كاملة أرخص من تخمين أيّها سيُطلب لاحقًا.
  ...ICONS.map((n) => ({ name: `st_${n}`, body: iconFace(n, color.ink) })),
  ...ICONS.map((n) => ({ name: `win_${n}`, body: iconFace(n, color.yellow) })),
  ...ICONS.map((n) => ({ name: `hot_${n}`, body: iconFace(n, color.red) })),

  // ————— أفعال اللوبي —————
  // أسماء ثابتة لا تتبع الأيقونة، لأن الفعل قد يغيّر أيقونته ولا يغيّر معناه
  { name: 'act_join', body: iconFace('users', color.ink) },
  { name: 'act_leave', body: iconFace('cross', color.ink) },
  {
    name: 'act_start',
    // «ابدأ» مثلّث مصمت لا محيط: هو الفعل الوحيد الذي يُضغط بلا تردّد
    body: outlined(
      (stroke, width) => `
        <g transform="translate(50 50) scale(4.05) translate(-12 -12)"
           fill="${stroke}" stroke="${stroke}" stroke-width="${width}"
           stroke-linejoin="round">${PATHS.play}</g>`,
      color.yellow,
    ),
  },
  { name: 'act_cancel', body: iconFace('stop', color.red) },
  { name: 'act_bot', body: iconFace('gear', color.ink) },

  // ————— اتجاهات —————
  // سهم واحد مدار أربع مرّات: التنقّل في الصفحات والترتيب صعودًا ونزولًا
  { name: 'nav_up', body: turned('arrow', -90, color.ink) },
  { name: 'nav_down', body: turned('arrow', 90, color.ink) },
  { name: 'nav_next', body: turned('arrow', 180, color.ink) },
  { name: 'nav_prev', body: turned('arrow', 0, color.ink) },

  // ————— فروق النقاط —————
  // تظهر بجانب اسم اللاعب لحظة احتساب الجولة
  ...[1, 2, 3, 5, 10, 20].map((n) => ({
    name: `plus_${n}`,
    body: glyph(`+${n}`, color.yellow, n >= 10 ? 50 : 66),
  })),
  { name: 'minus_1', body: glyph('-1', color.red, 66) },

  // ————— أرصدة —————
  // العملة قرص بطبيعتها، فالدائرة هنا هي الشيء نفسه لا أرضية تحته
  ...[1, 5, 10].map((n) => ({
    name: `coin_${n}`,
    body: `<circle cx="50" cy="50" r="46" fill="${color.yellow}"
             stroke="${color.ink}" stroke-width="7"/>
       <text x="50" y="53" text-anchor="middle" dominant-baseline="central"
             style="direction:ltr;unicode-bidi:bidi-override"
             font-family="${font.display}" font-size="${n > 9 ? 56 : 70}" font-weight="800"
             fill="${color.ink}">${n}</text>`,
  })),

  // ————— المهلة —————
  // ثلاث درجات لا عدّاد: الرقم يتغيّر كل ثانية والإيموجي لا يُحرَّر كل ثانية
  { name: 'time_full', body: iconFace('hourglass', color.ink) },
  { name: 'time_half', body: iconFace('hourglass', color.yellow) },
  { name: 'time_low', body: iconFace('hourglass', color.red) },

  // ————— المحاولات الباقية —————
  { name: 'life_full', body: iconFace('star', color.yellow) },
  { name: 'life_empty', body: iconFace('star', color.ink) },

  // ————— التقدّم —————
  ...Array.from({ length: 5 }, (_, i) => ({ name: `bar_${i}`, body: bar(i) })),
  {
    name: 'dot_on',
    body: `<circle cx="50" cy="50" r="30" fill="${color.yellow}"
             stroke="${color.ink}" stroke-width="7"/>`,
  },
  {
    name: 'dot_off',
    body: `<circle cx="50" cy="50" r="30" fill="none"
             stroke="${color.cream}" stroke-width="16"/>
           <circle cx="50" cy="50" r="30" fill="none"
             stroke="${color.ink}" stroke-width="7"/>`,
  },

  // ————— الفرق —————
  // أربعة فرق تُميَّز باللون والحرف معًا، لا باللون وحده: عمى الألوان يُسقِط
  // اللون ويُبقي الحرف، وهي القاعدة نفسها التي تحكم علامتَي «اشبك»
  ...([
    ['team_a', 'أ', color.red],
    ['team_b', 'ب', color.yellow],
    ['team_c', 'ج', color.ink],
    ['team_d', 'د', color.cream],
  ] as const).map(([name, ch, core]) => ({ name, body: letter(ch, core) })),
]

function svg(body: string): string {
  return `<svg id="emoji" width="${PX}" height="${PX}" viewBox="0 0 100 100"
    style="display:block">${body}</svg>`
}

type Existing = { id: string; name: string }

/**
 * يحذف القديم بالاسم ثم ينشئ الجديد، ويعيد المحاولة عند التعثّر.
 *
 * الإعادة هنا ليست احتياطًا نظريًا. رفعُ مئتين وسبعة وعشرين طلبًا متتاليًا
 * يصادف أخطاء بوّابة عابرة (503)، وحين يسقط الإنشاء بعد نجاح الحذف يختفي
 * الإيموجي أصلًا؛ وحين يسقط الحذف يرفض الإنشاء الاسمَ المكرّر فيبقى الشكل
 * القديم بلا إنذار. والحالتان وقعتا فعلًا في أول رفعة لهذا الطقم.
 */
async function replace(item: { name: string; png: Buffer }, existing: Existing[]): Promise<boolean> {
  const auth = { Authorization: `Bot ${settings.token}` }

  for (let attempt = 1; attempt <= 3; attempt++) {
    // القديم يُقرأ من جديد كل محاولة: قد يكون الحذف السابق هو ما فشل
    const stale =
      existing.find((e) => e.name === item.name) ??
      (await listUploaded()).find((e) => e.name === item.name)
    if (stale) {
      await fetch(`https://discord.com/api/v10/applications/${settings.appId}/emojis/${stale.id}`, {
        method: 'DELETE',
        headers: auth,
      }).catch(() => null)
    }

    const res = await fetch(`https://discord.com/api/v10/applications/${settings.appId}/emojis`, {
      method: 'POST',
      headers: { ...auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: item.name,
        image: `data:image/png;base64,${item.png.toString('base64')}`,
      }),
    }).catch(() => null)

    if (res?.ok) return true
    console.error(`${item.name} محاولة ${attempt}: ${res ? `${res.status} ${await res.text()}` : 'انقطاع'}`)
    // الفهرس المحفوظ صار قديمًا بعد محاولة فاشلة، فالمحاولة التالية تقرأ الحيّ
    existing.length = 0
    await new Promise((r) => setTimeout(r, 1_000 * attempt))
  }
  return false
}

async function listUploaded(): Promise<Existing[]> {
  const res = await fetch(`https://discord.com/api/v10/applications/${settings.appId}/emojis`, {
    headers: { Authorization: `Bot ${settings.token}` },
  })
  if (!res.ok) throw new Error(`قراءة الإيموجيات فشلت: ${res.status} ${await res.text()}`)
  const body = (await res.json()) as { items?: Existing[] }
  return body.items ?? []
}

async function main(): Promise<void> {
  const names = new Set<string>()
  for (const face of FACES) {
    if (names.has(face.name)) throw new Error(`اسم مكرّر: ${face.name}`)
    if (!/^[a-z0-9_]{2,32}$/.test(face.name)) throw new Error(`اسم مرفوض: ${face.name}`)
    names.add(face.name)
  }

  await fs.mkdir(OUT, { recursive: true })
  await startRenderer()

  const drawn: { name: string; png: Buffer }[] = []
  for (const face of FACES) {
    // خلفية شفافة: القرص هو الأرضية، وأي أرضية ثانية تصير مربّعًا حوله
    const png = await shoot(`<div>${svg(face.body)}</div>`, {
      selector: '#emoji',
      transparent: true,
    })
    await fs.writeFile(path.join(OUT, `${face.name}.png`), png)
    drawn.push({ name: face.name, png })
  }
  await stopRenderer()

  const biggest = Math.max(...drawn.map((d) => d.png.length))
  console.log(`رُسمت ${drawn.length} إيموجي · أكبرها ${(biggest / 1024).toFixed(1)} KB من 256`)

  if (DRY) return

  let existing = await listUploaded()
  const targets = ONLY.length > 0 ? drawn.filter((d) => ONLY.includes(d.name)) : drawn
  const failed: string[] = []

  for (const item of targets) {
    if (!(await replace(item, existing))) failed.push(item.name)
    // ديسكورد يحدّ الإنشاء؛ فاصل قصير أرخص من 429 وإعادة محاولة
    await new Promise((r) => setTimeout(r, 250))
  }

  /**
   * الخريطة تُبنى من قائمة ديسكورد بعد الرفع، لا من ردود الإنشاء.
   *
   * ردّ الإنشاء يعرف ما أنشأناه في هذه الجولة وحده، فأي إيموجي بقي من جولة
   * سابقة يسقط من الخريطة ويصير مربّعًا فارغًا في الأزرار. والقائمة النهائية
   * تصف ما عند ديسكورد فعلًا، وهو المرجع الذي يهمّ.
   */
  existing = await listUploaded()
  const wanted = new Set(drawn.map((d) => d.name))
  const ids = new Map(
    existing.filter((e) => wanted.has(e.name)).map((e) => [e.name, e.id] as const),
  )

  const missing = [...wanted].filter((n) => !ids.has(n))
  if (failed.length > 0) console.error(`تعثّر رفعها: ${failed.join(', ')}`)
  if (missing.length > 0) console.error(`غائبة عن ديسكورد: ${missing.join(', ')}`)

  const lines = [...ids.entries()].map(([name, id]) => `  ${name}: '<:${name}:${id}>',`)
  await fs.writeFile(
    MAP,
    `/**
 * معرّفات إيموجيات التطبيق.
 *
 * **ملف مولَّد — لا يُحرَّر بيد.** يُنتجه \`npm run gen:emojis\` بعد رفع الصور،
 * ومعرّف الإيموجي يتغيّر مع كل رفع لأن الرفع يحذف القديم وينشئ جديدًا. نسخ
 * المعرّفات يدويًا يعني خريطة تتقادم بصمت وأزرارًا تعرض مربّعات فارغة.
 */
export const EMOJI = {
${lines.join('\n')}
} as const

export type EmojiName = keyof typeof EMOJI
`,
    'utf8',
  )
  console.log(`رُفعت ${ids.size} إيموجي · كُتبت الخريطة إلى src/design/emoji.ts`)
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
