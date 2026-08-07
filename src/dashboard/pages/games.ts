/**
 * الألعاب.
 *
 * سيرفر واحد قد يعرض سبعًا وعشرين لعبة في هذه الصفحة، وقائمة بهذا الطول تُقرأ
 * «مستنَدًا» لا مشهدًا (DESIGN §7). لذلك كل لعبة **قصاصة مستقلة** في شبكة،
 * وفوقها حقل تصفية يختصر البحث عن لعبة بعينها.
 *
 * التصفية جافاسكربت اختياري بحت: بلا جافاسكربت تظهر كل البطاقات وتعمل كل
 * النماذج كما هي — الحقل حينها زينة لا بوابة.
 */
import { html, raw, type Html } from '../../scenes/html.ts'
import { page } from '../layout.ts'
import type { GameSettingView, GuildSettingsView } from '../types.ts'
import { GROW, MUTED, OFF, ON, ROW, WRAP, domId, form, type Flash } from './shared.ts'

const GRID = 'display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:14px'
const CARD = 'margin-bottom:0'
const FIELD = 'margin-top:14px;padding-top:12px;border-top:2px dashed var(--color-ink)'

export function gamesPage(v: GuildSettingsView, csrf: string, flash?: Flash): string {
  const on = v.games.filter((g) => g.enabled).length

  return page({
    title: `الألعاب — ${v.guild.name}`,
    guild: v.guild,
    active: 'games',
    flash: flash ?? null,
    body: html`
      <div class="card card--hero">
        <h2>الألعاب</h2>
        <p class="hint">
          اللعبة المعطّلة لا تبدأ بأمر ولا بزر في هذا السيرفر. صورة اللعبة تظهر في رسالة بدايتها،
          واتركها فارغة لتُستعمل الصورة الافتراضية.
        </p>
        <div class="row">
          <span class="pill">${v.games.length} لعبة</span>
          <span class="pill ${raw(on > 0 ? '' : 'pill--off')}">${on} مفعّلة</span>
        </div>
        ${v.games.length > 0
          ? html`<div class="row" style="margin-top:14px">
              <label for="game-filter">بحث</label>
              <input
                type="text"
                id="game-filter"
                autocomplete="off"
                placeholder="اكتب اسم لعبة"
                style="${raw(GROW)}"
              />
            </div>`
          : ''}
      </div>

      ${v.games.length > 0
        ? html`<div style="${raw(GRID)}">${v.games.map((g) => gameCard(g, v.guild.id, csrf))}</div>
            <div class="card" id="game-none" style="display:none">
              <div class="empty">ما فيه لعبة بهذا الاسم.</div>
            </div>
            ${raw(FILTER_JS)}`
        : html`<div class="card">
            <div class="empty">ما فيه ألعاب مسجّلة بعد.</div>
          </div>`}
    `,
  })
}

function gameCard(g: GameSettingView, guildId: string, csrf: string): Html {
  const imageId = domId('image', g.key)
  const entries = Object.entries(g.settings)

  return html`<div class="card" style="${raw(CARD)}" data-game="${g.key} ${g.name} ${g.tagline}">
    <div class="split" style="align-items:flex-start">
      <div style="${raw(WRAP)}">
        <h2><bdi>${g.name}</bdi></h2>
        <p class="hint" style="margin-bottom:0">${g.tagline}</p>
      </div>
      <span class="pill ${raw(g.enabled ? '' : 'pill--off')}">
        ${g.enabled ? 'مفعّلة' : 'معطّلة'}
      </span>
    </div>

    <div class="row" style="margin-top:12px">
      ${form({
        guildId,
        page: 'games',
        csrf,
        kind: 'toggleGame',
        body: html`
          <input type="hidden" name="gameKey" value="${g.key}" />
          <input type="hidden" name="enabled" value="${raw(g.enabled ? OFF : ON)}" />
          <button
            class="btn ${raw(g.enabled ? 'btn--danger' : 'btn--go')}"
            type="submit"
            aria-label="${g.enabled ? 'تعطيل' : 'تفعيل'} ${g.name}"
          >
            ${g.enabled ? 'تعطيل' : 'تفعيل'}
          </button>
        `,
      })}
    </div>

    <div style="${raw(FIELD)}">
      ${form({
        guildId,
        page: 'games',
        csrf,
        kind: 'setGameImage',
        body: html`
          <input type="hidden" name="gameKey" value="${g.key}" />
          <label for="${raw(imageId)}">رابط الصورة</label>
          <input
            type="url"
            id="${raw(imageId)}"
            name="imageUrl"
            value="${g.imageUrl ?? ''}"
            placeholder="بلا صورة مخصّصة"
            dir="ltr"
            autocomplete="off"
            style="${raw(GROW)}"
          />
          <button class="btn btn--go" type="submit">حفظ</button>
        `,
      })}
    </div>

    ${entries.length > 0
      ? html`<div style="${raw(FIELD)}">
          <p style="${raw(MUTED)};margin-bottom:10px">إعدادات اللعبة</p>
          ${entries.map(([field, value]) => settingRow(g, field, value, guildId, csrf))}
        </div>`
      : ''}
  </div>`
}

