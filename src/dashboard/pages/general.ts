/**
 * الإعدادات العامة.
 *
 * كل إعداد نموذج POST مستقل بزر حفظ خاص به، لا نموذج واحد كبير. السبب عملي:
 * صاحب السيرفر يفتح الصفحة ليغيّر شيئًا واحدًا، ونموذج واحد يعني أن حفظ
 * البريفكس يعيد إرسال قناة الألعاب والاسم المستعار معه — فيكفي خطأ في حقل
 * ليضيع تعديل حقل آخر. الفصل يجعل كل فعل قابلًا للتنفيذ وحده بـ `curl`.
 */
import { html, raw, type Html } from '../../scenes/html.ts'
import { page } from '../layout.ts'
import type { ChannelOption, GuildSettingsView } from '../types.ts'
import { GROW, MUTED, OFF, ON, ROW, WRAP, form, type Flash } from './shared.ts'

export function generalPage(v: GuildSettingsView, csrf: string, flash?: Flash): string {
  const g = v.guild.id

  return page({
    title: `الإعدادات العامة — ${v.guild.name}`,
    guild: v.guild,
    active: 'general',
    flash: flash ?? null,
    body: html`
      ${prefixCard(v, csrf, g)} ${channelCard(v, csrf, g)} ${nicknameCard(v, csrf, g)}
      ${authorizedCard(v, csrf, g)}
    `,
  })
}

/* ————— البريفكس ————— */

function prefixCard(v: GuildSettingsView, csrf: string, g: string): Html {
  return html`<div class="card">
    <h2>البريفكس</h2>
    <p class="hint">
      الحرف الذي يسبق أوامر البوت المكتوبة، مثل <bdi>!العاب</bdi>. أوامر السلاش تعمل دائمًا ولا
      علاقة لها بهذا الإعداد.
    </p>

    ${form({
      guildId: g,
      page: 'general',
      csrf,
      kind: 'setPrefix',
      body: html`
        <label for="prefix">البريفكس الحالي</label>
        <input
          type="text"
          id="prefix"
          name="prefix"
          value="${v.prefix}"
          maxlength="5"
          size="6"
          required
          autocomplete="off"
        />
        <button class="btn btn--go" type="submit">حفظ</button>
      `,
    })}

    <div class="row" style="margin-top:14px">
      <span class="pill ${raw(v.prefixEnabled ? '' : 'pill--off')}">
        ${v.prefixEnabled ? 'أوامر البريفكس مفعّلة' : 'أوامر البريفكس معطّلة'}
      </span>
      ${form({
        guildId: g,
        page: 'general',
        csrf,
        kind: 'togglePrefix',
        body: html`
          <input type="hidden" name="enabled" value="${raw(v.prefixEnabled ? OFF : ON)}" />
          <button class="btn ${raw(v.prefixEnabled ? 'btn--danger' : 'btn--go')}" type="submit">
            ${v.prefixEnabled ? 'تعطيل' : 'تفعيل'}
          </button>
        `,
      })}
    </div>
    <p style="${raw(MUTED)};margin-top:8px">
      عند التعطيل تبقى أوامر السلاش وحدها، وهذا يفيد لو تعارض البريفكس مع بوت ثانٍ في السيرفر.
    </p>
  </div>`
}

/* ————— شات الألعاب ————— */

function channelCard(v: GuildSettingsView, csrf: string, g: string): Html {
  const known = v.allChannels.some((c) => c.id === v.gamesChannel)

  return html`<div class="card">
    <h2>شات الألعاب</h2>
    <p class="hint">
      إن حدّدت قناة، لن تبدأ أي لعبة خارجها. اترك الخيار على «كل القنوات» لتشتغل الألعاب في أي مكان.
    </p>

    ${form({
      guildId: g,
      page: 'general',
      csrf,
      kind: 'setGamesChannel',
      body: html`
        <label for="channel">القناة</label>
        <select id="channel" name="channelId" style="${raw(GROW)}">
          <option value="" ${raw(v.gamesChannel ? '' : 'selected')}>كل القنوات</option>
          ${v.allChannels.map(
            (c: ChannelOption) => html`<option
              value="${c.id}"
              dir="auto"
              ${raw(c.id === v.gamesChannel ? 'selected' : '')}
            >
              #${c.name}
            </option>`,
          )}
        </select>
        <button class="btn btn--go" type="submit">حفظ</button>
      `,
    })}

    ${v.gamesChannel && !known
      ? html`<p style="${raw(MUTED)};margin-top:10px">
          القناة المحفوظة (<bdi>${v.gamesChannel}</bdi>) لم تعد موجودة في السيرفر. اختر قناة أخرى
          أو «كل القنوات».
        </p>`
      : ''}
    ${v.allChannels.length === 0
      ? html`<p style="${raw(MUTED)};margin-top:10px">
          ما قدرنا نقرأ قنوات السيرفر. تأكد أن البوت يرى القنوات النصية ثم حدّث الصفحة.
        </p>`
      : ''}
  </div>`
}

