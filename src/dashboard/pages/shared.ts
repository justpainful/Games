/**
 * أدوات مشتركة بين صفحات الداشبورد.
 *
 * كل نموذج كتابة في الداشبورد له نفس الهيكل الثلاثي: مسار الصفحة، رمز CSRF،
 * واسم الفعل. تكراره يدويًا في ست صفحات يعني أن نسيان `csrf` مرة واحدة يمرّ
 * بصمت — لذلك يُبنى من مكان واحد هنا، ونوع `kind` مقيّد بـ `DashAction`
 * فيصير الفعل المكتوب خطأً خطأَ نوع لا زرًّا معطّلًا.
 */
import { html, raw, type Html } from '../../scenes/html.ts'
import type { NavId } from '../layout.ts'
import type { DashAction, ManagedGuild } from '../types.ts'

export type Flash = { ok: boolean; message: string } | null

/** أسماء الأفعال كما تُرسل في الحقل المخفي `action`. */
export type ActionKind = DashAction['kind']

/** صف حقول أفقي يلتف على الجوال بدل أن يفيض. */
export const ROW = 'display:flex;gap:10px;align-items:center;flex-wrap:wrap'

/** الاسم الطويل بلا فواصل يكسر العمود ما لم يُسمح بالقطع داخل الكلمة. */
export const WRAP = 'overflow-wrap:anywhere;min-width:0'

/** حقل نصّي يأخذ المساحة الباقية في صفّه بدل عرضه الافتراضي. */
export const GROW = 'flex:1 1 200px;min-width:0'

export const MUTED = 'font-size:14px;opacity:.65'

/**
 * القيم المنطقية في النماذج.
 *
 * `checkbox` لا يُرسل شيئًا حين لا يُعلَّم، فلا يفرّق المعالج بين «أطفئه»
 * و«لم يُرسل الحقل أصلًا». هنا كل تبديل زرّ يرسل الحالة المطلوبة صراحةً.
 */
export const ON = '1'
export const OFF = '0'

/** الحقلان المخفيان اللذان يحملهما كل نموذج كتابة. */
export function actionFields(csrf: string, kind: ActionKind): Html {
  return html`<input type="hidden" name="csrf" value="${csrf}" /><input
      type="hidden"
      name="action"
      value="${kind}"
    />`
}

/** نموذج POST كامل — نفس المسار الذي عُرضت منه الصفحة. */
export function form(opts: {
  guildId: string
  page: NavId
  csrf: string
  kind: ActionKind
  body: Html
  style?: string
}): Html {
  return html`<form
    method="post"
    action="/dash/g/${opts.guildId}/${opts.page}"
    style="${raw(opts.style ?? ROW)}"
  >
    ${actionFields(opts.csrf, opts.kind)}${opts.body}
  </form>`
}

/**
 * مُعرِّف صالح لسمة `id` مشتق من مفتاح.
 *
 * مفاتيح الألعاب وأسماء الإعدادات تأتي من الكود لا من المستخدم، لكن ربطها
 * بـ `label for` يتطلب مُعرِّفًا بلا مسافات، وتنقيتها هنا أرخص من الوثوق بها.
 */
export function domId(prefix: string, key: string): string {
  return `${prefix}-${key.replace(/[^a-zA-Z0-9_-]/g, '-')}`
}

export function guildIconUrl(guild: ManagedGuild, size = 128): string | null {
  return guild.iconHash
    ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.iconHash}.png?size=${size}`
    : null
}

export function avatarUrl(userId: string, hash: string | null, size = 64): string | null {
  return hash ? `https://cdn.discordapp.com/avatars/${userId}/${hash}.png?size=${size}` : null
}

/** أول حرف من الاسم — بديل الأيقونة للسيرفر الذي لا صورة له. */
export function initial(name: string): string {
  return [...name.trim()][0] ?? '؟'
}

/**
 * لون الرول كما عرّفه صاحب السيرفر.
 *
 * هذه **بيانات من ديسكورد لا قرار تصميم**، فلا تدخل جدول التوكنات: النقطة
 * الملوّنة هي الطريقة الوحيدة للتفريق بين رولين باسمين متشابهين. اللون صفر
 * يعني «افتراضي» عند ديسكورد، فيرجع إلى الحبر.
 */
export function roleDot(color: number): Html {
  const fill =
    color === 0
      ? 'var(--color-ink)'
      : `rgb(${(color >> 16) & 0xff} ${(color >> 8) & 0xff} ${color & 0xff})`
  const style =
    `display:inline-block;width:12px;height:12px;border-radius:999px;` +
    `border:2px solid var(--color-ink);background:${fill};` +
    `margin-inline-end:6px;vertical-align:-1px`
  return raw(`<span style="${style}" aria-hidden="true"></span>`)
}
