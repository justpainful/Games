/**
 * يولّد `design-system.html` — مرجع نظام التصميم.
 *
 *   npm run gen:ds
 *
 * **مولّد لا مكتوب يدويًا.** الألوان والمقاسات تُقرأ من `src/design/tokens.ts`
 * والأنماط من `src/dashboard/layout.ts`، فالصفحة لا تستطيع أن تكذب: أي تعديل
 * على التوكنات يظهر هنا بإعادة التوليد. الوثيقة المكتوبة يدويًا تتعفّن بعد أول
 * تغيير لون ثم تُضلّل من يعتمد عليها.
 *
 * الملف الناتج **مستقل تمامًا**: الخطوط مضمّنة base64، فيُفتح بلا خادم ويُرسل كما هو.
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { stylesheet } from '../src/dashboard/layout.ts'
import { color, leading, lift, onColor, radius, size, space, stroke } from '../src/design/tokens.ts'
import { esc } from '../src/scenes/html.ts'

const ROOT = process.cwd()
const OUT = path.join(ROOT, 'design-system.html')

/** يحوّل خطًا إلى data URI ليصير الملف مستقلًا عن أي مسار. */
async function fontFace(family: string, file: string, weights: string): Promise<string> {
  const buf = await fs.readFile(path.join(ROOT, 'src', 'design', 'fonts', file))
  const b64 = buf.toString('base64')
  return `@font-face{font-family:'${family}';src:url(data:font/ttf;base64,${b64}) format('truetype-variations');font-weight:${weights};font-display:block}`
}

/** مكوّن موثّق: عرض حيّ + القصاصة الجاهزة للنسخ. */
function demo(args: { id: string; title: string; why: string; html: string }): string {
  return `
<section class="ds-item" id="${args.id}">
  <h3 class="ds-h3">${esc(args.title)}</h3>
  <p class="ds-why">${esc(args.why)}</p>
  <div class="ds-stage">${args.html}</div>
  <details class="ds-code">
    <summary>الكود</summary>
    <div class="ds-codebar"><button class="ds-copy" type="button">نسخ</button></div>
    <pre><code>${esc(args.html.trim())}</code></pre>
  </details>
</section>`
}

function swatches(): string {
  const rows = Object.entries(color)
    .map(([name, hex]) => {
      const on = (onColor as Record<string, string>)[name] ?? color.ink
      return `<div class="ds-sw">
        <div class="ds-sw__chip" style="background:${hex};color:${on}">نص</div>
        <div class="ds-sw__meta">
          <b>${esc(name)}</b>
          <code>${esc(hex)}</code>
          <span>var(--color-${name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())})</span>
        </div>
      </div>`
    })
    .join('')
  return `<div class="ds-swatches">${rows}</div>`
}

function scaleTable(title: string, values: Record<string, number>, unit = 'px'): string {
  const rows = Object.entries(values)
    .map(([k, v]) => `<tr><td><code>${esc(k)}</code></td><td>${v}${unit}</td></tr>`)
    .join('')
  return `<h3 class="ds-h3">${esc(title)}</h3><table>${rows}</table>`
}

