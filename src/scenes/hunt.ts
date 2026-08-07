import { icon } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { HuntScene, PlayerView } from './scene.ts'

/**
 * مشهد البحث — لعبة هايد.
 *
 * الشبكة هي اللعبة كلها: اللاعب لا يحتاج قراءة سطر ليعرف أين وصل البحث،
 * يكفي أن يرى ما بقي أبيض. لذلك الخانة المستبعدة **تُشطب ولا تُحذف** —
 * حذفها كان سيغيّر مواضع الأرقام بين لقطة وأخرى ويربك من يتابع.
 */

export function huntScene(s: HuntScene): string {
  const total = Math.max(0, Math.floor(s.total))
  const cleared = new Set(s.cleared.filter((n) => n >= 1 && n <= total))
  const left = total - cleared.size

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>${s.game.name}</span>
          <span class="bar__count">بقي ${left} من ${total}</span>
        </div>

        <div class="row grow" style="align-items: stretch; gap: var(--space-base)">
          <!-- يمينًا: من يبحث الآن وماذا يفعل -->
          <aside class="stack stack--lg" style="width: 440px">
            <div class="card card--hero stack" style="gap: var(--space-sm)">
              <h1
                style="font-family: var(--font-display), sans-serif; font-weight: var(--weight-black);
                       font-size: ${headlineSize(s.headline)}px; line-height: var(--leading-tight);
                       letter-spacing: 0"
              >
                ${s.headline}
              </h1>
              ${s.seeker ? seekerRow(s.seeker) : ''}
            </div>

            <div class="card grow stack" style="justify-content: center">
              ${legend('var(--color-cream)', 'خانة لم تُجرَّب بعد', false)}
              ${legend('var(--color-paper-tint)', 'خانة مشطوبة — جُرّبت وخابت', true)}
            </div>
          </aside>

          <!-- يسارًا: الشبكة -->
          <main class="card grow" style="display: grid; place-items: center">
            ${total > 0 ? grid(total, cleared) : emptyNote()}
          </main>
        </div>

        ${s.note ? noteChip(s.note) : ''}
      </div>
    </div>
  `.toString()
}

/* ————— الشبكة ————— */

/** عدد الأعمدة يتبع العدد الكلي فتبقى الشبكة قريبة من المربّع مهما كبرت. */
function columns(total: number): number {
  if (total <= 6) return 3
  if (total <= 12) return 4
  if (total <= 20) return 5
  if (total <= 30) return 6
  return 7
}

function cellSize(cols: number): number {
  if (cols <= 3) return 150
  if (cols === 4) return 132
  if (cols === 5) return 116
  if (cols === 6) return 100
  return 88
}

function grid(total: number, cleared: Set<number>): Html {
  const cols = columns(total)
  const size = cellSize(cols)
  const numbers = Array.from({ length: total }, (_, i) => i + 1)

  return html`
    <div
      style="display: grid; gap: var(--space-sm);
             grid-template-columns: repeat(${cols}, ${size}px)"
    >
      ${numbers.map((n) => cell(n, size, cleared.has(n)))}
    </div>
  `
}

function cell(n: number, size: number, struck: boolean): Html {
  const style = [
    'position: relative',
    `width: ${size}px`,
    `height: ${size}px`,
    'display: grid',
    'place-items: center',
    'border-radius: var(--radius-sm)',
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-black)',
    `font-size: ${Math.round(size * 0.42)}px`,
    'line-height: 1',
    'letter-spacing: 0',
    struck
      ? 'background: var(--color-paper-tint);' +
        ' border: var(--stroke-thin) solid color-mix(in srgb, var(--color-ink) 40%, transparent);' +
        ' color: color-mix(in srgb, var(--color-ink) 45%, transparent)'
      : 'background: var(--color-cream); color: var(--color-ink);' +
        ' border: var(--stroke-base) solid var(--color-ink);' +
        ' box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-ink)',
  ].join('; ')

  return html`
    <div style="${raw(style)}">
      ${n}${struck ? strike(size) : ''}
    </div>
  `
}

/**
 * الشطب خطّان مرسومان فوق الخانة لا `text-decoration`: خط النص يشطب الرقم وحده
 * ويبقى المربّع يُقرأ متاحًا من بعيد، أما الخطّان القطريان فيلغيان الخانة كلها.
 */
function strike(size: number): Html {
  const pad = Math.round(size * 0.18)
  const far = size - pad
  return raw(`
    <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" fill="none"
         style="position: absolute; inset: 0">
      <path d="M${pad} ${pad} L${far} ${far} M${far} ${pad} L${pad} ${far}"
            stroke="var(--color-red)" stroke-width="7" stroke-linecap="round" opacity="0.75"/>
    </svg>`)
}

/* ————— العمود الأيمن ————— */

function seekerRow(p: PlayerView): Html {
  return html`
    <div class="row" style="gap: var(--space-sm)">
      ${avatarOf(p, 76)}
      <div class="stack" style="gap: 0">
        <span class="meta text--muted">الدور على</span>
        <!-- bdi: الاسم اللاتيني داخل تخطيط RTL ينقلب طرفاه بلا عزل ثنائي الاتجاه -->
        <bdi
          class="player__name"
          style="max-width: 260px; font-family: var(--font-display), sans-serif;
                 font-weight: var(--weight-bold); font-size: var(--size-title)"
        >
          ${p.name}
        </bdi>
      </div>
    </div>
  `
}

function legend(fill: string, text: string, struck: boolean): Html {
  const box = [
    'position: relative',
    'width: 54px',
    'height: 54px',
    'flex: none',
    'border-radius: var(--radius-sm)',
    `background: ${fill}`,
    struck
      ? 'border: var(--stroke-thin) solid color-mix(in srgb, var(--color-ink) 40%, transparent)'
      : 'border: var(--stroke-base) solid var(--color-ink)',
  ].join('; ')

  return html`
    <div class="row" style="gap: var(--space-sm)">
      <div style="${raw(box)}">${struck ? strike(54) : ''}</div>
      <span class="meta">${text}</span>
    </div>
  `
}

/* ————— مشترك ————— */

function headlineSize(headline: string): number {
  const n = [...headline].length
  if (n <= 20) return 46
  if (n <= 38) return 38
  return 32
}

function avatarOf(p: PlayerView, size: number): Html {
  const style = [
    `width: ${size}px`,
    `height: ${size}px`,
    'flex: none',
    'border-radius: var(--radius-pill)',
    'border: var(--stroke-base) solid var(--color-ink)',
    'background: var(--color-cream)',
    'object-fit: cover',
    'box-shadow: 0 0 0 var(--stroke-thin) var(--color-yellow)',
  ].join('; ')

  return p.avatar
    ? html`<img src="${p.avatar}" alt="" style="${raw(style)}" />`
    : html`<div style="${raw(style)}; border-style: dashed; opacity: .5"></div>`
}

const CHIP = 'align-self: center; display: inline-flex; align-items: center; gap: var(--space-xs)'

function noteChip(note: string): Html {
  return html`<div class="note" style="${raw(CHIP)}">
    ${raw(icon('target', { size: 22 }))} ${note}
  </div>`
}

function emptyNote(): Html {
  return html`<div class="note" style="${raw(CHIP)}">
    ${raw(icon('hourglass', { size: 22 }))} لا خانات في هذه الجولة
  </div>`
}

function background(): Html {
  return html`
    ${blob({ width: 560, variant: 2, fill: 'var(--color-surface)', top: -170, end: -140 })}
    ${blob({ width: 500, variant: 1, fill: 'var(--color-surface)', bottom: -180, start: -150 })}
    ${blob({ width: 240, variant: 0, fill: 'var(--color-paper-tint)', bottom: 120, end: 60 })}
  `
}
