import { icon, type IconName } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { ProfileScene } from './scene.ts'

/**
 * شاشة «نقاطي».
 *
 * روح الصورة المرجعية: أفتار كبير أولًا، الاسم تحته، **المجموع هو البطل**،
 * وثلاث كبسولات للمحافظ أسفلها. الترتيب البصري مقصود: اللاعب يفتح هذه
 * الشاشة ليعرف رقمًا واحدًا، فيأخذ ذلك الرقم أكبر مساحة وأثقل ظل.
 *
 * المجموع وحده أصفر بظل أحمر — لو تلوّنت المحافظ الثلاث مثله لضاع البطل
 * بين أربعة عناصر متساوية.
 */
export function profileScene(s: ProfileScene): string {
  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>نقاطي</span>
          <span class="bar__count">${rankLabel(s.rank)}</span>
        </div>

        <div
          class="card card--hero row grow"
          style="gap: var(--space-lg); align-items: center; padding: var(--space-lg)"
        >
          ${bigAvatar(s.player.avatar)}

          <div class="stack grow" style="gap: var(--space-sm); min-width: 0">
            <!--
              bdi: أسماء ديسكورد لاتينية غالبًا وتبدأ أو تنتهي بمحارف محايدة،
              فتنتقل داخل RTL إلى الطرف الخطأ بلا عزل ثنائي الاتجاه.
            -->
            <bdi class="title" style="${raw(NAME)}">${s.player.name}</bdi>
            <div class="row" style="gap: var(--space-xs); flex-wrap: wrap">
              <!-- play لا dice: الـ dice محجوز لمحفظة الروليت أسفل، وتكراره يخلط المعنيين -->
              ${statChip('play', 'لعبة', s.gamesPlayed)} ${statChip('trophy', 'فوز', s.wins)}
            </div>
          </div>

          ${totalBlock(s.total)}
        </div>

        <div class="row" style="gap: var(--space-base); align-items: stretch">
          ${wallet('dice', 'روليت', s.roulette)} ${wallet('users', 'جماعية', s.team)}
          ${wallet('target', 'فردية', s.solo)}
        </div>
      </div>
    </div>
  `.toString()
}

const NAME = [
  'display: block',
  'max-width: 560px',
  'overflow: hidden',
  'text-overflow: ellipsis',
  'white-space: nowrap',
  'font-size: 46px',
  'font-weight: var(--weight-black)',
].join('; ')

/** «غير مصنّف» أصدق من «#0» — الصفر يوحي بمركز، والغياب لا يوحي بشيء. */
function rankLabel(rank: number | null | undefined): string {
  return rank ? `المركز ${rank}` : 'غير مصنّف'
}

/**
 * أفتار المشهد أكبر من أفتار اللوبي بأكثر من الضعف، فيُبنى هنا لا عبر
 * `avatar()`: مقاس `.avatar` مثبّت في components.css وهذا المشهد وحده يخالفه.
 */
function bigAvatar(src: string | null): Html {
  const style = [
    'width: 210px',
    'height: 210px',
    'flex: none',
    'border-radius: var(--radius-pill)',
    'border: var(--stroke-thick) solid var(--color-ink)',
    'background: var(--color-cream)',
    'object-fit: cover',
  ].join('; ')

  // الظل الصلب يظهر هلالًا أحمر خلف الدائرة المفرّغة، فيُحجب عن الخانة الفارغة
  return src
    ? html`<img
        src="${src}"
        alt=""
        style="${raw(style)}; box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-red-deep)"
      />`
    : html`<div
        style="${raw(style)}; border-style: dashed; background: transparent; opacity: 0.45"
      ></div>`
}

/** كتلة المجموع — العنصر البطل: أصفر، بظل أحمر، وبأكبر رقم في المشهد. */
function totalBlock(total: number): Html {
  const box = [
    'display: flex',
    'flex-direction: column',
    'align-items: center',
    'justify-content: center',
    'gap: 2px',
    'flex: none',
    'min-width: 340px',
    'padding: var(--space-sm) var(--space-lg)',
    'background: var(--color-yellow)',
    'color: var(--on-yellow)',
    'border: var(--stroke-base) solid var(--color-ink)',
    'border-radius: var(--radius-lg)',
    'box-shadow: calc(var(--lift-base) * -1) var(--lift-base) 0 var(--color-red-deep)',
  ].join('; ')

  const number = [
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-black)',
    `font-size: ${totalSize(total)}px`,
    'line-height: 1.25',
    'letter-spacing: 0',
  ].join('; ')

  return html`
    <div style="${raw(box)}">
      <span class="meta" style="font-weight: var(--weight-bold)">مجموع النقاط</span>
      <bdi style="${raw(number)}">${num(total)}</bdi>
    </div>
  `
}

/**
 * الرقم الطويل لا يُقصّ ولا يلتفّ — يصغر.
 * سبعة أرقام بمقاس 82px تكسر البطاقة، والقصّ يخفي خانة فيقرأ اللاعب رقمًا خاطئًا.
 */
function totalSize(total: number): number {
  const digits = num(total).length
  if (digits <= 5) return 82
  if (digits <= 8) return 62
  return 46
}

/** كبسولة محفظة — ثلاثتها متساوية الوزن عمدًا، فلا تُقرأ إحداها أهم. */
function wallet(name: IconName, label: string, points: number): Html {
  const box = [
    'display: flex',
    'align-items: center',
    'gap: var(--space-sm)',
    'flex: 1',
    'min-width: 0',
    'padding: var(--space-sm) var(--space-base)',
    'background: var(--color-surface)',
    'border: var(--stroke-base) solid var(--color-ink)',
    'border-radius: var(--radius-lg)',
    'box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-ink)',
  ].join('; ')

  const mark = [
    'display: grid',
    'place-items: center',
    'flex: none',
    'width: 62px',
    'height: 62px',
    'border-radius: var(--radius-pill)',
    'background: var(--color-paper)',
    'color: var(--color-red)',
    'border: var(--stroke-thin) solid var(--color-ink)',
  ].join('; ')

  const value = [
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-black)',
    'font-size: 40px',
    'line-height: 1.35',
    'letter-spacing: 0',
  ].join('; ')

  return html`
    <div style="${raw(box)}">
      <span style="${raw(mark)}">${raw(icon(name, { size: 32, stroke: 2.4 }))}</span>
      <div class="stack" style="gap: 0; min-width: 0">
        <span class="meta">${label}</span>
        <bdi style="${raw(value)}">${num(points)}</bdi>
      </div>
    </div>
  `
}

function statChip(name: IconName, label: string, value: number): Html {
  const style = [
    'display: inline-flex',
    'align-items: center',
    'gap: 8px',
    'flex: none',
    'padding: 2px var(--space-sm)',
    'background: var(--color-cream)',
    'color: var(--color-ink)',
    'border: var(--stroke-thin) solid var(--color-ink)',
    'border-radius: var(--radius-pill)',
    'font-size: var(--size-meta)',
    'font-weight: var(--weight-medium)',
    'line-height: 1.7',
  ].join('; ')

  return html`<span style="${raw(style)}">
    ${raw(icon(name, { size: 20 }))} ${num(value)} ${label}
  </span>`
}

/**
 * أرقام عربية غربية بفواصل آلاف (DESIGN §4).
 * الفاصلة محرف محايد، فالرقم يُلفّ بـ bdi في كل موضع يُعرض فيه.
 */
function num(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function background(): Html {
  return html`
    ${blob({ width: 580, variant: 0, fill: 'var(--color-surface)', top: -190, end: -150 })}
    ${blob({ width: 460, variant: 2, fill: 'var(--color-surface)', bottom: -170, start: -140 })}
    ${blob({ width: 220, variant: 1, fill: 'var(--color-paper-tint)', top: 300, start: 120 })}
  `
}
