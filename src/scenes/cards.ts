
import { avatar, blob, html, raw, type Html } from './html.ts'
import type { CardFace, CardsScene, PlayerView } from './scene.ts'

/**
 * طاولة «لايرز بار».
 *
 * ————————————————— الورقة المقلوبة هي اللعبة —————————————————
 *
 * أغلب مشاهد المشروع تعرض حالة معروفة. وهذا يعرض **ما لا يُعرف**: أوراق مقلوبة
 * لا يرى وجهها أحد، وعدد بجانب كل لاعب. فمهمّة المشهد أن يُظهر بوضوح أن هناك
 * ما هو مخفي، لا أن يملأ الفراغ بشيء. ولهذا ظهر الورق المقلوب بظهره المزخرف
 * وليس بمستطيل فارغ: الفارغ يُقرأ نقصًا في الرسم، والمزخرف يُقرأ سرًّا.
 *
 * ————————————————————— لحظة الكشف —————————————————————
 *
 * الكشف يقع في نفس الإطار الذي ظهر فيه الادعاء لا في مشهد جديد. القارئ يحتاج
 * أن يرى «ادّعى ثلاثًا» و«طلعت اثنتان وواحدة كاذبة» في صورة واحدة، فالفصل
 * بينهما يجعل التهمة ونتيجتها خبرين لا حدثًا واحدًا.
 *
 * ————————————————————— المسدّس —————————————————————
 *
 * العقوبة في هذه اللعبة ليست نقطة تُخصم بل خطرًا يتراكم، فتُعرض كخانات باقية
 * لا كرقم. ست خانات تنقص واحدة مع كل عقوبة، ومن نفدت خاناته خرج. والعين تقرأ
 * ثلاث خانات باقية أسرع مما تقرأ «3».
 */

const FACES: Record<CardFace, { text: string; tone: 'red' | 'ink' | 'yellow' }> = {
  ace: { text: 'A', tone: 'red' },
  king: { text: 'K', tone: 'ink' },
  queen: { text: 'Q', tone: 'red' },
  joker: { text: '★', tone: 'yellow' },
}

const DEMAND_NAME: Record<CardFace, string> = {
  ace: 'الآس',
  king: 'الملك',
  queen: 'الملكة',
  joker: 'الجوكر',
}

const CHAMBERS = 6

