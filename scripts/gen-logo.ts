/**
 * يولّد شعار البوت.
 *
 *   npm run gen:logo
 *
 * البوت بلا اسم، فالشعار **رمز لا كلمة**. هذا ليس تنازلًا: DESIGN.md §5 يقرر
 * أصلًا أن الهوية تُحمل باللون والظل والشكل لا باسم مطبوع، وأن ذلك «يبقي
 * التصميم صالحًا مهما كان الاسم لاحقًا». الشعار هنا يطبّق القرار نفسه.
 *
 * ذراع التحكّم هي المسار نفسه المستعمل في أيقونة التطبيق (`gen-nav-icons.ts`)
 * حرفًا بحرف — شعار يرسم ذراعًا أخرى يعني هويتين لمنتج واحد.
 *
 * التركيب مستعار من عالم الملصقات المقصوصة: حلقة تلتف حول البطل وتمر خلفه
 * ثم أمامه، وغيوم مسطّحة في زاويتين. المستعار هو المفردة لا اللوحة — كل لون
 * هنا من جدول DESIGN.md §3، ولا شيء غيره.
 *
 * **التوقيع** (§5): العنصر الأصفر يلقي ظلًا `redDeep` لا أسود، واتجاه الظل
 * يسار-أسفل لأنه يتبع القراءة RTL. هذان القراران وحدهما يفرّقان هذا الشعار
 * عن أي ملصق آخر بنفس المفردات.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { color, stroke } from '../src/design/tokens.ts'
import { shoot, startRenderer, stopRenderer } from '../src/images/browser.ts'

const OUT = path.join(process.cwd(), 'out')

/** تجمّع الصفحات يرندر بـ deviceScaleFactor 2، فبكسل CSS واحد يخرج بكسلين. */
const DEVICE_SCALE = 2

/**
 * ذراع التحكّم، منقولة من `appIconSvg` بلا تعديل حرف.
 * أي انحراف هنا يجعل الشعار والأيقونة شكلين مختلفين لنفس الشيء.
 */
const PAD_BODY =
  'M30 36h40a26 26 0 0 1 24 30l-3 15a13 13 0 0 1-24 4l-5-9H38l-5 9a13 13 0 0 1-24-4l-3-15a26 26 0 0 1 24-30z'
const PAD_MARKS = 'M28 58h14M35 51v14M66 52h.01M76 62h.01'

/**
 * الامتداد الصلب: نسخ متتابعة بخطوة بكسل واحد يسار-أسفل.
 *
 * ليس `filter: drop-shadow` ولا `blur` — DESIGN.md §7 يمنع الظل الناعم. تكرار
 * النسخ هو الطريقة الوحيدة لبناء جسم مصمت بحواف حادة.
 */
function extrude(bodyFill: string, depth: number): string {
  const layers: string[] = []
  for (let i = depth; i >= 1; i--) {
    // بلا stroke على نسخ الامتداد: الحدّ يوسّع كل نسخة بنصف سُمكه في كل اتجاه،
    // فيتحوّل الامتداد من جانب مصمت إلى كتلة أعرض من الجسم نفسه.
    layers.push(
      `<g transform="translate(${-i} ${i})"><path d="${PAD_BODY}" fill="${bodyFill}"/></g>`,
    )
  }
  return layers.join('')
}

/**
 * غيمة مسطّحة بحدّ سميك وظل صلب — مفردة §2.
 *
 * مبنية من دوائر ومستطيل لا من مسار واحد. رسم غيمة بأقواس يدوية يخرج
 * مشوّهًا عند أول خطأ في اتجاه القوس، والاتحاد هنا يتحقق بالرسم مرتين:
 * مرة بحدّ سميك بلون الحبر يصنع الظفيرة الخارجية، ومرة بالتعبئة فوقها.
 * الحدود الداخلية تختفي لأن الأشكال كلها بلون واحد.
 */
