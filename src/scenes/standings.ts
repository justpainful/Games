import { icon } from '../design/icons.ts'
import { avatar, blob, html, raw, type Html } from './html.ts'
import type { PlayerView, StandingsScene } from './scene.ts'

/** صف بعد حساب المركز — المركز ليس دائمًا `index + 1` بسبب التعادل. */
type RankedRow = {
  player: PlayerView
  score: number
  /** المركز بترقيم المنافسة: 1، 2، 2، 4 */
  place: number
  /** يشاركه لاعب آخر نفس المركز */
  tied: boolean
}

/**
 * مشهد الترتيب.
 *
 * التمييز يتدرّج بثقل القصاصة لا بلون جديد: الأول قصاصة صفراء بظل أحمر
 * (اندماج لوني الهوية، DESIGN §5)، والثاني قصاصة ورقية مرفوعة بظل حبر،
 * والثالث نفس القصاصة ملتصقة بلا ظل، وما بعدهم صفوف عارية.
 * هكذا يُقرأ الترتيب من مسافة قبل قراءة أي رقم.
 */
export function standingsScene(s: StandingsScene): string {
  const rows = rank(s.rows)

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>${s.heading ?? 'الترتيب'}</span>
          <span class="bar__count">${s.game.name}</span>
        </div>

        <!--
          الصفوف تتوسّط البطاقة رأسيًا: مع صف واحد أو قائمة فارغة تبقى
          البطاقة كتلة مقصودة لا صندوقًا نصفه خاوٍ، ومع عشرة صفوف تمتلئ وحدها.
        -->
        <div class="card grow stack" style="justify-content: center">
          ${rows.length > 0 ? rows.map(standingRow) : emptyNote()}
        </div>
      </div>
    </div>
  `.toString()
}

/**
 * ترقيم المنافسة القياسي: المتعادلان يتقاسمان المركز، والذي بعدهما يقفز.
 * الترتيب يُعاد حسابه هنا ولا يُفترض في المُدخل — نسخة لا تعديل في المكان،
 * والفرز مستقر فيبقى ترتيب المتعادلين كما أرسله المتصل.
 */
function rank(rows: StandingsScene['rows']): RankedRow[] {
  const sorted = [...rows].sort((a, b) => b.score - a.score)

  const places: number[] = []
  sorted.forEach((r, i) => {
    const prev = sorted[i - 1]
    const prevPlace = places[i - 1]
    const same = prev !== undefined && prevPlace !== undefined && prev.score === r.score
    places.push(same ? prevPlace : i + 1)
  })

  return sorted.map((r, i) => ({
    player: r.player,
    score: r.score,
    place: places[i] ?? i + 1,
    // مركز يتقاسمه اثنان — يُعلَن صراحة وإلا قُرئ الرقم المكرر خطأ في العرض
    tied: places[i] === places[i - 1] || places[i] === places[i + 1],
  }))
}

function standingRow(r: RankedRow): Html {
  const t = tier(r.place)

  return html`
    <div class="row" style="${raw(t.row)}">
      ${rankBadge(r, t)} ${avatar(r.player.avatar, 'avatar--sm')}
      <!--
        bdi وليس span: أسماء ديسكورد لاتينية غالبًا وتبدأ أو تنتهي بمحارف
        محايدة، فتنتقل داخل RTL إلى الطرف الخطأ بلا عزل ثنائي الاتجاه.
      -->
      <!--
        يتمدد ليدفع النقاط إلى طرف الصف. max-width من .player__name يُلغى هنا:
        الصف أعرض من عمود اللوبي، وقصّ الاسم يتكفّل به overflow عند الحاجة فقط.
      -->
      <bdi class="player__name grow" style="max-width: none; min-width: 0">
        ${r.player.name}
      </bdi>
      ${r.tied ? html`<span class="meta ${raw(r.place === 1 ? '' : 'text--muted')}">تعادل</span>` : ''}
      ${scoreChip(r.score)}
    </div>
  `
}

/**
 * شارة المركز. الأول يحمل كأسًا لا رقمًا — الرقم «1» يقرأه اللاعب،
 * أمّا الكأس فيراه قبل أن يقرأ.
 */
function rankBadge(r: RankedRow, t: Tier): Html {
  return html`<span style="${raw(t.badge)}">
    ${r.place === 1 ? raw(icon('trophy', { size: 34, stroke: 2.2 })) : r.place}
  </span>`
}

function scoreChip(score: number): Html {
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
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-bold)',
    'font-size: var(--size-label)',
    'letter-spacing: 0',
    'line-height: 1.7',
  ].join('; ')

  return html`<span style="${raw(style)}">
    ${score}${raw(icon('star', { size: 21, fill: true }))}
  </span>`
}

type Tier = { row: string; badge: string }

const BADGE_BASE = [
  'display: grid',
  'place-items: center',
  'flex: none',
  'width: 66px',
  'height: 66px',
  'border-radius: var(--radius-pill)',
  'font-family: var(--font-display), sans-serif',
  'font-weight: var(--weight-black)',
  'font-size: 30px',
  'line-height: 1.7',
  'letter-spacing: 0',
].join('; ')

const ROW_BASE = [
  'gap: var(--space-sm)',
  'padding: var(--space-xs) var(--space-sm)',
  'border-radius: var(--radius-sm)',
].join('; ')

/** ثقل القصاصة يتدرّج مع المركز — لا لون جديد، فقط حدّ وظل. */
function tier(place: number): Tier {
  if (place === 1) {
    return {
      row:
        `${ROW_BASE}; background: var(--color-yellow); color: var(--on-yellow);` +
        ' border: var(--stroke-base) solid var(--color-ink);' +
        ' box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-red-deep)',
      badge:
        `${BADGE_BASE}; background: var(--color-cream); color: var(--color-ink);` +
        ' border: var(--stroke-base) solid var(--color-ink)',
    }
  }
  if (place === 2) {
    return {
      row:
        `${ROW_BASE}; background: var(--color-paper);` +
        ' border: var(--stroke-base) solid var(--color-ink);' +
        ' box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-ink)',
      badge:
        `${BADGE_BASE}; background: var(--color-cream);` +
        ' border: var(--stroke-base) solid var(--color-ink)',
    }
  }
  if (place === 3) {
    return {
      row:
        `${ROW_BASE}; background: var(--color-paper);` +
        ' border: var(--stroke-thin) solid var(--color-ink)',
      badge:
        `${BADGE_BASE}; background: var(--color-cream);` +
        ' border: var(--stroke-thin) solid var(--color-ink)',
    }
  }
  return {
    row: `${ROW_BASE}; border: var(--stroke-thin) solid transparent`,
    badge:
      `${BADGE_BASE}; background: transparent;` +
      ' border: var(--stroke-thin) solid color-mix(in srgb, var(--color-ink) 45%, transparent)',
  }
}

/** قائمة فارغة تبقى مشهدًا لا فراغًا: تقول للاعب لماذا لا يرى شيئًا. */
function emptyNote(): Html {
  return html`<div
    class="note"
    style="align-self: center; display: inline-flex; align-items: center;
           gap: var(--space-xs); margin-block: var(--space-xl)"
  >
    ${raw(icon('hourglass', { size: 22 }))} لا نتائج بعد — لم يسجّل أي لاعب نقطة
  </div>`
}

/** نفس عمق خلفية اللوبي: كتل بلا حد تطفو خلف البطاقات فلا تزاحم النص. */
function background(): Html {
  return html`
    ${blob({ width: 600, variant: 1, fill: 'var(--color-surface)', top: -190, end: -150 })}
    ${blob({ width: 480, variant: 0, fill: 'var(--color-surface)', bottom: -170, start: -140 })}
    ${blob({ width: 240, variant: 2, fill: 'var(--color-paper-tint)', top: 250, start: 90 })}
  `
}
