import { icon } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { PlayerView, RolesScene } from './scene.ts'

/**
 * مشهد الأطوار — مافيا وما يشبهها.
 *
 * الطور يُقرأ من اللون قبل النص: الليل يقلب المشهد إلى حبر داكن، والنهار يعود
 * إلى الورق. اللاعب الذي يفتح الشات وسط نقاش يعرف الطور من لمحة، وهذا أهم من
 * أي عنوان مكتوب.
 *
 * القلب لا يُدخل لونًا جديدًا: الداكن كله `color-mix` من `ink` و `cream`،
 * فتبقى اللوحة هي هي (DESIGN §3).
 */

type Theme = {
  /** يُضاف على `.scene` نفسه */
  scene: string
  card: string
  hero: string
  muted: string
  chip: string
  /** لون حد الأفتار — الحبر يختفي فوق خلفية الحبر */
  edge: string
  blobFill: string
  tintFill: string
}

const NIGHT_CARD = 'background: color-mix(in srgb, var(--color-cream) 9%, var(--color-ink))'

const THEMES: Record<RolesScene['phase'], Theme> = {
  night: {
    scene: 'background: var(--color-ink); color: var(--color-cream)',
    card: `${NIGHT_CARD}; border-color: var(--color-cream); --shadow: var(--color-red-deep)`,
    hero:
      'background: color-mix(in srgb, var(--color-cream) 15%, var(--color-ink));' +
      ' border-color: var(--color-yellow); --shadow: var(--color-red-deep)',
    muted: 'color: color-mix(in srgb, var(--color-cream) 60%, transparent)',
    chip:
      'background: color-mix(in srgb, var(--color-cream) 14%, var(--color-ink));' +
      ' border-color: var(--color-cream); color: var(--color-cream)',
    edge: 'var(--color-cream)',
    blobFill: 'color-mix(in srgb, var(--color-cream) 7%, var(--color-ink))',
    tintFill: 'color-mix(in srgb, var(--color-cream) 12%, var(--color-ink))',
  },
  day: {
    scene: '',
    card: '',
    hero: '',
    muted: 'color: color-mix(in srgb, var(--color-ink) 55%, transparent)',
    chip: 'background: var(--color-cream); border-color: var(--color-ink); color: var(--color-ink)',
    edge: 'var(--color-ink)',
    blobFill: 'var(--color-surface)',
    tintFill: 'var(--color-paper-tint)',
  },
  result: {
    scene: '',
    card: '',
    hero:
      'background: var(--color-yellow); color: var(--on-yellow);' +
      ' --shadow: var(--color-red-deep)',
    muted: 'color: color-mix(in srgb, var(--color-ink) 55%, transparent)',
    chip: 'background: var(--color-cream); border-color: var(--color-ink); color: var(--color-ink)',
    edge: 'var(--color-ink)',
    blobFill: 'var(--color-surface)',
    tintFill: 'var(--color-paper-tint)',
  },
}

const PHASE_LABEL: Record<RolesScene['phase'], string> = {
  night: 'الليل',
  day: 'النهار',
  result: 'النتيجة',
}

export function rolesScene(s: RolesScene): string {
  const t = THEMES[s.phase]
  const dead = s.dead ?? []

  return html`
    <div class="scene" style="${raw(t.scene)}">
      ${background(t)}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span style="display: inline-flex; align-items: center; gap: var(--space-xs)">
            ${raw(phaseMark(s.phase))} ${PHASE_LABEL[s.phase]}
          </span>
          <span class="bar__count">${s.game.name}</span>
        </div>

        ${headlineCard(s, t)}

        <div class="row grow" style="align-items: stretch; gap: var(--space-base)">
          <!-- الأحياء يمينًا: هم من يهمّ اللاعب أولًا -->
          ${listCard({
            title: 'الأحياء',
            count: s.alive.length,
            players: s.alive,
            dead: false,
            theme: t,
            spotlightId: s.spotlight?.id ?? null,
            empty: 'لم يبقَ أحد',
            grow: true,
          })}
          ${listCard({
            title: 'الخارجون',
            count: dead.length,
            players: dead,
            dead: true,
            theme: t,
            spotlightId: null,
            empty: 'لا أحد خرج بعد',
            grow: false,
          })}
        </div>
      </div>
    </div>
  `.toString()
}