function cloud(x: number, y: number, scale: number): string {
  const shapes = `
    <circle cx="24" cy="27" r="16"/>
    <circle cx="47" cy="21" r="20"/>
    <circle cx="69" cy="29" r="14"/>
    <rect x="9" y="31" width="72" height="17" rx="8"/>`
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <g transform="translate(-7 7)" fill="${color.ink}" stroke="${color.ink}"
         stroke-width="14" stroke-linejoin="round">${shapes}</g>
      <g fill="${color.ink}" stroke="${color.ink}"
         stroke-width="14" stroke-linejoin="round">${shapes}</g>
      <g fill="${color.cream}">${shapes}</g>
    </g>`
}

/**
 * الكتلة العضوية التي تجلس عليها الشارة.
 *
 * كانت بيضاويين في زاويتين، وهذا خطأ مزدوج: البيضاوي ليس كتلة عضوية بل دائرة
 * مشوّهة، ووجودهما في الزوايا يجعلهما زينة عشوائية لا بنية. DESIGN.md §5 يعطي
 * للكتلة دورًا محددًا — «إطار تجلس فيه أيقونة كل لعبة» — فكتلة واحدة تحت
 * الشارة تؤدي الدور المكتوب بدل أن تملأ فراغًا.
 *
 * محاولة أولى جعلتها كتلة بعرض اللوحة تقريبًا وأنصاف أقطارها متقاربة، فخرجت
 * قرصًا يبلع المشهد: التفاوت البسيط لا يُرى عند ذلك الحجم. هذه أصغر وأكثر
 * تفلطحًا وتفاوتها كبير، ومزاحة يسار-أسفل مع اتجاه الظل — فتُقرأ أرضًا
 * تجلس عليها الشارة المرفوعة لا شكلًا يسبح خلفها.
 *
 * داخل الإطار بالكامل، لأن §7 يمنع قصّ الكتلة عند الحافة.
 */
const GROUND =
  'M 20 130 C 10 70, 70 20, 150 12 C 240 3, 330 26, 360 90 ' +
  'C 388 150, 350 220, 265 238 C 175 257, 70 220, 20 130 Z'

/**
 * الحلقة تُرسم مرتين من نفس القطع الناقص: نصف خلف البطل ونصف أمامه.
 * التشابك هو ما يعطي العمق — حلقة كاملة فوق أو تحت تقرأ إطارًا مسطّحًا.
 */
function ring(half: 'back' | 'front'): string {
  // النصف الخلفي حلقة كاملة، والأمامي نصف يمر فوقها.
  //
  // رسمهما نصفين متلاصقين ترك خيطًا رفيعًا عند نقطتَي الالتقاء: حافتان
  // بنهاية مستقيمة تلتقيان تمامًا، وتنعيم الحواف يكشف الفاصل بينهما. الحلقة
  // الكاملة تلغي اللقاء من أصله، وما يخفيه البطل من نصفها الخلفي يخفيه على
  // أي حال لأنه مرسوم بينهما.
  const d =
    half === 'back'
      ? 'M 106 256 A 150 76 0 1 1 406 256 A 150 76 0 1 1 106 256'
      : 'M 406 256 A 150 76 0 0 1 106 256'
  // الحلقة تُرسم ثلاث مرات: ظل، ثم حدّ أسود أعرض، ثم الشريط الأصفر فوقه.
  // بلا الحدّ يذوب الشريط في ذراع التحكّم — كلاهما أصفر، فيختفي التشابك
  // الذي هو سبب وجود الحلقة أصلًا. و§2 يوجب حدًّا أسود على كل قصاصة.
  return `
    <g transform="rotate(-12 256 256)">
      <g transform="translate(-7 7)">
        <path d="${d}" fill="none" stroke="${color.redDeep}" stroke-width="34" stroke-linecap="butt"/>
      </g>
      <path d="${d}" fill="none" stroke="${color.ink}" stroke-width="34" stroke-linecap="butt"/>
      <path d="${d}" fill="none" stroke="${color.yellow}" stroke-width="22" stroke-linecap="butt"/>
    </g>`
}

/**
 * المشهد كله على شبكة 512، ويكبَّر بالـ `px` المطلوب. الرسم على شبكة ثابتة
 * يعني أن كل المقاسات تخرج من مصدر واحد بلا إعادة ضبط لأي رقم.
 */
function logoSvg(px: number): string {
  return `<svg id="logo" width="${px}" height="${px}" viewBox="0 0 512 512" style="display:block">
    <rect width="512" height="512" fill="${color.paper}"/>

    <!-- الأرض: مزاحة يسار-أسفل عن مركز الشارة، ومائلة فلا تُقرأ قرصًا -->
    <g transform="translate(28 148) rotate(-6 199 125)">
      <path d="${GROUND}" fill="${color.paperTint}"/>
    </g>

    <!--
      الحلقة والذراع تكبَّران معًا كوحدة واحدة.

      هذه أيقونة بوت قبل كل شيء، وديسكورد يعرضها بـ 64 بكسل في قائمة الأعضاء.
      شارة تشغل نصف اللوحة تبدو متوازنة على الشاشة الكبيرة وتختفي هناك، فالمقياس
      يُضبط على أصغر استعمال لا على أكبره.
    -->
    <g transform="translate(256 256) scale(1.14) translate(-256 -256)">
      ${ring('back')}

      <!-- البطل: نفس ذراع الأيقونة، بامتداد redDeep — الأصفر يلقي ظلًا أحمر (§5) -->
      <g transform="translate(256 252) scale(1.92) rotate(-4) translate(-50 -58)">
        ${extrude(color.redDeep, 6)}
        <path d="${PAD_BODY}" fill="${color.yellow}" stroke="${color.ink}"
              stroke-width="${stroke.base}" stroke-linejoin="round"/>
        <path d="${PAD_MARKS}" fill="none" stroke="${color.ink}"
              stroke-width="${stroke.base}" stroke-linecap="round"/>
      </g>

      ${ring('front')}
    </g>

    ${cloud(378, 48, 1.2)}
    ${cloud(22, 392, 1.0)}
  </svg>`
}

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true })
  await startRenderer()

  for (const px of [1024, 512]) {
    const png = await shoot(`<div>${logoSvg(px / DEVICE_SCALE)}</div>`, { selector: '#logo' })
    await fs.writeFile(path.join(OUT, `logo-${px}.png`), png)
    console.log(`logo-${px}.png ✓`)
  }

  await stopRenderer()
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