async function build(): Promise<string> {
  const fonts = [
    await fontFace('Cairo', 'Cairo.ttf', '200 1000'),
    await fontFace('Baloo', 'BalooBhaijaan2.ttf', '400 800'),
  ].join('\n')

  // الأنماط نفسها التي يستعملها الداشبورد — لا نسخة ثانية تتباعد عنها
  const shared = stylesheet()
    .replace(/@font-face\{[^}]*\}/g, '')
    .replace(/@font-face \{[\s\S]*?\}/g, '')

  const body = `
<header class="ds-hero">
  <h1>نظام تصميم <span class="ds-brand">Arcade</span></h1>
  <p>
    مصدر واحد لثلاثة أسطح: صور البوت، وتطبيق iOS، وداشبورد الويب.
    كل قيمة هنا مولّدة من <code>src/design/tokens.ts</code>.
  </p>
  <div class="row">
    <span class="pill">مولّد آليًا</span>
    <span class="pill">RTL</span>
    <span class="pill">لا تدرّجات</span>
    <span class="pill">لا ظل ناعم</span>
  </div>
</header>

<nav class="ds-toc card">
  <b>المحتوى:</b>
  <a href="#tokens">التوكنات</a> ·
  <a href="#signature">التوقيع</a> ·
  <a href="#type">الطباعة</a> ·
  <a href="#components">المكوّنات</a> ·
  <a href="#arabic">قواعد العربية</a> ·
  <a href="#forbidden">الممنوعات</a> ·
  <a href="#surfaces">الأسطح الثلاثة</a>
</nav>

<h2 class="ds-h2" id="tokens">١. التوكنات</h2>

<div class="card">
  <h3 class="ds-h3">اللوحة</h3>
  <p class="hint">
    لونان يحملان الهوية — الأحمر والأصفر — وكل ما عداهما ورق وحبر.
    <b>لا لون جديد بلا سطر في هذا الجدول.</b>
    المربّع يعرض لون النص الصحيح فوق كل خلفية.
  </p>
  ${swatches()}
</div>

<div class="card">
  ${scaleTable('المقاس (مشهد 1500px)', size)}
  <p class="hint">
    هذه مقاسات <b>الكانفاس</b>. الويب والجوال لهما مقياسهما — القيمة نفسها
    تعطي عنوانًا بحجم 82px في صفحة، وهو خطأ لا التزام.
  </p>
</div>

<div class="card">
  ${scaleTable('المسافات', space)}
  ${scaleTable('الاستدارة', radius)}
  ${scaleTable('سُمك الحد', stroke)}
  ${scaleTable('ارتفاع الظل', lift)}
  ${scaleTable('تباعد الأسطر', leading, '')}
</div>

<h2 class="ds-h2" id="signature">٢. التوقيع — الظل الملوّن</h2>

<div class="card card--hero">
  <p>
    كل عنصر له <b>حد أسود سميك</b> و<b>ظل صلب بلا blur</b>. والجديد الذي يميّز
    المشروع: <b>لون الظل يحمل معنى</b>.
  </p>
  <table>
    <tr><th>العنصر</th><th>الظل</th><th>لماذا</th></tr>
    <tr><td>بطاقة عادية، زر أحمر، شريط</td><td><code>ink</code></td><td>البنية محايدة</td></tr>
    <tr><td>البطاقة البطلة، الزر الأصفر</td><td><code>redDeep</code></td><td>الأصفر فوق الأحمر = اندماج لوني الهوية</td></tr>
  </table>
  <p class="hint">
    اتجاه الظل يسار-أسفل لأنه يتبع القراءة RTL: الضوء من جهة بداية السطر.
    هذه البطاقة نفسها ظلها أحمر — انظر حافتها.
  </p>
</div>

<h2 class="ds-h2" id="type">٣. الطباعة</h2>

<div class="card">
  <p style="font-family:'Baloo';font-size:34px">Baloo Bhaijaan 2 — للعناوين</p>
  <p style="font-family:'Cairo';font-size:20px">Cairo — للنصوص. نص عربي طويل لفحص الوصل والتباعد والأرقام 12345 داخل الجملة.</p>
  <p class="hint">
    الخطان OFL ومحزومان في المستودع. <b>ممنوع خطوط النظام</b> —
    تعرض العربية مختلفة على كل جهاز.
  </p>
</div>

<h2 class="ds-h2" id="components">٤. المكوّنات</h2>

${demo({
  id: 'c-card',
  title: 'البطاقة',
  why: 'الوحدة الأساسية: سطح كريمي، حد أسود، ظل صلب. النسخة البطلة ظلها أحمر وتُستعمل مرة واحدة في الشاشة.',
  html: `<div class="card">
  <h2>«عنوان القسم»</h2>
  <p class="hint">سطر يشرح ما يفعله هذا القسم.</p>
  <p>محتوى البطاقة.</p>
</div>
<div class="card card--hero">
  <h2>«البطاقة البطلة»</h2>
  <p>ظلها أحمر فتُقرأ أولًا.</p>
</div>`,
})}

${demo({
  id: 'c-btn',
  title: 'الأزرار',
  why: 'الأصفر للفعل البطل وظله أحمر. الأحمر للفعل الهدّام. الشبح للتنقّل الثانوي.',
  html: `<div class="row">
  <button class="btn btn--go">حفظ</button>
  <button class="btn">إلغاء</button>
  <button class="btn btn--danger">حذف</button>
  <a class="btn btn--ghost" href="#">رجوع</a>
</div>`,
})}

${demo({
  id: 'c-pill',
  title: 'الكبسولة',
  why: 'عدّاد أو وسم قصير. لا تحمل جملة — كلمة أو رقم فقط.',
  html: `<div class="row">
  <span class="pill">27 لعبة</span>
  <span class="pill">2/8</span>
  <span class="pill pill--off">معطّل</span>