/* ————— الاسم المستعار ————— */

function nicknameCard(v: GuildSettingsView, csrf: string, g: string): Html {
  return html`<div class="card">
    <h2>الاسم المستعار</h2>
    <p class="hint">اسم البوت داخل هذا السيرفر وحده. اترك الحقل فارغًا ليعود إلى اسمه الأصلي.</p>

    ${form({
      guildId: g,
      page: 'general',
      csrf,
      kind: 'setNickname',
      body: html`
        <label for="nickname">الاسم</label>
        <input
          type="text"
          id="nickname"
          name="nickname"
          value="${v.nickname ?? ''}"
          maxlength="32"
          style="${raw(GROW)}"
          autocomplete="off"
          placeholder="بلا اسم مستعار"
        />
        <button class="btn btn--go" type="submit">حفظ</button>
      `,
    })}
    <p style="${raw(MUTED)};margin-top:8px">
      ديسكورد يسمح بتغيير الاسم مرتين في الساعة فقط، فقد يتأخر التطبيق.
    </p>
  </div>`
}

/* ————— المصرح لهم ————— */

function authorizedCard(v: GuildSettingsView, csrf: string, g: string): Html {
  return html`<div class="card">
    <h2>المصرح لهم</h2>
    <p class="hint">
      أشخاص بأعيانهم يملكون صلاحية كاملة على البوت في هذا السيرفر، بلا حاجة إلى رول. استعملها
      للاستثناءات وحدها — الأصل أن تُعطى الصلاحيات عبر
      <a href="/dash/g/${g}/roles">صفحة الصلاحيات</a>.
    </p>

    ${v.authorized.length > 0
      ? html`<div>${v.authorized.map((id) => authorizedRow(id, csrf, g))}</div>`
      : html`<div class="empty">ما فيه أحد مضاف — الصلاحيات كلها عبر الرولات الآن.</div>`}

    <div style="margin-top:16px;padding-top:14px;border-top:3px solid var(--color-ink)">
      ${form({
        guildId: g,
        page: 'general',
        csrf,
        kind: 'addAuthorized',
        body: html`
          <label for="add-authorized">إضافة بمعرّف المستخدم</label>
          <input
            type="text"
            id="add-authorized"
            name="userId"
            inputmode="numeric"
            pattern="[0-9]{15,25}"
            placeholder="123456789012345678"
            required
            autocomplete="off"
            style="${raw(GROW)}"
          />
          <button class="btn btn--go" type="submit">إضافة</button>
        `,
      })}
      <p style="${raw(MUTED)};margin-top:8px">
        المعرّف رقم طويل تنسخه من ديسكورد: فعّل «وضع المطوّر» ثم اضغط على المستخدم واختر «نسخ
        المعرّف».
      </p>
    </div>
  </div>`
}

function authorizedRow(userId: string, csrf: string, g: string): Html {
  return html`<div class="split">
    <span style="${raw(WRAP)}"><bdi>${userId}</bdi></span>
    ${form({
      guildId: g,
      page: 'general',
      csrf,
      kind: 'removeAuthorized',
      style: ROW,
      body: html`
        <input type="hidden" name="userId" value="${userId}" />
        <button class="btn btn--danger" type="submit" aria-label="إزالة ${userId}">إزالة</button>
      `,
    })}
  </div>`
}