export function cardsScene(s: CardsScene): string {
  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body">
        <aside class="stack" style="width: 380px">
          <div class="bar">
            <span style="white-space: nowrap">${s.game.name}</span>
            <span class="bar__count">${DEMAND_NAME[s.demand]}</span>
          </div>
          <div class="card grow stack">${s.seats.map(seatRow)}</div>
        </aside>

        <main class="stack grow" style="align-items: center; justify-content: center; gap: 22px">
          ${s.hand ? handBlock(s.hand, s.demand) : tableBlock(s)}
          ${s.note ? html`<div class="note">${s.note}</div>` : ''}
        </main>
      </div>
    </div>
  `.toString()
}

/** الطاولة العامة: الادعاء الأخير، أو الكشف إن وقع الاتهام. */
function tableBlock(s: CardsScene): Html {
  if (s.reveal) return revealBlock(s.reveal, s.demand)
  if (s.claim) return claimBlock(s.claim, s.demand)
  return html`<div class="card card--hero stack" style="align-items: center; padding: 40px 56px">
    <div style="font-size: 22px; opacity: 0.7">المطلوب هذه الجولة</div>
    <div style="font-size: 64px; font-weight: 800; font-family: var(--font-display)">
      ${DEMAND_NAME[s.demand]}
    </div>
  </div>`
}

function claimBlock(claim: { player: PlayerView; count: number }, demand: CardFace): Html {
  return html`<div class="card card--hero stack" style="align-items: center; padding: 34px 52px; gap: 18px">
    <div style="display:flex; align-items:center; gap: 14px">
      ${avatar(claim.player.avatar)}
      <span style="font-size: 26px; font-weight: 800">${claim.player.name}</span>
    </div>
    <div style="display:flex; gap: 12px">
      ${Array.from({ length: claim.count }, () => back())}
    </div>
    <div style="font-size: 24px">
      يدّعي <b>${claim.count}</b> من <b>${DEMAND_NAME[demand]}</b>
    </div>
  </div>`
}

function revealBlock(
  reveal: NonNullable<CardsScene['reveal']>,
  demand: CardFace,
): Html {
  const verdict = reveal.truthful ? 'كان صادقًا' : 'كان يكذب'
  const paint = reveal.truthful ? 'var(--color-yellow)' : 'var(--color-red)'
  const on = reveal.truthful ? 'var(--on-yellow)' : 'var(--on-red)'

  return html`<div class="card card--hero stack" style="align-items: center; padding: 30px 48px; gap: 18px">
    <div style="font-size: 20px; opacity: 0.7">
      ${reveal.accuser.name} صرخ «كذّاب»
    </div>
    <div style="display:flex; gap: 12px">
      ${reveal.cards.map((face) => card(face, face === demand || face === 'joker'))}
    </div>
    <div
      style="padding: 10px 26px; border-radius: var(--radius-sm);
             border: var(--stroke-base) solid var(--color-ink);
             background: ${raw(paint)}; color: ${raw(on)};
             font-size: 28px; font-weight: 800"
    >
      ${verdict}
    </div>
  </div>`
}

/** يد اللاعب — تظهر في رسالته المخفية وحدها. */
function handBlock(hand: CardFace[], demand: CardFace): Html {
  return html`<div class="card card--hero stack" style="align-items: center; padding: 30px 44px; gap: 16px">
    <div style="font-size: 20px; opacity: 0.7">
      يدك · المطلوب <b>${DEMAND_NAME[demand]}</b>
    </div>
    <div style="display:flex; gap: 12px">
      ${hand.map((face, i) => html`<div class="stack" style="align-items:center; gap:8px">
        ${card(face, face === demand || face === 'joker')}
        <span style="font-size:18px; opacity:0.65"><bdi>${i + 1}</bdi></span>
      </div>`)}
    </div>
    <div class="note">المطابق يعلوه شريط أصفر. والجوكر يطابق كل مطلب.</div>
  </div>`
}

function card(face: CardFace, matches: boolean): Html {
  const paint = FACES[face]
  const color =
    paint.tone === 'red'
      ? 'var(--color-red)'
      : paint.tone === 'yellow'
        ? 'var(--color-yellow)'
        : 'var(--color-ink)'

  const box = [
    'width: 96px',
    'height: 134px',
    'border-radius: var(--radius-sm)',
    'border: var(--stroke-base) solid var(--color-ink)',
    'background: var(--color-surface)',
    'box-shadow: -5px 5px 0 var(--color-ink)',
    'display:grid',
    'place-items:center',
    'position:relative',
    'overflow:hidden',
  ].join(';')

  return html`<div style="${raw(box)}">
    ${matches
      ? html`<span
          style="position:absolute; top:0; inset-inline:0; height:10px;
                 background: var(--color-yellow); border-bottom: 3px solid var(--color-ink)"
        ></span>`
      : ''}
    <span
      style="font-size: 62px; font-weight: 800; font-family: var(--font-display);
             color: ${raw(color)}; line-height: 1"
      >${paint.text}</span
    >
  </div>`
}

/** ظهر الورقة: نقش لا فراغ، فالفراغ يُقرأ نقصًا في الرسم لا سرًّا. */
function back(): Html {
  const box = [
    'width: 96px',
    'height: 134px',
    'border-radius: var(--radius-sm)',
    'border: var(--stroke-base) solid var(--color-ink)',
    'background: var(--color-red)',
    'box-shadow: -5px 5px 0 var(--color-ink)',
    'display:grid',
    'place-items:center',
  ].join(';')

  // إطار ومعيّن مسطّحان لا نقش متدرّج: DESIGN.md §7 يمنع التدرّجات، وحتى
  // التدرّج ذو الوقفات الحادّة يفتح بابًا لا داعي له في لوحة مسطّحة أصلًا
  const frame = [
    'width: 62px',
    'height: 100px',
    'border-radius: 8px',
    'border: 3px solid var(--on-red)',
    'opacity: 0.65',
    'display:grid',
    'place-items:center',
  ].join(';')

  const lozenge = [
    'width: 26px',
    'height: 26px',
    'background: var(--on-red)',
    'transform: rotate(45deg)',
    'border-radius: 4px',
  ].join(';')

  return html`<div style="${raw(box)}">
    <div style="${raw(frame)}"><span style="${raw(lozenge)}"></span></div>
  </div>`
}

function seatRow(seat: CardsScene['seats'][number]): Html {
  const row = [
    'display:flex',
    'align-items:center',
    'gap:12px',
    'padding:10px 12px',
    'border-radius: var(--radius-sm)',
    seat.turn ? 'border: var(--stroke-base) solid var(--color-ink)' : 'border: 2px solid transparent',
    seat.turn ? 'background: var(--color-yellow)' : '',
    seat.alive ? '' : 'opacity:0.4',
  ]
    .filter(Boolean)
    .join(';')

  return html`<div style="${raw(row)}">
    ${avatar(seat.player.avatar)}
    <div class="stack grow" style="gap:4px">
      <span style="font-weight:800">${seat.player.name}</span>
      ${seat.chambers === undefined ? '' : chambers(seat.chambers)}
    </div>
    <!-- بلا أيقونة: أقرب أيقونة في الطقم هي النرد، وهي لعبة أخرى في نفس البوت.
         ورقة صغيرة مرسومة تقول «ورق» بلا التباس ولا مفردة جديدة -->
    <span style="display:flex; align-items:center; gap:7px; font-weight:800">
      <span
        style="width:13px; height:18px; border-radius:3px;
               border:2px solid var(--color-ink); background: var(--color-surface)"
      ></span>
      <bdi>${seat.cards}</bdi>
    </span>
  </div>`
}

/** خانات المسدّس الباقية — تُعدّ بالعين لا بالقراءة. */
function chambers(left: number): Html {
  const dots = Array.from({ length: CHAMBERS }, (_, i) => {
    const on = i < left
    return `<span style="width:11px;height:11px;border-radius:50%;
      border:2px solid var(--color-ink);
      background:${on ? 'var(--color-surface)' : 'var(--color-red-deep)'}"></span>`
  }).join('')
  return html`<span style="display:flex; gap:5px">${raw(dots)}</span>`
}

function background(): Html {
  return html`
    ${blob({ width: 520, variant: 2, fill: 'var(--color-surface)', top: -150, end: -130 })}
    ${blob({ width: 400, variant: 0, fill: 'var(--color-paper-tint)', bottom: -160, start: -120 })}
  `
}
