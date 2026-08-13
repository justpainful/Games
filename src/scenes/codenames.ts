import { icon } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { CodenamesScene, Codeword } from './scene.ts'

/**
 * لوح كودنيمز.
 *
 * ————————————————— لماذا يُحسب مقاس الخانة من الكلمة —————————————————
 *
 * بقيّة اللوحات في المشروع تحمل رمزًا واحدًا في الخانة، فيكفيها مربّع يُقسّم
 * عليه المكان. وهذه تحمل **كلمة عربية** طولها يتراوح بين ثلاثة أحرف وعشرة،
 * ومقاس ثابت يعني أحد أمرين: خانة تتّسع لأطول كلمة فتضيع المساحة على أقصرها،
 * أو خانة تقصّ الطويلة. والقصّ هنا ليس عيبًا شكليًا بل يفسد اللعبة: اللاعب
 * يخمّن الرابط بين كلمات، فكلمة نصفها مقصوص تخرجه من الجولة.
 *
 * فالخط يُحسب من أطول كلمة في اللوح، والخانة تأخذ عرضًا كاملًا من الصندوق
 * وارتفاعًا أقلّ لأن الكلمة سطر واحد لا شكل مربّع.
 *
 * ————————————————————— لوح السيّد —————————————————————
 *
 * نفس القالب بحقل `master`. الفرق أن كل خانة تُلوَّن بهويتها لا بما انكشف،
 * والمكشوفة تُعتَّم بعلامة صحّ فيعرف السيّد ما بقي عليه أن يوصله دون أن
 * يفقد خريطته. وترتيب الكلمات واحد في اللوحين بحكم أنهما قالب واحد.
 */

type Paint = { fill: string; on: string; label: string }

const PAINTS: Record<Codeword, Paint> = {
  red: { fill: 'var(--color-red)', on: 'var(--on-red)', label: 'الأحمر' },
  blue: { fill: 'var(--color-ink)', on: 'var(--on-ink)', label: 'الأزرق' },
  neutral: { fill: 'var(--color-paper-tint)', on: 'var(--color-ink)', label: 'محايدة' },
  assassin: { fill: 'var(--color-red-deep)', on: 'var(--on-red-deep)', label: 'القاتل' },
}

const GAP = 12
/**
 * الصندوق الباقي بعد العمود الجانبي وحشوة المشهد.
 *
 * الحساب: 1180 عرض المشهد، ناقص 88 حشوته، ناقص 300 العمود، ناقص 28 الفجوة،
 * ناقص 66 حشوة البطاقة وحدّيها. وتجاوزه لا يظهر خطأً بل يقصّ اللوح من حافته
 * لأن المشهد `overflow: hidden`، فتضيع كلمات كاملة من اللعبة.
 */
const ASIDE_W = 300
const BOX_W = 690
const BOX_H = 470

