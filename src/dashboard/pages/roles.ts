/**
 * الصلاحيات.
 *
 * هذه الصفحة أكثر ما يُساء فهمه في اللوحة: ثلاثة رولات بأسماء متقاربة، فيضع
 * صاحب السيرفر رول «الألعاب» ظنًّا أنه يفتح الإعدادات، أو يعطي «الإدارة» لمن
 * يريده أن يوزّع نقاطًا فقط.
 *
 * لذلك تحت كل قسم **جملة واحدة تقول ما يقدر عليه صاحب الرول وما لا يقدر عليه**،
 * ونفيُ الصلاحية مذكور صراحةً لا مستنتَجًا من غيابه. الترتيب من الأوسع إلى
 * الأضيق ليُقرأ الفرق تنازليًا.
 */
import type { RoleKind } from '@prisma/client'
import { html, raw, type Html } from '../../scenes/html.ts'
import { page } from '../layout.ts'
import type { GuildSettingsView, RoleOption } from '../types.ts'
import { GROW, MUTED, ROW, WRAP, domId, form, roleDot, type Flash } from './shared.ts'

type Kind = { id: RoleKind; title: string; what: string; not: string }

/** الترتيب مقصود: من الصلاحية الأوسع إلى الأضيق. */
const KINDS: Kind[] = [
  {
    id: 'ADMIN',
    title: 'رول الإدارة',
    what: 'يبدأ الألعاب ويوقفها، ويعدّل كل إعدادات البوت في هذا السيرفر — بما فيها هذه الصفحة نفسها.',
    not: 'أوسع الثلاثة. لا تعطه لمن تريده أن يشغّل الألعاب فقط.',
  },
  {
    id: 'GAMES',
    title: 'رول الألعاب',
    what: 'يبدأ الألعاب والإيفنتات ويوقفها.',
    not: 'لا يفتح الإعدادات ولا يعطي نقاطًا. هذا رول المشرفين الذين يديرون الجلسات.',
  },
  {
    id: 'POINTS',
    title: 'رول النقاط',
    what: 'يعطي النقاط ويخصمها ويصفّر لاعبًا.',
    not: 'لا يبدأ لعبة ولا يعدّل إعدادًا. مستقل تمامًا عن رول الألعاب.',
  },
]

export function rolesPage(v: GuildSettingsView, csrf: string, flash?: Flash): string {
  return page({
    title: `الصلاحيات — ${v.guild.name}`,
    guild: v.guild,
    active: 'roles',
    flash: flash ?? null,
    body: html`
      <div class="card card--hero">
        <h2>ثلاثة رولات لا رول واحد</h2>
        <p class="hint" style="margin-bottom:0">
          الرولات الثلاثة منفصلة تمامًا: من عنده رول الألعاب لا يقدر يعطي نقاطًا، ومن عنده رول
          النقاط لا يقدر يبدأ لعبة. أعطِ الشخص الرول الذي يطابق شغله وحده. صاحب السيرفر ومن يملك
          صلاحية «إدارة السيرفر» في ديسكورد يقدر على كل شيء بلا أي رول من هذه.
        </p>
      </div>
      ${KINDS.map((k) => kindCard(k, v, csrf))}
    `,
  })
}

function kindCard(k: Kind, v: GuildSettingsView, csrf: string): Html {
  const g = v.guild.id
  const added = v.roles[k.id] ?? []
  const byId = new Map(v.allRoles.map((r) => [r.id, r]))
  const free = v.allRoles.filter((r) => !added.includes(r.id))
  const inputId = domId('add-role', k.id)

  return html`<div class="card">
    <h2>${k.title}</h2>
    <p class="hint" style="margin-bottom:4px">${k.what}</p>
    <p style="${raw(MUTED)};margin-bottom:14px">${k.not}</p>

    ${added.length > 0
      ? html`<div>${added.map((id) => roleRow(id, byId.get(id), k, csrf, g))}</div>`
      : html`<div class="empty">ما فيه رول مضاف هنا.</div>`}

    <div style="margin-top:16px;padding-top:14px;border-top:3px solid var(--color-ink)">
      ${free.length > 0
        ? form({
            guildId: g,
            page: 'roles',
            csrf,
            kind: 'addRole',
            body: html`
              <input type="hidden" name="role" value="${k.id}" />
              <label for="${raw(inputId)}">إضافة رول إلى ${k.title}</label>
              <select id="${raw(inputId)}" name="roleId" required style="${raw(GROW)}">
                ${free.map(
                  (r) => html`<option value="${r.id}" dir="auto">${r.name}</option>`,
                )}
              </select>
              <button class="btn btn--go" type="submit">إضافة</button>
            `,
          })
        : html`<p style="${raw(MUTED)}">
            ${v.allRoles.length === 0
              ? 'ما قدرنا نقرأ رولات السيرفر. تأكد أن البوت يملك صلاحية قراءة الرولات ثم حدّث الصفحة.'
              : 'كل رولات السيرفر مضافة هنا.'}
          </p>`}
    </div>
  </div>`
}

function roleRow(
  roleId: string,
  role: RoleOption | undefined,
  k: Kind,
  csrf: string,
  g: string,
): Html {
  return html`<div class="split">
    <span style="${raw(WRAP)}">
      ${roleDot(role?.color ?? 0)}
      ${role
        ? html`<bdi>${role.name}</bdi>`
        : html`<bdi>${roleId}</bdi>
            <span style="${raw(MUTED)}">(رول محذوف من السيرفر)</span>`}
    </span>
    ${form({
      guildId: g,
      page: 'roles',
      csrf,
      kind: 'removeRole',
      style: ROW,
      body: html`
        <input type="hidden" name="role" value="${k.id}" />
        <input type="hidden" name="roleId" value="${roleId}" />
        <button
          class="btn btn--danger"
          type="submit"
          aria-label="إزالة ${role?.name ?? roleId} من ${k.title}"
        >
          إزالة
        </button>
      `,
    })}
  </div>`
}