function settingRow(
  g: GameSettingView,
  field: string,
  value: unknown,
  guildId: string,
  csrf: string,
): Html {
  const id = domId('set', `${g.key}-${field}`)

  return form({
    guildId,
    page: 'games',
    csrf,
    kind: 'setGameSetting',
    style: `${ROW};margin-top:10px`,
    body: html`
      <input type="hidden" name="gameKey" value="${g.key}" />
      <input type="hidden" name="field" value="${field}" />
      <label for="${raw(id)}" style="${raw(WRAP)}"><bdi>${field}</bdi></label>
      ${control(id, value)}
      <button class="btn" type="submit">حفظ</button>
    `,
  })
}

/**
 * الحقل يتبع نوع القيمة الحالية.
 *
 * الإعدادات `Record<string, unknown>` لأن كل لعبة تعرّف إعداداتها، ولا يوجد
 * وصف نوع يُقرأ هنا. النوع المستنتَج من القيمة القائمة أدقّ من حقل نصّي دائمًا:
 * إعداد منطقي يصير قائمة نعم/لا فلا يُكتب فيه «صح» ويُرفض.
 */
function control(id: string, value: unknown): Html {
  if (typeof value === 'boolean') {
    return html`<select id="${raw(id)}" name="value">
      <option value="true" ${raw(value ? 'selected' : '')}>نعم</option>
      <option value="false" ${raw(value ? '' : 'selected')}>لا</option>
    </select>`
  }
  if (typeof value === 'number') {
    return html`<input
      type="number"
      id="${raw(id)}"
      name="value"
      value="${value}"
      step="1"
      style="width:110px"
    />`
  }
  return html`<input
    type="text"
    id="${raw(id)}"
    name="value"
    value="${text(value)}"
    autocomplete="off"
    style="${raw(GROW)}"
  />`
}

function text(value: unknown): string {
  if (value == null) return ''
  if (typeof value === 'string') return value
  try {
    return JSON.stringify(value) ?? ''
  } catch {
    return ''
  }
}

/**
 * تصفية العميل — تُخفي البطاقات غير المطابقة وتُظهر رسالة «لا نتائج».
 * تُكتب خامًا لأنها من قالبنا لا من مدخلات المستخدم.
 */
const FILTER_JS = `<script>
(function () {
  var box = document.getElementById('game-filter');
  var none = document.getElementById('game-none');
  if (!box) return;
  var cards = Array.prototype.slice.call(document.querySelectorAll('[data-game]'));
  box.addEventListener('input', function () {
    var q = box.value.trim().toLowerCase();
    var shown = 0;
    for (var i = 0; i < cards.length; i++) {
      var hit = !q || cards[i].getAttribute('data-game').toLowerCase().indexOf(q) !== -1;
      cards[i].style.display = hit ? '' : 'none';
      if (hit) shown++;
    }
    if (none) none.style.display = shown === 0 ? '' : 'none';
  });
})();
</script>`
