import type { IncomingMessage } from 'node:http'
import { hmac, safeEqual } from '../api/jwt.ts'
import { html, type Html } from '../scenes/html.ts'
import { csrfSecret, readSessionId } from './auth.ts'

/**
 * رمز مضاد لتزوير الطلب عبر المواقع.
 *
 * الكوكي يرسله المتصفّح تلقائيًا مع **أي** طلب يصل إلى نطاقنا، بما فيه نموذج
 * على موقع آخر يُرسل نفسه بجافاسكربت. بلا هذا الرمز يكفي أن يفتح مشرفُ سيرفرٍ
 * رابطًا في الشات ليُعطَّل كل ألعاب سيرفره — بلا اختراق ولا كلمة مرور.
 *
 * `SameSite=Lax` على الكوكي يغطّي أغلب الحالات، لكنه إعداد متصفّح: متصفّح قديم
 * أو مسار GET يبدّل حالة يتجاوزانه. الرمز هنا هو الضمانة التي لا تعتمد على
 * سلوك العميل.
 *
 * الرمز **مشتقّ** من معرّف الجلسة بـ HMAC لا مولَّد ومخزَّن: فلا خريطة تنتفخ في
 * الذاكرة، ولا جلسات تُكسر عند إعادة التشغيل، ولا حاجة للصق الجلسة بعملية بعينها.
 */

/** اسم الحقل المخفي في كل نموذج. */
export const CSRF_FIELD = 'csrf'

/** الرمز الخاص بجلسة بعينها. */
export function tokenFor(sessionId: string): string {
  return hmac(`csrf:${sessionId}`, csrfSecret)
}

/**
 * مقارنة ثابتة الزمن — المقارنة بـ `===` تسرّب الرمز حرفًا حرفًا لمن يقيس.
 * أي مدخل ليس نصًا (حقل مفقود، أو مصفوفة من نموذج مكرّر) يُرفض بلا استثناء.
 */
export function matches(sessionId: string, submitted: unknown): boolean {
  if (sessionId.length === 0) return false
  if (typeof submitted !== 'string' || submitted.length === 0) return false
  return safeEqual(tokenFor(sessionId), submitted)
}

/** رمز الطلب الحالي، أو `''` لمن لا جلسة له. */
export function csrfTokenFor(req: IncomingMessage): string {
  const sid = readSessionId(req)
  return sid ? tokenFor(sid) : ''
}

/** الحقل المخفي — يوضع داخل **كل** `<form method="post">` في الداشبورد. */
export function csrfField(req: IncomingMessage): Html {
  return html`<input type="hidden" name="${CSRF_FIELD}" value="${csrfTokenFor(req)}" />`
}

/** يُستدعى قبل تنفيذ أي فعل. لا جلسة = لا رمز صالح = رفض. */
export function verifyCsrf(req: IncomingMessage, submitted: unknown): boolean {
  const sid = readSessionId(req)
  if (!sid) return false
  return matches(sid, submitted)
}

/** الشكل الجاهز للاستعمال مع `URLSearchParams` القادمة من جسم POST. */
export function verifyCsrfForm(req: IncomingMessage, form: URLSearchParams): boolean {
  return verifyCsrf(req, form.get(CSRF_FIELD))
}
