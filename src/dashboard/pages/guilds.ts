/**
 * اختيار السيرفر.
 *
 * `page()` لا يرسم الشريط العلوي إلا مع سيرفر محدَّد، وهذه الصفحة تسبق الاختيار،
 * فترويستها جزء من جسمها.
 *
 * السيرفر الذي لا يوجد فيه البوت **يبقى معروضًا** بدل أن يُخفى: صاحبه يبحث عنه
 * في القائمة أولًا، وإخفاؤه يجعله يظن أن اللوحة لم تره. يظهر بزر «أضف البوت»
 * بدل «إدارة» فيصير الفرق فعلًا لا رسالة خطأ بعد الضغط.
 */
import { html, raw, type Html } from '../../scenes/html.ts'
import { page } from '../layout.ts'
import type { ManagedGuild, WebUser } from '../types.ts'
import { GROW, MUTED, WRAP, guildIconUrl, initial, type Flash } from './shared.ts'

const ICON =
  'width:52px;height:52px;flex:0 0 auto;border-radius:14px;' +
  'border:3px solid var(--color-ink);object-fit:cover;background:var(--color-cream)'

const FALLBACK =
  `${ICON};display:flex;align-items:center;justify-content:center;` +
  `font-family:'Baloo',sans-serif;font-size:22px;font-weight:800;` +
  `background:var(--color-yellow)`

const CARD = 'margin-bottom:0;display:flex;flex-direction:column;gap:12px'

export function guildsPage(user: WebUser, guilds: ManagedGuild[], flash?: Flash): string {
  return page({
    title: 'لوحة التحكّم — سيرفراتي',
    flash: flash ?? null,
    body: html`
      <div class="card card--hero">
        <div class="split">
          <div style="${raw(WRAP)}">
            <h2>سيرفراتي</h2>
            <p class="hint" style="margin-bottom:0">
              أهلًا <bdi>${user.displayName ?? user.username}</bdi> — اختر السيرفر الذي تريد ضبطه.
            </p>
          </div>
          <a class="btn btn--ghost" href="/dash/logout">خروج</a>
        </div>
      </div>

      ${guilds.length > 0 ? html`<div class="grid">${guilds.map(card)}</div>` : empty()}
    `,
  })
}

function card(guild: ManagedGuild): Html {
  const icon = guildIconUrl(guild)

  return html`<div class="card" style="${raw(CARD)}">
    <div class="row" style="flex-wrap:nowrap;align-items:flex-start">
      ${icon
        ? html`<img src="${icon}" alt="" style="${raw(ICON)}" />`
        : html`<div style="${raw(FALLBACK)}" aria-hidden="true">
            <bdi>${initial(guild.name)}</bdi>
          </div>`}
      <div style="${raw(GROW)};${raw(WRAP)}">
        <strong style="font-size:16px"><bdi>${guild.name}</bdi></strong>
        <div style="${raw(MUTED)}">
          ${guild.botPresent ? 'البوت موجود في السيرفر' : 'البوت غير مضاف بعد'}
        </div>
      </div>
    </div>
    <div class="row">
      ${guild.botPresent
        ? html`<a class="btn btn--go" href="/dash/g/${guild.id}/general">إدارة</a>`
        : html`<a class="btn btn--go" href="/dash/invite/${guild.id}">أضف البوت</a>`}
    </div>
  </div>`
}

/**
 * الأزرار خارج `.empty` عمدًا: الصنف يخفّف العتامة إلى `.7` وهو صحيح للنص
 * الشارح، لكنه يبهت حدّ الزر وظلّه فيبدو معطّلًا — والزر هنا هو المخرج الوحيد.
 */
function empty(): Html {
  return html`<div class="card">
    <div class="empty">
      <strong style="font-size:17px">ما فيه سيرفرات تقدر تضبطها</strong>
      <p style="margin-top:10px">
        اللوحة تعرض السيرفرات التي تملك فيها صلاحية «إدارة السيرفر» فقط. إن كنت تديره فعلًا ولا يظهر
        هنا، اطلب من صاحب السيرفر أن يعطيك الصلاحية ثم حدّث الصفحة.
      </p>
    </div>
    <div class="row" style="justify-content:center">
      <a class="btn btn--go" href="/dash">تحديث القائمة</a>
      <a class="btn" href="/dash/logout">خروج</a>
    </div>
  </div>`
}