/**
 * البطاقة البطلة: العنوان بجانب اللاعب المحوري.
 * العنوان بـ `title` لا بـ `display` — الأخير أحمر بحدّ حبر، وهو يختفي فوق
 * خلفية الليل الحبرية. النص هنا يرث لون الطور فيصلح في الحالتين.
 */
function headlineCard(s: RolesScene, t: Theme): Html {
  const hero = s.phase === 'night' || s.phase === 'result'

  return html`
    <div
      class="card ${raw(hero ? '' : 'card--hero')} row"
      style="${raw(t.hero)}; gap: var(--space-lg); align-items: center"
    >
      ${s.spotlight ? spotlight(s.spotlight, t) : ''}
      <div class="stack grow" style="gap: var(--space-xs)">
        <h1
          style="font-family: var(--font-display), sans-serif; font-weight: var(--weight-black);
                 font-size: ${headlineSize(s.headline)}px; line-height: var(--leading-tight);
                 letter-spacing: 0"
        >
          ${s.headline}
        </h1>
        ${s.detail ? html`<p class="text">${s.detail}</p>` : ''}
      </div>
      <!-- علامة الطور كبيرة في الطرف: توازن البطاقة حين يقصر العنوان، وتقول
           الطور بلا كلمة إضافية -->
      <span style="flex: none; ${raw(markColor(s.phase))}">${raw(bigPhaseMark(s.phase))}</span>
    </div>
  `
}

/** لون العلامة الكبيرة: أصفر يضيء الليل، وأحمر يوقّع النهار، وحبر فوق الأصفر. */
function markColor(phase: RolesScene['phase']): string {
  if (phase === 'night') return 'color: var(--color-yellow)'
  if (phase === 'result') return 'color: var(--color-ink)'
  return 'color: var(--color-red)'
}

/** العنوان يتبع طوله: جملة قصيرة تكبر، وجملة طويلة تنزل درجة فلا تتجاوز سطرين. */
function headlineSize(headline: string): number {
  const n = [...headline].length
  if (n <= 22) return 54
  if (n <= 40) return 44
  return 36
}

/** اللاعب المحوري: أفتار كبير بحلقة صفراء — يُرى قبل أن يُقرأ الاسم. */
function spotlight(p: PlayerView, t: Theme): Html {
  return html`
    <div class="stack center" style="flex: none; align-items: center; width: 210px; gap: 6px">
      ${bigAvatar(p, 132, t.edge, true)}
      <!-- اسم اللاعب المحوري ينزل سطرين ولا يُقصّ: المشهد كله عنه -->
      <bdi
        style="display: block; max-width: 100%; font-family: var(--font-display), sans-serif;
               font-weight: var(--weight-bold); font-size: var(--size-label);
               line-height: var(--leading-tight); overflow-wrap: anywhere"
      >
        ${p.name}
      </bdi>
    </div>
  `
}

type ListOpts = {
  title: string
  count: number
  players: PlayerView[]
  dead: boolean
  theme: Theme
  spotlightId: string | null
  empty: string
  grow: boolean
}

function listCard(o: ListOpts): Html {
  return html`
    <div
      class="card stack ${raw(o.grow ? 'grow' : '')}"
      style="${raw(o.theme.card)}; ${raw(o.grow ? '' : 'width: 460px')}"
    >
      <div class="row" style="justify-content: space-between">
        <h2 class="title title--quoted" style="font-size: 30px">${o.title}</h2>
        <span
          class="meta"
          style="padding: 0 var(--space-sm); border-radius: var(--radius-pill);
                 ${raw(o.theme.chip)}; border-width: var(--stroke-thin); border-style: solid"
        >
          ${o.count}
        </span>
      </div>

      <div style="display: flex; flex-wrap: wrap; gap: var(--space-xs); align-content: flex-start">
        ${o.players.length > 0
          ? o.players.map((p) => playerChip(p, o))
          : html`<span class="meta" style="${raw(o.theme.muted)}">${o.empty}</span>`}
      </div>
    </div>
  `
}

/**
 * الخارج يُشطب ولا يُحذف: اللاعبون يحتاجون أن يروا من خرج ليتابعوا النقاش،
 * والشطب مع التعتيم يفصله عن الأحياء من مسافة.
 */