</div>`,
})}

${demo({
  id: 'c-bar',
  title: 'الشريط العلوي',
  why: 'عنوان الشاشة. أحمر دائمًا، والكبسولة الصفراء فيه تحمل السياق (اسم السيرفر أو العدّاد).',
  html: `<header class="bar">
  <div class="bar__in">
    <span class="brand">لوحة التحكّم</span>
    <span class="pill">سيرفر الأصدقاء</span>
    <span class="grow"></span>
    <a class="btn btn--ghost" href="#">خروج</a>
  </div>
</header>`,
})}

${demo({
  id: 'c-flash',
  title: 'رسالة النتيجة',
  why: 'تظهر بعد كل فعل كتابة. الناجحة صفراء والفاشلة حمراء — لا رمادي محايد.',
  html: `<div class="flash flash--ok">صار البريفكس «!» في هذا السيرفر.</div>
<div class="flash flash--bad">الرابط يجب أن يبدأ بـ https.</div>`,
})}

${demo({
  id: 'c-form',
  title: 'الحقول',
  why: 'كل حقل له label مرتبط. حلقة التركيز حمراء وواضحة — إزالتها عيب تسليم.',
  html: `<div class="row">
  <label for="ds-prefix">البريفكس</label>
  <input id="ds-prefix" type="text" value="!" style="width:90px">
  <button class="btn btn--go">حفظ</button>
</div>
<div class="row">
  <label for="ds-ch">القناة</label>
  <select id="ds-ch">
    <option>#الالعاب</option>
    <option>كل القنوات</option>
  </select>
</div>`,
})}

${demo({
  id: 'c-split',
  title: 'الصف المقسوم',
  why: 'عنصر ونقيضه على طرفي السطر — اسم وزر إزالة مثلًا. الفاصل المتقطّع يفصل الصفوف.',
  html: `<div class="split">
  <bdi>عبدالرحمن</bdi>
  <button class="btn btn--danger">إزالة</button>
</div>
<div class="split">
  <bdi>.zja6</bdi>
  <button class="btn btn--danger">إزالة</button>
</div>`,
})}

${demo({
  id: 'c-table',
  title: 'الجدول',
  why: 'للبيانات المرتّبة فقط. أي جدول يتجاوز عرض الشاشة يُلفّ في حاوية تمرير أفقي.',
  html: `<table>
  <tr><th>#</th><th>اللاعب</th><th>النقاط</th></tr>
  <tr><td>1</td><td><bdi>عبدالرحمن</bdi></td><td>137</td></tr>
  <tr><td>2</td><td><bdi>Sara_2010</bdi></td><td>121</td></tr>
  <tr><td>3</td><td><bdi>.zja6</bdi></td><td>98</td></tr>
</table>`,
})}

${demo({
  id: 'c-grid',
  title: 'الشبكة',
  why: 'بطاقات متساوية تتكيّف مع العرض. لا تُستعمل لأقل من ثلاثة عناصر.',
  html: `<div class="grid">
  <div class="card"><h2>«الجمع»</h2><p class="hint">حوّل المفرد إلى جمع</p></div>
  <div class="card"><h2>«المفرد»</h2><p class="hint">حوّل الجمع إلى مفرد</p></div>
  <div class="card"><h2>«الأضداد»</h2><p class="hint">اكتب ضد الكلمة</p></div>
</div>`,
})}

${demo({
  id: 'c-empty',
  title: 'الحالة الفارغة',
  why: 'تقول سبب الفراغ وما الخطوة التالية. **لا تضع أزرارًا داخلها** — شفافيتها تجعلها تبدو معطّلة.',
  html: `<div class="card">
  <div class="empty">لا توجد نقاط في هذه المحفظة بعد.</div>
  <div class="row" style="justify-content:center">
    <a class="btn btn--go" href="#">ابدأ لعبة</a>
  </div>
