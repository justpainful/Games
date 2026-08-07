import { icon } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { DuelScene, PlayerView } from './scene.ts'

/**
 * مشهد المواجهة — يخدم «حجرة» و«نرد».
 *
 * القرار الحاكم: هذه الشاشة تُقرأ مرتين في الجولة الواحدة — مرة قبل الكشف
 * ومرة بعده — فيجب ألا يتحرّك فيها شيء بين اللقطتين سوى صندوق الاختيار.
 * لذلك مقاس العمودين وموضع الأفتار والاسم كلها ثابتة، والاختيار المخفي
 * يأخذ نفس مساحة الاختيار المكشوف بحدّ متقطّع بدل أن ينكمش.
 *
 * `left` و`right` مواضع على الشاشة لا ترتيب في DOM: في تخطيط RTL أول عنصر
 * يظهر يمينًا، فيُكتب `right` أولًا كي ينزل كلٌّ في جهته المسمّاة.
 */

/** علامة الاختيار المخفي — يرسمها القالب صندوقًا متقطّعًا بلا لون. */
const HIDDEN = '؟'

const SIDE = 'flex: 1 1 0; min-width: 0'

export function duelScene(s: DuelScene): string {
  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>${s.game.name}</span>
          ${s.round
            ? html`<span class="bar__count">الجولة ${s.round.index} من ${s.round.total}</span>`
            : ''}
        </div>

        <div class="row grow" style="align-items: stretch; gap: var(--space-base)">
          ${corner(s.right)} ${middle(s.verdict)} ${corner(s.left)}
        </div>
      </div>
    </div>
  `.toString()
}

/** ركن لاعب: أفتار، اسم، صندوق اختياره، ونقاطه إن وُجدت. */
function corner(side: { player: PlayerView; label: string; score?: number }): Html {
  return html`
    <div
      class="card stack center"
      style="${raw(SIDE)}; justify-content: center; gap: var(--space-base); padding-block: var(--space-lg)"
    >
      ${face(side.player.avatar, 128)}
      <!-- bdi: الاسم اللاتيني داخل RTL تنتقل نقطته أو شرطته للطرف الخطأ بلا عزل -->
      <bdi
        class="title"
        style="max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap"
        >${side.player.name}</bdi
      >
      ${pick(side.label)} ${side.score === undefined ? '' : points(side.score)}
    </div>
  `
}

/**
 * الأفتار هنا أكبر من `.avatar` المعتاد: المواجهة وجهان قبل أي شيء آخر،
 * ومقاس 76px الذي يخدم قائمة اللوبي يضيع في عمود عرضه 490px.
 */
function face(src: string | null, size: number): Html {
  const base = [
    `width:${size}px`,
    `height:${size}px`,
    'flex: none',
    'border-radius: var(--radius-pill)',
    'border: var(--stroke-base) solid var(--color-ink)',
    'background: var(--color-cream)',
    'box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-ink)',
  ].join(';')

  return src
    ? html`<img style="${raw(base)}; object-fit: cover" src="${src}" alt="" />`
    : raw(`<div style="${base}; border-style: dashed; background: transparent; opacity: .45"></div>`)
}

/**
 * صندوق الاختيار — بطل البطاقة.
 * المكشوف أصفر بظل أحمر (اندماج لوني الهوية، DESIGN §5)، والمخفي حدّ متقطّع
 * على فراغ: اللاعب يرى أن الخصم اختار، ولا يرى ماذا اختار.
 */
function pick(label: string): Html {
  const text = label.trim()
  const hidden = text.length === 0 || text === HIDDEN

  const base = [
    'min-width: 280px',
    'max-width: 100%',
    'padding: var(--space-sm) var(--space-base)',
    'border-radius: var(--radius-base)',
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-black)',
    'line-height: 1.35',
    'text-align: center',
    'text-wrap: balance',
    `font-size: ${pickSize(hidden ? HIDDEN : text)}px`,
  ]

  const skin = hidden
    ? [
        'background: transparent',
        'border: var(--stroke-base) dashed color-mix(in srgb, var(--color-ink) 45%, transparent)',
        'color: color-mix(in srgb, var(--color-ink) 45%, transparent)',
      ]
    : [
        'background: var(--color-yellow)',
        'color: var(--on-yellow)',
        'border: var(--stroke-base) solid var(--color-ink)',
        'box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-red-deep)',
      ]

  return html`<div style="${raw([...base, ...skin].join(';'))}">
    <bdi>${hidden ? HIDDEN : text}</bdi>
  </div>`
}

/** المقاس يتبع الطول: «5 + 6 = 11» و«مقص» لا يحتملان نفس الحجم. */
function pickSize(label: string): number {
  const n = [...label].length
  if (n <= 2) return 68
  if (n <= 6) return 54
  if (n <= 12) return 42
  return 32
}

function points(score: number): Html {
  const style = [
    'display: inline-flex',
    'align-items: center',
    'gap: var(--space-xs)',
    'padding: 2px var(--space-sm)',
    'background: var(--color-red)',
    'color: var(--on-red)',
    'border: var(--stroke-thin) solid var(--color-ink)',
    'border-radius: var(--radius-pill)',
    'font-size: var(--size-meta)',
    'font-weight: var(--weight-bold)',
  ].join(';')
  return html`<div style="${raw(style)}">
    ${raw(icon('star', { size: 20, fill: true }))} ${score}
  </div>`
}

/**
 * عمود الحكم بين الركنين.
 * الخطّان الحبريّان فوقه وتحته ليسا زينة: بلا فاصل رأسي تُقرأ البطاقتان
 * قائمةً من عنصرين لا وجهين متقابلين.
 */
function middle(verdict: string | undefined): Html {
  const text = verdict?.trim() ? verdict.trim() : 'مواجهة'

  const card = [
    'width: 100%',
    'padding: var(--space-base) var(--space-sm)',
    'background: var(--color-surface)',
    'color: var(--color-ink)',
    'border: var(--stroke-base) solid var(--color-ink)',
    'border-radius: var(--radius-base)',
    'box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-ink)',
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-black)',
    'line-height: 1.4',
    'text-align: center',
    'text-wrap: balance',
    `font-size: ${verdictSize(text)}px`,
  ].join(';')

  return html`
    <div
      class="stack center"
      style="width: 330px; flex: none; justify-content: center; gap: var(--space-sm)"
    >
      ${bar()}
      <div style="${raw(card)}"><bdi>${text}</bdi></div>
      ${bar()}
    </div>
  `
}

function bar(): Html {
  const style =
    'width: var(--stroke-base); height: 74px; background: var(--color-ink); border-radius: var(--radius-pill)'
  return html`<div style="${raw(style)}"></div>`
}

function verdictSize(text: string): number {
  const n = [...text].length
  if (n <= 8) return 46
  if (n <= 16) return 38
  if (n <= 28) return 31
  return 26
}

/** نفس عمق خلفية اللوبي — كتلتان خلف البطاقتين وكتلة صغيرة تحت عمود الحكم. */
function background(): Html {
  return html`
    ${blob({ width: 540, variant: 2, fill: 'var(--color-surface)', top: -180, end: -150 })}
    ${blob({ width: 520, variant: 1, fill: 'var(--color-surface)', bottom: -190, start: -150 })}
    ${blob({ width: 250, variant: 1, fill: 'var(--color-paper-tint)', bottom: 60, start: 625, rotate: -18 })}
  `
}
