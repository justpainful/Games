import { icon } from '../design/icons.ts'
import { avatar, blob, html, raw, type Html } from './html.ts'
import type { LeadersScene, PlayerView } from './scene.ts'

/**
 * لوحة الصدارة.
 *
 * الصدارة ليست ترتيب جولة: المراكز هنا نهائية ومحسوبة مسبقًا في قاعدة البيانات،
 * فالصف يعرض `index + 1` ولا يعيد حساب التعادل — ذلك عمل `standings`.
 *
 * التمييز بثقل القصاصة لا بلون جديد (DESIGN §5): الأول قصاصة صفراء بظل أحمر،
 * الثاني ورقية مرفوعة بظل حبر، الثالث ملتصقة بحدّ رفيع، وما بعدهم صفوف عارية.
 */
/**
 * فوق هذا العدد تنقسم اللوحة عمودين.
 *
 * عشرة صفوف في عمود واحد تصنع صورة أطول من عرضها، وديسكورد يصغّر الصورة حتى
 * تدخل رسالته فيصغر معها كل اسم فيها. والعمودان يجعلان اللوحة عريضة قصيرة،
 * فتُعرض بعرضها الكامل ويكبر ما فيها. الترتيب يبقى نازلًا في العمود الأول ثم
 * يستأنف في الثاني، لأن القارئ يتتبّع المراكز رأسيًا لا زجزاجًا.
 */
const SPLIT_AT = 5

export function leadersScene(s: LeadersScene): string {
  const split = s.rows.length > SPLIT_AT
  const perColumn = Math.ceil(s.rows.length / 2)
  const list = split
    ? `display: grid; grid-auto-flow: column; grid-template-rows: repeat(${perColumn}, auto);` +
      ' grid-template-columns: repeat(2, 1fr); gap: var(--space-xs) var(--space-base);' +
      ' align-content: center'
    : 'display: flex; flex-direction: column; gap: var(--space-sm); justify-content: center'

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>${s.title}</span>
          <span class="bar__count">${countLabel(s.rows.length)}</span>
        </div>

        <!--
          الصفوف تتوسّط البطاقة رأسيًا: مع صف واحد تبقى البطاقة كتلة مقصودة
          لا صندوقًا نصفه خاوٍ، ومع عشرة صفوف تمتلئ وحدها.
        -->
        <div class="card grow" style="${raw(list)}">
          ${s.rows.length > 0
            ? s.rows.map((r, i) => leaderRow(r.player, r.points, i + 1))
            : emptyNote()}
        </div>
      </div>
    </div>
  `.toString()
}

/**
 * تمييز العدد في العربية: مفرد ومثنّى وجمع قلّة وجمع كثرة.
 * «0 لاعب» و«10 لاعب» مقبولان في الترجمة الآلية لا في نصّ يقرأه عربي.
 */
function countLabel(n: number): string {
  if (n === 0) return 'ما فيه أحد'
  if (n === 1) return 'لاعب واحد'
  if (n === 2) return 'لاعبان'
  if (n <= 10) return `${n} لاعبين`
  return `${n} لاعبًا`
}

function leaderRow(player: PlayerView, points: number, place: number): Html {
  const t = tier(place)

  return html`
    <div class="row" style="${raw(t.row)}">
      ${placeBadge(place, t.badge)} ${avatar(player.avatar)}
      <!--
        bdi: أسماء ديسكورد تخلط اللاتيني بالعربي وتبدأ بمحارف محايدة،
        فتنقلب أطرافها داخل RTL بلا عزل ثنائي الاتجاه.
        max-width من .player__name يُلغى — الصف أعرض من عمود اللوبي.
      -->
      <!--
        الحجم صريح لا موروث: هذه اللوحة تُقرأ من بعيد في قناة، بينما اسم اللاعب
        في اللوبي يُقرأ عن قرب. ونفس الصنف يخدم الموضعين فيخرج أحدهما صغيرًا.
      -->
      <bdi class="player__name" style="max-width: none; min-width: 0; font-size: 36px">${player.name}</bdi>
      <span class="grow"></span>
      ${pointsChip(points)}
    </div>
  `
}

/** الأول يحمل كأسًا لا رقمًا — الرقم «1» يُقرأ، أمّا الكأس فيُرى قبل القراءة. */
function placeBadge(place: number, style: string): Html {
  return html`<span style="${raw(style)}">
    ${place === 1 ? raw(icon('trophy', { size: 34, stroke: 2.2 })) : place}
  </span>`
}

function pointsChip(points: number): Html {
  const style = [
    'display: inline-flex',
    'align-items: center',
    'gap: 8px',
    'flex: none',
    'padding: 6px var(--space-base)',
    'background: var(--color-cream)',
    'color: var(--color-ink)',
    'border: var(--stroke-thin) solid var(--color-ink)',
    'border-radius: var(--radius-pill)',
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-bold)',
    'font-size: 30px',
    'letter-spacing: 0',
    'line-height: 1.7',
  ].join('; ')

  return html`<span style="${raw(style)}">
    <bdi>${num(points)}</bdi>${raw(icon('star', { size: 21, fill: true }))}
  </span>`
}

type Tier = { row: string; badge: string }

const BADGE_BASE = [
  'display: grid',
  'place-items: center',
  'flex: none',
  'width: 74px',
  'height: 74px',
  'border-radius: var(--radius-pill)',
  'font-family: var(--font-display), sans-serif',
  'font-weight: var(--weight-black)',
  'font-size: 34px',
  'line-height: 1.7',
  'letter-spacing: 0',
].join('; ')

const ROW_BASE = [
  'gap: var(--space-sm)',
  'padding: var(--space-xs) var(--space-sm)',
  'border-radius: var(--radius-sm)',
].join('; ')

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
      row: `${ROW_BASE}; background: var(--color-paper); border: var(--stroke-thin) solid var(--color-ink)`,
      badge: `${BADGE_BASE}; background: var(--color-cream); border: var(--stroke-thin) solid var(--color-ink)`,
    }
  }
  return {
    row: `${ROW_BASE}; border: var(--stroke-thin) solid transparent`,
    badge:
      `${BADGE_BASE}; background: transparent;` +
      ' border: var(--stroke-thin) solid color-mix(in srgb, var(--color-ink) 45%, transparent)',
  }
}

/** صدارة فارغة تقول للاعب لماذا لا يرى شيئًا بدل أن تتركه أمام بطاقة بيضاء. */
function emptyNote(): Html {
  return html`<div
    class="note"
    style="align-self: center; display: inline-flex; align-items: center;
           gap: var(--space-xs); margin-block: var(--space-xl)"
  >
    ${raw(icon('hourglass', { size: 22 }))} ما أحد سجّل نقاطًا بعد — العبوا جولة وارجعوا
  </div>`
}

/** أرقام عربية غربية بفواصل آلاف (DESIGN §4). */
function num(value: number): string {
  return String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
}

function background(): Html {
  return html`
    ${blob({ width: 600, variant: 1, fill: 'var(--color-surface)', top: -190, end: -150 })}
    ${blob({ width: 480, variant: 0, fill: 'var(--color-surface)', bottom: -170, start: -140 })}
    ${blob({ width: 240, variant: 2, fill: 'var(--color-paper-tint)', top: 250, start: 90 })}
  `
}