export function codenamesScene(s: CodenamesScene): string {
  const cols = Math.max(1, Math.floor(s.cols) || 1)
  const rows = Math.max(1, Math.ceil(s.cells.length / cols))
  const width = Math.floor((BOX_W - GAP * (cols - 1)) / cols)
  const height = Math.min(Math.floor((BOX_H - GAP * (rows - 1)) / rows), Math.round(width * 0.62))

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body">
        <aside class="stack" style="width: ${ASIDE_W}px">
          <!-- nowrap لازم: «كود نيمز» كلمتان ينكسران في شريط بهذا العرض،
               ومع «لوح السيّد» يصير الشريط أربعة أسطر رأسية غير مقروءة -->
          <div class="bar">
            <span style="white-space: nowrap">${s.master ? 'لوح السيّد' : s.game.name}</span>
            <span class="bar__count"><bdi>${cols}×${rows}</bdi></span>
          </div>

          <div class="card grow stack stack--lg">
            ${teamRow('red', s.left.red, s.turn === 'red')}
            ${teamRow('blue', s.left.blue, s.turn === 'blue')}
            <div class="grow"></div>
            ${s.clue ? clueChip(s.clue) : waitingChip(s.turn)}
            ${s.note ? html`<div class="note">${s.note}</div>` : ''}
          </div>
        </aside>

        <main class="stack grow" style="align-items: center; justify-content: center">
          <div class="card card--hero" style="flex: none; padding: var(--space-base)">
            <div style="${raw(gridStyle(cols, width, height))}">
              ${s.cells.map((cell) => square(cell, s.master === true, width, height, fontFor(cell.word, width)))}
            </div>
          </div>
        </main>
      </div>
    </div>
  `.toString()
}

/**
 * خط كل كلمة يُحسب من طولها هي، لا من أطول كلمة في اللوح.
 *
 * كان المقاس واحدًا يُشتقّ من أطول كلمة، فتنزل «باب» و«نار» معها إلى مقاس
 * «مستشفى» بلا سبب. والاتساق هنا يكلّف أكثر مما يعطي: اللوح يُقرأ كلمةً كلمةً
 * لا سطرًا واحدًا، فتفاوت المقاس فيه لا يُلحظ، أما الكلمة الصغيرة بلا داعٍ
 * فتُلحظ.
 *
 * والتقدير بعرض الحرف لا بقياس فعلي: القالب نصّ لا متصفّح. ومعامل 0.72 مقيس
 * على أعرض حروف الخط: «مستشفى» بالسين والشين والفاء أعرض بكثير من «باب» بنفس
 * عدد الحروف، والمعامل المتوسّط كان يمرّرها ثم يقصّها المتصفّح بثلاث نقاط —
 * وكلمة نصفها مقصوص تخرج صاحبها من الجولة.
 */
function fontFor(word: string, width: number): number {
  const letters = Math.max(1, [...word.trim()].length)
  const padded = width - 24
  return Math.max(16, Math.min(34, Math.floor(padded / (letters * 0.72))))
}

function gridStyle(cols: number, width: number, height: number): string {
  // الشبكة ltr كما في بقية اللوحات: أزرار ديسكورد تُرصّ يسارًا-يمينًا دائمًا،
  // فعكس الشبكة يجعل الخانة الأولى في الصورة آخر زر في الشريط
  return [
    'display:grid',
    'direction:ltr',
    `gap:${GAP}px`,
    `grid-template-columns:repeat(${cols}, ${width}px)`,
    `grid-auto-rows:${height}px`,
  ].join(';')
}

function square(
  cell: CodenamesScene['cells'][number],
  master: boolean,
  width: number,
  height: number,
  font: number,
): Html {
  const shown = master || cell.revealed
  const paint = shown ? PAINTS[cell.side] : null
  // في لوح السيّد تُعتَّم المكشوفة بدل أن تُخفى: هويتها ما تزال تفيده في قراءة
  // ما بقي، والذي تغيّر أنها لم تعد هدفًا يوصله
  const spent = master && cell.revealed

  const box = [
    `width:${width}px`,
    `height:${height}px`,
    `background:${paint ? paint.fill : 'var(--color-surface)'}`,
    'border: var(--stroke-base) solid var(--color-ink)',
    'border-radius: var(--radius-sm)',
    'display:grid',
    'place-items:center',
    'padding: 0 10px',
    'position:relative',
    spent ? 'opacity:0.45' : '',
  ]
    .filter(Boolean)
    .join(';')

  const text = [
    `color:${paint ? paint.on : 'var(--color-ink)'}`,
    `font-size:${font}px`,
    'font-weight:800',
    'font-family: var(--font-display)',
    'text-align:center',
    'line-height:1.25',
    'white-space:nowrap',
    'overflow:hidden',
    'text-overflow:ellipsis',
    'max-width:100%',
    'direction:rtl',
  ].join(';')

  return html`<div style="${raw(box)}">
    <span style="${raw(text)}">${cell.word}</span>
    ${cell.revealed && !master ? tick(paint) : ''}
  </div>`
}

/** علامة صغيرة تقول «انكشفت» للوح العام، فاللون وحده يلتبس على من يراه أول مرة. */
function tick(paint: Paint | null): Html {
  const style = [
    'position:absolute',
    'top:5px',
    'inset-inline-start:7px',
    `color:${paint ? paint.on : 'var(--color-ink)'}`,
    'opacity:0.8',
    'display:flex',
  ].join(';')
  return html`<span style="${raw(style)}">${raw(icon('check', { size: 17 }))}</span>`
}

function teamRow(side: 'red' | 'blue', left: number, active: boolean): Html {
  const paint = PAINTS[side]
  const chip = [
    'display:flex',
    'align-items:center',
    'gap:10px',
    'padding:10px 14px',
    'border-radius: var(--radius-sm)',
    'border: var(--stroke-base) solid var(--color-ink)',
    `background:${paint.fill}`,
    `color:${paint.on}`,
    active ? 'box-shadow: -5px 5px 0 var(--color-ink)' : '',
  ]
    .filter(Boolean)
    .join(';')

  return html`<div style="${raw(chip)}">
    <span style="font-weight:800">${paint.label}</span>
    <span class="grow"></span>
    <bdi style="font-size:30px; font-weight:800">${left}</bdi>
  </div>`
}

/** التلميح هو حالة الجولة كلها، فيأخذ حجمًا يليق بذلك لا سطرًا في الهامش. */
function clueChip(clue: { word: string; count: number }): Html {
  return html`<div
    style="text-align:center; padding: 14px; border-radius: var(--radius-sm);
           border: var(--stroke-base) solid var(--color-ink);
           background: var(--color-yellow); color: var(--on-yellow)"
  >
    <div style="font-size:15px; opacity:0.75">التلميح</div>
    <div style="font-size:30px; font-weight:800; font-family: var(--font-display)">
      ${clue.word} <bdi>${clue.count}</bdi>
    </div>
  </div>`
}

function waitingChip(turn: 'red' | 'blue'): Html {
  return html`<div class="note">
    ${raw(icon('hourglass', { size: 20 }))} سيّد ${PAINTS[turn].label} يكتب تلميحه
  </div>`
}

function background(): Html {
  return html`
    ${blob({ width: 560, variant: 1, fill: 'var(--color-surface)', top: -160, end: -140 })}
    ${blob({ width: 420, variant: 2, fill: 'var(--color-paper-tint)', bottom: -170, start: -130 })}
  `
}
