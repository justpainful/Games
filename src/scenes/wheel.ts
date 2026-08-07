import { icon } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { PlayerView, WheelScene } from './scene.ts'

/**
 * مشهد العجلة — الروليت.
 *
 * القطاعات محسوبة رياضيًا لا مرسومة كصورة جاهزة: عدد اللاعبين يتغيّر من ٢ إلى ٢٠،
 * وأي صورة ثابتة كانت ستحتاج تسع عشرة نسخة. الحساب هنا يعطي عجلة صحيحة لأي عدد.
 *
 * قرار حاكم: عند وجود فائز **تُدار العجلة** حتى يقف قطاعه تحت المؤشّر بدل الاكتفاء
 * بتلوينه. الصورة وحدها تشرح النتيجة، وهذا هو شرط DESIGN §1.
 */

/** إحداثيات العجلة داخل مربّع SVG واحد — كل الأرقام مشتقة منها. */
const SIZE = 620
const CX = 310
const CY = 324
const R = 270
/** إزاحة الظل الصلب: نفس اتجاه ظلال القصاصات (يسار-أسفل) */
const LIFT = 11
/** القطاع الأول يبدأ من أعلى العجلة، والزوايا تزيد باتجاه عقارب الساعة (y لأسفل) */
const START = -90

export function wheelScene(s: WheelScene): string {
  const players = s.players
  const picked = s.picked ?? null
  const pickedIndex = picked ? players.findIndex((p) => p.id === picked.id) : -1

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>${s.game.name}</span>
          <span class="bar__count">${players.length} ${peopleWord(players.length)}</span>
        </div>

        <div class="row grow" style="align-items: stretch; gap: var(--space-base)">
          <!-- يمينًا: من فاز، ثم بقية الأسماء -->
          <aside class="stack stack--lg" style="width: 470px">
            ${picked ? winnerCard(picked) : spinCard()} ${rosterCard(players, picked)}
          </aside>

          <!-- يسارًا: العجلة نفسها -->
          <main
            class="card card--hero grow"
            style="display: grid; place-items: center; padding: var(--space-sm)"
          >
            ${wheel(players, pickedIndex)}
          </main>
        </div>

        ${s.note ? noteChip(s.note) : ''}
      </div>
    </div>
  `.toString()
}

/* ————— العجلة ————— */

/**
 * ثلاثة ألوان ورقية بالتناوب. لونان فقط كانا سيجعلان القطاعين الأول والأخير
 * متطابقين عند العدد الفردي فيضيع الحد بينهما.
 */
const SECTOR_FILLS = [
  'var(--color-surface)',
  'var(--color-paper-tint)',
  'var(--color-cream)',
] as const

/**
 * حتى ستة قطاعات تبقى الأسماء **أفقية**: القطاع الواسع يترك مساحة تكفيها، والنص
 * القُطري في عجلة من ثلاثة قطاعات يخرج عموديًا تمامًا فلا يُقرأ. فوق ستة يضيق
 * القطاع فيصير القُطري هو الوحيد الذي يتّسع.
 */
const UPRIGHT_MAX = 6

function wheel(players: PlayerView[], pickedIndex: number): Html {
  const n = players.length
  if (n === 0) return emptyWheel()

  const step = 360 / n
  // تدوير العجلة كي يقف مركز قطاع الفائز تمامًا تحت المؤشّر.
  // الدوران يُدمج في كل زاوية بدل تدوير مجموعة: عندها تكون كل زاوية هنا هي
  // زاويتها على الشاشة فعلًا، وقرار قلب النص يُتّخذ على القيمة الصحيحة.
  const spin = pickedIndex >= 0 ? -90 - (START + step * pickedIndex + step / 2) : 0

  const sectors = players.map((p, i) => {
    const a0 = START + step * i + spin
    return sector(p, {
      index: i,
      count: n,
      a0,
      a1: a0 + step,
      mid: a0 + step / 2,
      picked: i === pickedIndex,
    })
  })

  return raw(`
    <svg width="${SIZE}" height="${SIZE}" viewBox="0 0 ${SIZE} ${SIZE}" fill="none"
         style="color: var(--color-ink)">
      <!-- الظل الصلب: نفس توقيع القصاصة المقصوصة، دائرة مزاحة تحت العجلة -->
      <circle cx="${CX - LIFT}" cy="${CY + LIFT}" r="${R}" fill="var(--color-ink)"/>
      ${sectors.map((x) => x.toString()).join('')}
      <circle cx="${CX}" cy="${CY}" r="${R}" fill="none"
              stroke="var(--color-ink)" stroke-width="8"/>
      ${hub(n)}
      ${pointer()}
    </svg>`)
}

type SectorOpts = {
  index: number
  count: number
  a0: number
  a1: number
  mid: number
  picked: boolean
}

function sector(p: PlayerView, o: SectorOpts): Html {
  const fill = o.picked ? 'var(--color-yellow)' : fillFor(o.index, o.count)
  const shape =
    o.count === 1
      ? `<circle cx="${CX}" cy="${CY}" r="${R}" fill="${fill}" stroke="var(--color-ink)" stroke-width="3"/>`
      : `<path d="${wedge(o.a0, o.a1)}" fill="${fill}" stroke="var(--color-ink)" stroke-width="3" stroke-linejoin="round"/>`

  const style = [
    'font-family: var(--font-display), sans-serif',
    `font-weight: ${o.picked ? 800 : 700}`,
    `font-size: ${labelSize(o.count)}px`,
    'letter-spacing: 0',
    // مقابل <bdi> في HTML: الاسم اللاتيني داخل عجلة عربية يبقى بترتيبه الصحيح
    'direction: rtl',
    'unicode-bidi: plaintext',
  ].join('; ')

  const label = escapeXml(clip(p.name, labelChars(o.count)))
  const attrs = `text-anchor="middle" dominant-baseline="central" fill="var(--color-ink)" style="${style}"`

  if (o.count <= UPRIGHT_MAX) {
    const [x, y] = polar(o.mid, R * 0.62)
    return raw(`${shape}<text x="${round(x)}" y="${round(y)}" ${attrs}>${label}</text>`)
  }

  // النص على نصف قطر ٦٢٪ — أبعد من المحور فلا يتزاحم، وأقرب من الحافة فلا يُقصّ
  const r = R * 0.62
  const flipped = isFlipped(o.mid)
  const angle = flipped ? o.mid + 180 : o.mid
  const x = flipped ? CX - r : CX + r

  return raw(`
    ${shape}
    <g transform="rotate(${round(angle)} ${CX} ${CY})">
      <text x="${round(x)}" y="${CY}" ${attrs}>${label}</text>
    </g>`)
}

/** قطاع دائري: من المركز إلى بداية القوس، ثم القوس، ثم إغلاق. */
function wedge(a0: number, a1: number): string {
  const [x0, y0] = polar(a0, R)
  const [x1, y1] = polar(a1, R)
  const large = a1 - a0 > 180 ? 1 : 0
  return `M ${CX} ${CY} L ${round(x0)} ${round(y0)} A ${R} ${R} 0 ${large} 1 ${round(x1)} ${round(y1)} Z`
}

function polar(a: number, r: number): [number, number] {
  const rad = (a * Math.PI) / 180
  return [CX + r * Math.cos(rad), CY + r * Math.sin(rad)]
}

/** النص في النصف الأيسر من الشاشة ينقلب رأسًا على عقب ما لم يُدر ١٨٠ درجة. */
function isFlipped(angle: number): boolean {
  const a = ((angle % 360) + 360) % 360
  return a > 90 && a < 270
}

function fillFor(index: number, count: number): string {
  let k = index % 3
  // القطاع الأخير يلامس الأول — تشابههما يمحو الحد بينهما بصريًا
  if (index === count - 1 && k === 0 && count > 1) k = 1
  return SECTOR_FILLS[k] ?? SECTOR_FILLS[0]
}

/** كلما ضاق القطاع صغر الاسم — مقاس واحد كان سيقصّ نصف الأسماء عند ٢٠ لاعبًا. */
function labelSize(count: number): number {
  if (count <= 4) return 32
  if (count <= 8) return 27
  if (count <= 12) return 24
  if (count <= 16) return 21
  return 18
}

/**
 * الحد الأقصى للحروف: في الوضع الأفقي يحدّه وتر القطاع عند نصف القطر ٦٢٪،
 * وفي الوضع القُطري يحدّه طول نصف القطر نفسه.
 */
function labelChars(count: number): number {
  if (count <= 3) return 16
  if (count <= 4) return 14
  if (count <= 6) return 11
  if (count <= 10) return 12
  if (count <= 14) return 10
  return 8
}

/** المحور: يحمل عدد المشاركين فلا يبقى قرصًا فارغًا في قلب الصورة. */
function hub(count: number): string {
  return `
    <circle cx="${CX}" cy="${CY}" r="62" fill="var(--color-cream)"
            stroke="var(--color-ink)" stroke-width="6"/>
    <text x="${CX}" y="${CY}" text-anchor="middle" dominant-baseline="central"
          fill="var(--color-ink)"
          style="font-family: var(--font-display), sans-serif; font-weight: 800; font-size: 44px; letter-spacing: 0">${count}</text>`
}

/** المؤشّر يغرز طرفه داخل الحافة — لو لامسها فقط لبدا معلّقًا فوق العجلة. */
function pointer(): string {
  return `
    <path d="M ${CX} ${CY - R + 26} L ${CX - 38} ${CY - R - 48} L ${CX + 38} ${CY - R - 48} Z"
          fill="var(--color-red)" stroke="var(--color-ink)" stroke-width="6" stroke-linejoin="round"/>`
}

function emptyWheel(): Html {
  return html`<div class="note" style="${raw(CHIP)}">
    ${raw(icon('hourglass', { size: 22 }))} لا مشاركين في العجلة
  </div>`
}

/* ————— العمود الأيمن ————— */

function winnerCard(p: PlayerView): Html {
  const style = [
    'align-items: center',
    'background: var(--color-yellow)',
    'color: var(--on-yellow)',
    '--shadow: var(--color-red-deep)',
  ].join('; ')

  return html`
    <div class="card stack center" style="${raw(style)}">
      <h2 class="title title--quoted">وقفت العجلة</h2>
      ${bigAvatar(p, 132)}
      <!--
        bdi: الاسم اللاتيني وسط تخطيط RTL ينقلب طرفاه بلا عزل ثنائي الاتجاه.
        وهنا وحده يُسمح للاسم أن ينزل سطرين: هو بطل المشهد، وقصّه بالنقاط
        يجعل الصورة تعلن فائزًا بنصف اسم.
      -->
      <bdi
        style="display: block; max-width: 100%; font-size: var(--size-title);
               font-family: var(--font-display), sans-serif; font-weight: var(--weight-black);
               line-height: var(--leading-tight); overflow-wrap: anywhere"
      >
        ${p.name}
      </bdi>
    </div>
  `
}

function spinCard(): Html {
  return html`
    <div class="card stack center" style="align-items: center">
      <span style="color: var(--color-red)">${raw(icon('shuffle', { size: 56, stroke: 2.2 }))}</span>
      <h2 class="title title--quoted">العجلة تدور</h2>
      <p class="text">الاسم الذي يقف عند المؤشّر هو المختار</p>
    </div>
  `
}

/** كل الأسماء ككبسولات — العجلة تقصّ الأسماء الطويلة، وهذه تعرضها كاملة. */
function rosterCard(players: PlayerView[], picked: PlayerView | null): Html {
  return html`
    <div
      class="card grow"
      style="display: flex; flex-wrap: wrap; gap: var(--space-xs); align-content: flex-start"
    >
      ${players.map((p) => nameChip(p, picked?.id === p.id))}
    </div>
  `
}

function nameChip(p: PlayerView, on: boolean): Html {
  const style = [
    'display: inline-block',
    'max-width: 240px',
    'padding: 2px var(--space-sm)',
    'border-radius: var(--radius-pill)',
    'font-size: var(--size-meta)',
    'font-weight: var(--weight-medium)',
    'line-height: 1.9',
    'overflow: hidden',
    'text-overflow: ellipsis',
    'white-space: nowrap',
    on
      ? 'background: var(--color-yellow); color: var(--on-yellow);' +
        ' border: var(--stroke-thin) solid var(--color-ink);' +
        ' box-shadow: -4px 4px 0 var(--color-red-deep)'
      : 'background: var(--color-paper); color: var(--color-ink);' +
        ' border: var(--stroke-thin) solid color-mix(in srgb, var(--color-ink) 45%, transparent)',
  ].join('; ')

  return html`<bdi style="${raw(style)}">${p.name}</bdi>`
}

/* ————— مشترك ————— */

const CHIP = 'align-self: center; display: inline-flex; align-items: center; gap: var(--space-xs)'

function noteChip(note: string): Html {
  return html`<div class="note" style="${raw(CHIP)}">
    ${raw(icon('timer', { size: 22 }))} ${note}
  </div>`
}

function bigAvatar(p: PlayerView, size: number): Html {
  const style = [
    `width: ${size}px`,
    `height: ${size}px`,
    'flex: none',
    'border-radius: var(--radius-pill)',
    'border: var(--stroke-base) solid var(--color-ink)',
    'background: var(--color-cream)',
    'object-fit: cover',
  ].join('; ')

  // «روليت التيمات» يمرّر فرقًا لا لاعبين، ولا أفتار لها — الدائرة المتقطّعة
  // كانت ستُقرأ خانة فارغة، فتحمل أيقونة المجموعة بدلها
  return p.avatar
    ? html`<img src="${p.avatar}" alt="" style="${raw(style)}" />`
    : html`<div style="${raw(style)}; display: grid; place-items: center">
        ${raw(icon('users', { size: Math.round(size * 0.5), stroke: 2 }))}
      </div>`
}

/** SVG لا يقبل كيانات HTML — التهريب هنا يدوي وبالكيانات الرقمية وحدها. */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&#38;')
    .replace(/</g, '&#60;')
    .replace(/>/g, '&#62;')
    .replace(/"/g, '&#34;')
    .replace(/'/g, '&#39;')
}

/**
 * تمييز العدد في العربية أربع صيغ لا صيغتان — «2 مشاركين» خطأ يقرأه الجميع.
 */
function peopleWord(n: number): string {
  if (n === 2) return 'مشاركان'
  if (n >= 3 && n <= 10) return 'مشاركين'
  if (n >= 11) return 'مشاركًا'
  return 'مشارك'
}

function clip(name: string, max: number): string {
  const chars = [...name.trim()]
  return chars.length <= max ? name.trim() : chars.slice(0, max - 1).join('') + '…'
}

function round(n: number): number {
  return Math.round(n * 100) / 100
}

/** نفس عمق خلفية اللوبي: كتل بلا حد تطفو خلف البطاقات فلا تزاحم النص. */
function background(): Html {
  return html`
    ${blob({ width: 580, variant: 0, fill: 'var(--color-surface)', top: -180, end: -150 })}
    ${blob({ width: 500, variant: 2, fill: 'var(--color-surface)', bottom: -180, start: -150 })}
    ${blob({ width: 260, variant: 1, fill: 'var(--color-paper-tint)', bottom: 90, end: 30 })}
  `
}