</div>`,
})}

<h2 class="ds-h2" id="arabic">٥. قواعد العربية — إلزامية</h2>

<div class="card card--hero">
  <table>
    <tr><th>القاعدة</th><th>لماذا</th></tr>
    <tr><td><code>letter-spacing: 0</code></td><td>العربية خط متصل — أي تباعد يفصل الحروف ويكسر شكل الكلمة</td></tr>
    <tr><td><code>line-height ≥ 1.7</code></td><td>الحروف النازلة والتشكيل تحتاج مساحة رأسية أكبر</td></tr>
    <tr><td>ممنوع <code>text-transform</code></td><td>لا يوجد capitalization في العربية</td></tr>
    <tr><td><code>margin-inline-start</code> لا <code>left</code></td><td>الخصائص المنطقية تنقلب مع الاتجاه تلقائيًا</td></tr>
    <tr><td><code>dir="rtl"</code> على الجذر مرة واحدة</td><td>تكراره على كل عنصر مصدر أخطاء</td></tr>
    <tr><td>أرقام <code>0-9</code> موحّدة</td><td>خلط النظامين في شاشة واحدة عيب</td></tr>
  </table>

  <h3 class="ds-h3">أهم قاعدة: عزل الأسماء</h3>
  <p>
    كل نص يكتبه مستخدم <b>يُلفّ بـ <code>&lt;bdi&gt;</code></b>.
    أسماء ديسكورد لاتينية غالبًا وتبدأ أو تنتهي بمحارف محايدة
    (<code>.</code> <code>_</code> أرقام)، وداخل نص عربي تنتقل تلك المحارف للطرف الخطأ.
  </p>
  <div class="split">
    <span>بلا عزل — <span style="color:var(--color-red)">خطأ</span></span>
    <span style="font-size:20px">اللاعب .zja6 جمع 12 نقطة</span>
  </div>
  <div class="split">
    <span>مع <code>&lt;bdi&gt;</code> — صحيح</span>
    <span style="font-size:20px">اللاعب <bdi>.zja6</bdi> جمع 12 نقطة</span>
  </div>
  <p class="hint">
    هذا خطأ حقيقي وقع في المشروع وظهر في لقطة CI: النقطة قفزت لآخر المقطع
    فصار الاسم <code>zja6.</code> بدل <code>.zja6</code>.
    المكافئ في SwiftUI هو <code>String.bidiIsolated</code> (محرفا FSI/PDI).
  </p>
</div>

<h2 class="ds-h2" id="forbidden">٦. الممنوعات</h2>

<div class="card">
  <ul style="padding-inline-start:22px;line-height:2">
    <li>أي <b>تدرّج لوني</b> — اللوحة كلها مسطّحة</li>
    <li>أي <b>ظل ناعم</b> (<code>blur</code> في <code>box-shadow</code>) — الظل صلب دائمًا</li>
    <li><b>عائلة Material</b> كلها و<code>backdrop-filter</code> — البديل الوحيد <code>glassEffect</code> على iOS 26</li>
    <li><b>خطوط النظام</b> (Segoe UI، Tahoma)</li>
    <li>أي <b>لون خارج جدول اللوحة</b> — ولا قيمة hex في الكود</li>
    <li><b>اسم أو شعار مطبوع داخل مشهد الكانفاس</b> — الهوية تُحمل باللون والظل والشكل</li>
    <li><b>إيموجي في الواجهة</b> — كل نظام يرسمه بأسلوبه فتتفرّق الهوية. استعمل أيقونات المشروع</li>
    <li><b>كتلة عضوية تُقصّ عند حافة المشهد</b> — تُقرأ قرصًا لا شكلًا</li>
  </ul>
</div>

<h2 class="ds-h2" id="surfaces">٧. الأسطح الثلاثة</h2>

<div class="card">
  <table>
    <tr><th>السطح</th><th>الأنماط</th><th>المقاس</th></tr>
    <tr><td>صور البوت (كانفاس)</td><td><code>src/design/components.css</code></td><td>مشهد 1500px</td></tr>
    <tr><td>تطبيق iOS</td><td><code>ios/Games/Design/Style.swift</code></td><td><code>Type</code> بالنقاط</td></tr>
    <tr><td>داشبورد الويب</td><td><code>src/dashboard/layout.ts</code></td><td>ويب متجاوب</td></tr>
  </table>
  <p class="hint">
    <b>اللون والشكل والظل مشتركة</b> ومصدرها <code>src/design/tokens.ts</code>.
    <b>المقاس مستقل</b> لكل سطح — الوسائط مختلفة، ونقل مقاس الكانفاس إلى الويب
    يعطي عنوانًا بحجم 82px.
  </p>
  <p class="hint">
    توليد توكنات سويفت: <code>npm run gen:swift</code> —
    وإعادة توليد هذه الصفحة: <code>npm run gen:ds</code>
  </p>
</div>

<footer class="ds-foot">
  مولّد من <code>src/design/tokens.ts</code> و <code>DESIGN.md</code> — لا تحرّر هذا الملف يدويًا.
</footer>`

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>نظام تصميم Arcade</title>
<style>
${fonts}
${shared}

