/**
 * النقاط.
 *
 * الصفحة الوحيدة التي تعدّل أرصدة اللاعبين، فتفصل بين فعل قابل للتراجع وفعل
 * غير قابل له: الإعطاء والخصم نموذج واحد بمقدار موجب أو سالب — لأن «اخصم 5»
 * هو «أعطِ 5-» ولا يستحق زرًّا ثانيًا — أما التصفير فيمحو المحافظ الثلاث ولا
 * يُستعاد، فيُخبَّأ خلف خطوة تأكيد.
 *
 * التأكيد `<details>` لا `confirm()`: الصفحة يجب أن تعمل بلا جافاسكربت،
 * وتأكيد يعتمد على سكربت معناه زر تصفير بلا حماية عند تعطيله.
 */
import { html, raw, type Html } from '../../scenes/html.ts'
import { page } from '../layout.ts'
import type { LeaderView, ManagedGuild } from '../types.ts'
import { GROW, MUTED, ROW, WRAP, avatarUrl, form, type Flash } from './shared.ts'

const WALLETS = [
  { id: 'roulette', label: 'روليت' },
  { id: 'team', label: 'جماعية' },
  { id: 'solo', label: 'فردية' },
] as const

const SCROLL = 'overflow-x:auto;-webkit-overflow-scrolling:touch'
const NUM = 'text-align:start;font-variant-numeric:tabular-nums;white-space:nowrap'
const NAME_CELL = `${WRAP};display:flex;align-items:center;gap:8px;min-width:150px`

export function pointsPage(
  rows: LeaderView[],
  csrf: string,
  guildId: string,
  guild?: ManagedGuild | null,
  flash?: Flash,
): string {
  const shell: ManagedGuild = guild ?? {
    id: guildId,
    name: 'هذا السيرفر',
    iconHash: null,
    botPresent: true,
  }

  return page({
    title: `النقاط — ${shell.name}`,
    guild: shell,
    active: 'points',
    flash: flash ?? null,
    body: html`
      ${awardCard(rows, csrf, guildId)}

      <div class="card">
        <h2>اللاعبون</h2>
        <p class="hint">
          المجموع هو حاصل جمع المحافظ الثلاث. الترتيب كما وصل من قاعدة البيانات.
        </p>
        ${rows.length > 0 ? table(rows, csrf, guildId) : emptyRows()}
      </div>
    `,
  })
}

/* ————— إعطاء / خصم ————— */

function awardCard(rows: LeaderView[], csrf: string, guildId: string): Html {
  return html`<div class="card card--hero">
    <h2>إعطاء وخصم</h2>
    <p class="hint">
      المقدار الموجب يُضيف والسالب يخصم — اكتب <bdi dir="ltr">-5</bdi> لخصم خمس نقاط. المحفظة تحدّد أي رصيد
      يتغيّر، والمجموع يتبعها تلقائيًا.
    </p>

    ${form({
      guildId,
      page: 'points',
      csrf,
      kind: 'awardPoints',
      style: `${ROW};align-items:flex-end`,
      body: html`
        <div>
          <label for="award-user">اللاعب</label><br />
          <input
            type="text"
            id="award-user"
            name="userId"
            list="dash-players"
            inputmode="numeric"
            pattern="[0-9]{15,25}"
            placeholder="معرّف المستخدم"
            required
            autocomplete="off"
            style="${raw(GROW)}"
          />
        </div>
        <div>
          <label for="award-wallet">المحفظة</label><br />
          <select id="award-wallet" name="wallet" required>
            ${WALLETS.map((w) => html`<option value="${w.id}">${w.label}</option>`)}
          </select>
        </div>
        <div>
          <label for="award-amount">المقدار</label><br />
          <input
            type="number"
            id="award-amount"
            name="amount"
            step="1"
            required
            placeholder="5"
            style="width:110px"
          />
        </div>
        <button class="btn btn--go" type="submit">تنفيذ</button>
      `,
    })}
    ${rows.length > 0
      ? html`<datalist id="dash-players">
          ${rows.map((r) => html`<option value="${r.userId}">${r.displayName}</option>`)}
        </datalist>`
      : ''}
    <p style="${raw(MUTED)};margin-top:10px">
      المعرّف رقم طويل تنسخه من ديسكورد بعد تفعيل «وضع المطوّر»، أو تختاره من قائمة اللاعبين
      الظاهرين تحت.
    </p>
  </div>`
}

