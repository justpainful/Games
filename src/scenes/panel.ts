import { icon } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { PanelScene } from './scene.ts'

/**
 * لوحة الإعدادات.
 *
 * اللوحة ليست جدولًا: كل بند **قصاصة ورقية** مستقلة لها حدّها، فتُقرأ الحالة
 * من شكل البند قبل قراءة نصّه. الحالة تُحمل بثلاث علامات لا بثلاثة ألوان جديدة:
 * كبسولة صفراء بعلامة صح = مفعّل، دائرة متقطّعة بعلامة إكس = معطّل،
 * ونقطة حمراء صغيرة = بند بقيمة لا بمفتاح.
 *
 * عمودان عند تجاوز ستة بنود: اثنا عشر بندًا في عمود واحد يصنعان "مستنَدًا"،
 * وهذا ممنوع في DESIGN §7 — الشاشة مشهد لا مستند.
 */
export function panelScene(s: PanelScene): string {
  const cols = s.items.length > 6 ? 2 : 1

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>${s.title}</span>
          ${s.subtitle ? html`<span class="bar__count">${s.subtitle}</span>` : ''}
        </div>

        <div class="card grow stack stack--lg" style="justify-content: center">
          ${s.items.length > 0 ? grid(s.items, cols) : emptyNote()}
          ${s.footer ? html`<div class="note">${s.footer}</div>` : ''}
        </div>
      </div>
    </div>
  `.toString()
}

function grid(items: PanelScene['items'], cols: number): Html {
  const style =
    `display: grid; gap: var(--space-sm);` +
    ` grid-template-columns: repeat(${cols}, minmax(0, 1fr))`
  return html`<div style="${raw(style)}">${items.map(row)}</div>`
}

const ROW = [
  'display: flex',
  'align-items: center',
  'gap: var(--space-sm)',
  'min-width: 0',
  'padding: var(--space-xs) var(--space-sm)',
  'background: var(--color-paper)',
  'border: var(--stroke-thin) solid var(--color-ink)',
  'border-radius: var(--radius-sm)',
].join('; ')

/** الاسم يتمدد ويُقصّ، فالبند يبقى سطرًا واحدًا مهما طال الإعداد. */
const LABEL = [
  'flex: 1',
  'min-width: 0',
  'overflow: hidden',
  'text-overflow: ellipsis',
  'white-space: nowrap',
].join('; ')

const VALUE = [
  'flex: none',
  'max-width: 340px',
  'overflow: hidden',
  'text-overflow: ellipsis',
  'white-space: nowrap',
  'padding: 2px var(--space-sm)',
  'background: var(--color-cream)',
  'color: var(--color-ink)',
  'border: var(--stroke-thin) solid var(--color-ink)',
  'border-radius: var(--radius-pill)',
  'font-size: var(--size-meta)',
  'font-weight: var(--weight-medium)',
  'line-height: 1.7',
].join('; ')

function row(it: PanelScene['items'][number]): Html {
  return html`
    <div style="${raw(ROW)}">
      ${badge(it.on)}
      <span class="label" style="${raw(LABEL)}">${it.label}</span>
      <!-- bdi: القيمة قد تكون بريفكس أو رابطًا أو اسم رول لاتينيًا داخل تخطيط RTL -->
      <bdi style="${raw(VALUE)}">${it.value}</bdi>
    </div>
  `
}

const BADGE = [
  'display: grid',
  'place-items: center',
  'flex: none',
  'width: 46px',
  'height: 46px',
  'border-radius: var(--radius-pill)',
].join('; ')

/**
 * علامة الحالة. البند بلا مفتاح (`on === undefined`) يأخذ نقطة حمراء لا أيقونة:
 * تكرار أيقونة واحدة اثنتي عشرة مرة يصنع ضجيجًا بلا معلومة.
 */
function badge(on: boolean | undefined): Html {
  if (on === undefined) {
    const dot =
      'width: 14px; height: 14px; border-radius: var(--radius-pill);' +
      ' background: var(--color-red); border: 2px solid var(--color-ink)'
    return html`<span style="${raw(BADGE)}"><span style="${raw(dot)}"></span></span>`
  }

  if (on) {
    const style =
      `${BADGE}; background: var(--color-yellow); color: var(--on-yellow);` +
      ' border: var(--stroke-thin) solid var(--color-ink)'
    return html`<span style="${raw(style)}">${raw(icon('check', { size: 24, stroke: 2.8 }))}</span>`
  }

  const style =
    `${BADGE}; background: transparent;` +
    ' color: color-mix(in srgb, var(--color-ink) 55%, transparent);' +
    ' border: var(--stroke-thin) dashed color-mix(in srgb, var(--color-ink) 45%, transparent)'
  return html`<span style="${raw(style)}">${raw(icon('cross', { size: 24, stroke: 2.8 }))}</span>`
}

/** لوحة بلا بنود تبقى مشهدًا يشرح نفسه لا بطاقة خاوية. */
function emptyNote(): Html {
  return html`<div
    class="note"
    style="align-self: center; display: inline-flex; align-items: center;
           gap: var(--space-xs); margin-block: var(--space-xl)"
  >
    ${raw(icon('gear', { size: 22 }))} ما فيه إعدادات تُعرض هنا
  </div>`
}

/** نفس عمق خلفية اللوبي — كتل بلا حد تطفو خلف البطاقات فلا تزاحم النص. */
function background(): Html {
  return html`
    ${blob({ width: 600, variant: 2, fill: 'var(--color-surface)', top: -180, end: -160 })}
    ${blob({ width: 470, variant: 1, fill: 'var(--color-surface)', bottom: -180, start: -150 })}
    ${blob({ width: 230, variant: 0, fill: 'var(--color-paper-tint)', top: 260, start: 100 })}
  `
}