/* ————— كروم الوثيقة نفسها (ليس جزءًا من نظام التصميم) ————— */
body{padding:0}

/*
 * كل كود سطري يُعزل ويُجبر على LTR.
 * بدونها تُعرض «#E03A2F» على شكل «E03A2F#» لأن الشبكة محرف محايد ينتقل
 * لطرف السطر في سياق RTL — وهو نفس فخّ الأسماء الذي تحذّر منه هذه الصفحة،
 * وقد وقعت فيه هي نفسها في أول توليد.
 */
code{direction:ltr;unicode-bidi:isolate;display:inline-block}
.ds-hero{max-width:960px;margin:0 auto;padding:40px 16px 10px}
.ds-hero h1{font-family:'Baloo',sans-serif;font-size:40px;line-height:1.4}
.ds-brand{color:var(--color-red)}
.ds-hero p{max-width:60ch;opacity:.75;margin:10px 0 16px}
.ds-toc{max-width:960px;margin:0 auto 26px;font-size:14px}
.ds-toc a{color:var(--color-red);text-decoration:none;font-weight:700}
.ds-h2{
  max-width:960px;margin:38px auto 14px;padding:0 16px;
  font-family:'Baloo',sans-serif;font-size:26px;
}
.ds-h3{font-family:'Baloo',sans-serif;font-size:19px;margin:14px 0 6px}
.ds-item{max-width:960px;margin:0 auto 22px;padding:0 16px}
.ds-why{font-size:14px;opacity:.7;margin-bottom:10px;max-width:70ch}
.ds-stage{
  background:var(--color-paper-tint);
  border:3px dashed color-mix(in srgb,var(--color-ink) 30%,transparent);
  border-radius:14px;padding:20px;
}
.ds-code{margin-top:10px}
.ds-code summary{cursor:pointer;font-weight:700;font-size:14px}
/* الزر في مجرى الصفحة لا مطلقًا: الكود LTR وأي تموضع مطلق يغطّي أول سطر */
.ds-codebar{display:flex;justify-content:flex-end;margin:8px 0 -4px}
.ds-copy{
  font:inherit;font-size:12px;padding:4px 12px;cursor:pointer;
  background:var(--color-yellow);border:2px solid var(--color-ink);border-radius:8px;
}
.ds-code pre{
  margin-top:8px;background:var(--color-ink);color:var(--color-cream);
  padding:14px;border-radius:12px;overflow-x:auto;direction:ltr;text-align:left;
}
.ds-code code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:13px;line-height:1.7}
.ds-swatches{display:grid;grid-template-columns:repeat(auto-fill,minmax(190px,1fr));gap:12px}
.ds-sw__chip{
  height:64px;display:grid;place-items:center;font-weight:700;
  border:3px solid var(--color-ink);border-radius:12px;
}
.ds-sw__meta{display:flex;flex-direction:column;font-size:12px;margin-top:6px;gap:1px}
.ds-sw__meta code{opacity:.8}
.ds-sw__meta span{opacity:.55;font-size:11px}
.ds-foot{max-width:960px;margin:40px auto;padding:0 16px 40px;font-size:13px;opacity:.6}
.ds-item .card{margin-bottom:12px}
</style>
</head>
<body>
${body}
<script>
// زر نسخ لكل قصاصة — الشيء الوحيد الذي يحتاج جافاسكربت في الصفحة
document.querySelectorAll('.ds-copy').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const code = btn.parentElement?.querySelector('code')?.textContent ?? ''
    try {
      await navigator.clipboard.writeText(code)
      btn.textContent = 'تم النسخ'
      setTimeout(() => { btn.textContent = 'نسخ' }, 1400)
    } catch {
      btn.textContent = 'تعذّر النسخ'
    }
  })
})
</script>
</body>
</html>`
}

async function main(): Promise<void> {
  const html = await build()
  await fs.writeFile(OUT, html, 'utf8')
  const kb = Math.round(Buffer.byteLength(html) / 1024)
  console.log(`كُتب ${OUT}`)
  console.log(`${kb}KB — مستقل تمامًا (الخطوط مضمّنة)، افتحه بأي متصفح.`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
