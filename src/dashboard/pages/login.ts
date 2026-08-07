/**
 * شاشة الدخول.
 *
 * الصفحة الوحيدة التي لا تعرف سيرفرًا ولا مستخدمًا، فلا شريط ولا تبويبات.
 * وظيفتها أن يعرف الزائر **ماذا سيحدث بعد الضغط** قبل أن يعطي ديسكورد إذنًا:
 * ثلاثة أسطر عمّا تفعله اللوحة، وسطر عن الصلاحية المطلوبة، ثم زر واحد.
 */
import { html, raw } from '../../scenes/html.ts'
import { page } from '../layout.ts'
import { MUTED } from './shared.ts'

const WHAT = [
  'البريفكس وشات الألعاب والاسم المستعار.',
  'من يبدأ الألعاب، ومن يعطي النقاط.',
  'تفعيل أي لعبة أو تعطيلها وضبط صورتها.',
  'إعطاء النقاط وخصمها وتصفير لاعب.',
]

export function loginPage(): string {
  const list = raw('padding-inline-start:22px;margin-bottom:18px')

  return page({
    title: 'لوحة التحكّم — الدخول',
    body: html`
      <div class="card card--hero">
        <h2>لوحة تحكّم البوت</h2>
        <p class="hint">
          كل ما يُضبط هنا يُطبَّق على سيرفرك فورًا، وهو نفسه ما تضبطه أوامر البوت داخل ديسكورد.
        </p>
        <ul style="${list}">
          ${WHAT.map((line) => html`<li>${line}</li>`)}
        </ul>
        <div class="row">
          <a class="btn btn--go" href="/dash/login">دخول بديسكورد</a>
        </div>
        <p style="${raw(MUTED)};margin-top:14px">
          ندخل بحساب ديسكورد لنعرف أي سيرفرات تديرها فقط. تظهر لك السيرفرات التي تملك فيها صلاحية
          «إدارة السيرفر» دون غيرها.
        </p>
      </div>
    `,
  })
}