/* ————— الجدول ————— */

function table(rows: LeaderView[], csrf: string, guildId: string): Html {
  return html`<div style="${raw(SCROLL)}">
    <table>
      <thead>
        <tr>
          <th style="${raw(NUM)}">#</th>
          <th>اللاعب</th>
          <th style="${raw(NUM)}">روليت</th>
          <th style="${raw(NUM)}">جماعية</th>
          <th style="${raw(NUM)}">فردية</th>
          <th style="${raw(NUM)}">المجموع</th>
          <th style="${raw(NUM)}">لعب</th>
          <th style="${raw(NUM)}">فاز</th>
          <th>تصفير</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => row(r, i + 1, csrf, guildId))}
      </tbody>
    </table>
  </div>`
}

function row(r: LeaderView, rank: number, csrf: string, guildId: string): Html {
  const src = avatarUrl(r.userId, r.avatarHash)

  return html`<tr>
    <td style="${raw(NUM)}">${rank}</td>
    <td>
      <span style="${raw(NAME_CELL)}">
        ${src
          ? html`<img class="avatar" src="${src}" alt="" />`
          : html`<span
              class="avatar"
              aria-hidden="true"
              style="display:inline-block;background:var(--color-cream);border-style:dashed"
            ></span>`}
        <span style="${raw(WRAP)}">
          <bdi>${r.displayName}</bdi>
          <span style="${raw(MUTED)};display:block"><bdi>${r.userId}</bdi></span>
        </span>
      </span>
    </td>
    <td style="${raw(NUM)}">${num(r.roulette)}</td>
    <td style="${raw(NUM)}">${num(r.team)}</td>
    <td style="${raw(NUM)}">${num(r.solo)}</td>
    <td style="${raw(NUM)};font-weight:700">${num(r.total)}</td>
    <td style="${raw(NUM)}">${num(r.gamesPlayed)}</td>
    <td style="${raw(NUM)}">${num(r.wins)}</td>
    <td>${resetCell(r, csrf, guildId)}</td>
  </tr>`
}

function resetCell(r: LeaderView, csrf: string, guildId: string): Html {
  return html`<details>
    <summary
      class="btn btn--danger"
      style="list-style:none;white-space:nowrap"
      aria-label="تصفير نقاط ${r.displayName}"
    >
      تصفير
    </summary>
    <div style="margin-top:10px;min-width:190px">
      <p style="${raw(MUTED)};margin-bottom:8px">
        يمحو المحافظ الثلاث ولا يُستعاد.
      </p>
      ${form({
        guildId,
        page: 'points',
        csrf,
        kind: 'resetPlayer',
        body: html`
          <input type="hidden" name="userId" value="${r.userId}" />
          <button class="btn btn--danger" type="submit">أكّد التصفير</button>
        `,
      })}
    </div>
  </details>`
}

/** أرقام غربية بفواصل آلاف — 2,685,915 يُقرأ أسرع من 2685915. */
function num(n: number): string {
  return n.toLocaleString('en-US')
}

function emptyRows(): Html {
  return html`<div class="empty">
    <strong style="font-size:17px">ما فيه لاعبون بعد</strong>
    <p style="margin-top:10px">
      أول لاعب يظهر هنا بعد أول جولة، أو بعد أول إعطاء نقاط من النموذج فوق.
    </p>
  </div>`
}