function playerChip(p: PlayerView, o: ListOpts): Html {
  const focused = o.spotlightId === p.id
  const style = [
    'display: inline-flex',
    'align-items: center',
    'gap: var(--space-xs)',
    'padding: 4px var(--space-sm) 4px 6px',
    'border-radius: var(--radius-pill)',
    'border-width: var(--stroke-thin)',
    'border-style: solid',
    focused
      ? 'background: var(--color-yellow); color: var(--on-yellow); border-color: var(--color-ink);' +
        ' box-shadow: -4px 4px 0 var(--color-red-deep)'
      : o.theme.chip,
    o.dead ? 'opacity: .55' : '',
  ]
    .filter(Boolean)
    .join('; ')

  const nameStyle = [
    'max-width: 180px',
    'overflow: hidden',
    'text-overflow: ellipsis',
    'white-space: nowrap',
    'font-size: var(--size-meta)',
    'font-weight: var(--weight-medium)',
    o.dead ? 'text-decoration: line-through; text-decoration-thickness: 3px' : '',
  ]
    .filter(Boolean)
    .join('; ')

  return html`
    <span style="${raw(style)}">
      ${smallAvatar(p, o.theme.edge)}
      <bdi style="${raw(nameStyle)}">${p.name}</bdi>
      ${o.dead ? raw(icon('cross', { size: 18 })) : ''}
    </span>
  `
}

/* ————— قطع مساندة ————— */

function smallAvatar(p: PlayerView, edge: string): Html {
  const style = [
    'width: 40px',
    'height: 40px',
    'flex: none',
    'border-radius: var(--radius-pill)',
    `border: var(--stroke-thin) solid ${edge}`,
    'background: var(--color-cream)',
    'object-fit: cover',
  ].join('; ')

  return p.avatar
    ? html`<img src="${p.avatar}" alt="" style="${raw(style)}" />`
    : html`<div style="${raw(style)}; border-style: dashed; opacity: .6"></div>`
}

function bigAvatar(p: PlayerView, size: number, edge: string, ring: boolean): Html {
  const style = [
    `width: ${size}px`,
    `height: ${size}px`,
    'flex: none',
    'border-radius: var(--radius-pill)',
    `border: var(--stroke-base) solid ${edge}`,
    'background: var(--color-cream)',
    'object-fit: cover',
    ring ? 'box-shadow: 0 0 0 var(--stroke-base) var(--color-yellow)' : '',
  ]
    .filter(Boolean)
    .join('; ')

  return p.avatar
    ? html`<img src="${p.avatar}" alt="" style="${raw(style)}" />`
    : html`<div style="${raw(style)}; border-style: dashed; opacity: .5"></div>`
}

/**
 * علامة الطور مرسومة سطريًا لا مأخوذة من `icons.ts`: الهلال والشمس لا وجود
 * لهما في الطقم، وإضافتهما هناك تخصّ ملفًا لا يملكه هذا المشهد.
 */
function phaseMark(phase: RolesScene['phase'], size = 26, stroke = 2.4): string {
  const head =
    `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" ` +
    `stroke="currentColor" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">`

  if (phase === 'night') {
    return `${head}<path d="M20.6 14.8A9.1 9.1 0 1 1 9.2 3.4a7.3 7.3 0 0 0 11.4 11.4z"/></svg>`
  }
  if (phase === 'day') {
    return (
      `${head}<circle cx="12" cy="12" r="4.6"/>` +
      '<path d="M12 2.4v2.4M12 19.2v2.4M4.2 4.2l1.7 1.7M18.1 18.1l1.7 1.7' +
      'M2.4 12h2.4M19.2 12h2.4M4.2 19.8l1.7-1.7M18.1 5.9l1.7-1.7"/></svg>'
    )
  }
  return icon('trophy', { size, stroke })
}

function bigPhaseMark(phase: RolesScene['phase']): string {
  return phaseMark(phase, 104, 1.9)
}

function background(t: Theme): Html {
  return html`
    ${blob({ width: 600, variant: 1, fill: t.blobFill, top: -190, end: -150 })}
    ${blob({ width: 480, variant: 0, fill: t.blobFill, bottom: -170, start: -140 })}
    ${blob({ width: 250, variant: 2, fill: t.tintFill, top: 260, start: 70 })}
  `
}
