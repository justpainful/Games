import { icon } from '../design/icons.ts'
import { avatar, blob, html, raw, type Html } from './html.ts'
import type { BoardScene, PlayerView } from './scene.ts'

/**
 * مشهد اللوحة — يخدم «xo» (3×3) و«اشبك» (7×6) بلا فرعين في الكود.
 *
 * القرار الحاكم: اللوحة لا تُقاس بمقاس ثابت بل تُحسب من `cols` وعدد الخانات،
 * فمقاس الخانة هو أكبر مربّع يسع الشبكة داخل صندوق واحد (930×620). لهذا تخرج
 * خانة إكس أو بـ197px وخانة اشبك بـ91px من نفس السطر، وأي لوحة بينهما تعمل
 * بلا تعديل.
 *
 * الخانة **أعمق** من البطاقة لا أفتح: `paper` داخل `surface`. هذا يعكس علاقة
 * البطاقة بالخلفية عمدًا فتُقرأ الخانات حفرًا في اللوحة لا قصاصات فوقها —
 * وهو ما تحتاجه لعبة تُسقط فيها الأقراص.
 *
 * الشبكة وحدها `direction: ltr` رغم أن المشهد كله RTL: أزرار ديسكورد تُرسم
 * يسارًا-يمينًا دائمًا، فلو عكسنا الشبكة صار العمود «1» يمين الصورة ويسار
 * شريط الأزرار — وهذا أسوأ أنواع الخلل لأنه لا يُرى إلا بعد ضغطة خاطئة.
 */

/** لون كل جهة بترتيبها في `sides` — أحمر ثم أصفر، وهما لونا الهوية. */
type Paint = { fill: string; on: string }

const PAINTS: readonly Paint[] = [
  { fill: 'var(--color-red)', on: 'var(--on-red)' },
  { fill: 'var(--color-yellow)', on: 'var(--on-yellow)' },
  { fill: 'var(--color-ink)', on: 'var(--on-ink)' },
]

const NEUTRAL: Paint = { fill: 'var(--color-ink)', on: 'var(--on-ink)' }

const GAP = 14
/** الصندوق الذي يجب أن تسعه الشبكة — مشتقّ من عرض المشهد ناقص العمود الجانبي. */
const BOX_W = 700
const BOX_H = 460
const CELL_MIN = 54

/**
 * فوق هذا العدد لا يمكن إعطاء زر لكل خانة (ديسكورد: 25 زرًا كحدّ أقصى)،
 * فاللوحة تُلعب بالعمود لا بالخانة — ولذلك يتغيّر الترقيم المعروض معها.
 */
const PER_CELL_LIMIT = 12

export function boardScene(s: BoardScene): string {
  const cols = Math.max(1, Math.floor(s.cols) || 1)
  const rows = Math.max(1, Math.ceil(s.cells.length / cols))
  const cell = cellSize(cols, rows)
  const winning = new Set(s.winning ?? [])
  const byColumn = s.cells.length > PER_CELL_LIMIT

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body">
        <!-- العمود الجانبي — يمينًا في RTL -->
        <aside class="stack" style="width: 340px">
          <div class="bar">
            <span>${s.game.name}</span>
            <span class="bar__count"><bdi>${cols}×${rows}</bdi></span>
          </div>

          <div class="card grow stack stack--lg">
            ${s.sides.map((side, i) => sideRow(side, PAINTS[i] ?? NEUTRAL, s.turnOf?.id === side.player.id))}
            <div class="grow"></div>
            ${s.turnOf ? turnChip(s.turnOf) : ''} ${s.note ? noteChip(s.note, !s.turnOf) : ''}
          </div>
        </aside>

        <main class="stack grow" style="align-items: center; justify-content: center">
          <div
            class="card card--hero stack"
            style="align-items: center; gap: var(--space-sm); flex: none"
          >
            ${byColumn ? columnHeads(s.cells, cols, cell) : ''} ${grid(s, cols, cell, winning)}
            ${s.turnOf ? hint(byColumn) : ''}
          </div>
        </main>
      </div>
    </div>
  `.toString()
}

/** أكبر مربّع يسع الشبكة داخل الصندوق — الطول أو العرض أيهما يضغط أكثر. */
function cellSize(cols: number, rows: number): number {
  const byWidth = (BOX_W - GAP * (cols - 1)) / cols
  const byHeight = (BOX_H - GAP * (rows - 1)) / rows
  return Math.max(CELL_MIN, Math.floor(Math.min(byWidth, byHeight)))
}

function columns(cols: number, cell: number): string {
  return `display:grid; direction:ltr; gap:${GAP}px; grid-template-columns:repeat(${cols}, ${cell}px)`
}

function grid(s: BoardScene, cols: number, cell: number, winning: Set<number>): Html {
  const perCell = s.cells.length <= PER_CELL_LIMIT
  return html`<div style="${raw(columns(cols, cell))}">
    ${s.cells.map((value, i) => square(value, i, s, cell, winning.has(i), perCell))}
  </div>`
}

/**
 * خانة واحدة. الفارغة تحمل رقمها حين تُلعب اللوحة بالخانة — بلا هذا الرقم
 * لا يعرف اللاعب أي زر يخص أي مربّع، لأن ديسكورد يرصّ الأزرار خمسة في الصف
 * فينكسر شكل الـ3×3 في شريط الأزرار.
 */
function square(
  value: string | null,
  index: number,
  s: BoardScene,
  cell: number,
  won: boolean,
  perCell: boolean,
): Html {
  const box = [
    `width:${cell}px`,
    `height:${cell}px`,
    `background: ${won ? 'var(--color-ink)' : 'var(--color-paper)'}`,
    'border: var(--stroke-base) solid var(--color-ink)',
    'border-radius: var(--radius-sm)',
    'display:grid',
    'place-items:center',
  ].join(';')

  if (value !== null) {
    const paint = PAINTS[s.sides.findIndex((side) => side.mark === value)] ?? NEUTRAL
    return html`<div style="${raw(box)}">${mark(value, paint, Math.round(cell * 0.64))}</div>`
  }

  if (!perCell) return html`<div style="${raw(box)}"></div>`

  const num = [
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-black)',
    `font-size: ${Math.round(cell * 0.34)}px`,
    'line-height: 1',
    'color: color-mix(in srgb, var(--color-ink) 30%, transparent)',
  ].join(';')
  return html`<div style="${raw(box)}"><span style="${raw(num)}">${index + 1}</span></div>`
}

/**
 * رأس الأعمدة — يظهر فقط في اللوحات التي تُلعب بالعمود.
 * العمود الممتلئ يُطفأ بدل أن يُحذف: مكانه يجب أن يبقى محجوزًا وإلا انزاحت
 * بقية الأرقام عن أعمدتها.
 */
function columnHeads(cells: (string | null)[], cols: number, cell: number): Html {
  const heads = Array.from({ length: cols }, (_, c) => {
    const open = (cells[c] ?? null) === null
    const style = [
      'height: 46px',
      'display:grid',
      'place-items:center',
      'border-radius: var(--radius-pill)',
      'font-family: var(--font-display), sans-serif',
      'font-weight: var(--weight-black)',
      'font-size: var(--size-label)',
      'line-height: 1',
      open
        ? 'background: var(--color-yellow); color: var(--on-yellow); border: var(--stroke-thin) solid var(--color-ink)'
        : 'background: transparent; color: color-mix(in srgb, var(--color-ink) 35%, transparent); border: var(--stroke-thin) dashed color-mix(in srgb, var(--color-ink) 35%, transparent)',
    ].join(';')
    return html`<div style="${raw(style)}">${c + 1}</div>`
  })

  return html`<div style="${raw(columns(cols, cell))}">${heads}</div>`
}

/**
 * العلامة. X و O تُرسمان خطًّا لا حرفًا كي لا يتغيّر شكلهما بتغيّر الخط،
 * وكل ما عداهما قرص ملوّن يحمل حرفه — الحرف داخل القرص ليس زينة: القرص
 * الأحمر والقرص الأصفر لا يفترقان عند عمى الألوان، والحرف هو ما يفرقهما.
 */
function mark(value: string, paint: Paint, size: number): Html {
  const key = value.trim().toUpperCase()
  if (key === 'X') return raw(cut('M22 22 L78 78 M78 22 L22 78', paint.fill, size))
  if (key === 'O') return raw(ring(paint.fill, size))
  return disc(value, paint, Math.round(size * 1.05))
}

/** حدّ حبري أعرض تحت اللون — نفس «القصاصة المقصوصة» بلغة SVG. */
function cut(d: string, fill: string, size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none" ` +
    `stroke-linecap="round" stroke-linejoin="round">` +
    `<path d="${d}" stroke="var(--color-ink)" stroke-width="32"/>` +
    `<path d="${d}" stroke="${fill}" stroke-width="18"/>` +
    `</svg>`
  )
}

function ring(fill: string, size: number): string {
  return (
    `<svg width="${size}" height="${size}" viewBox="0 0 100 100" fill="none">` +
    `<circle cx="50" cy="50" r="31" stroke="var(--color-ink)" stroke-width="32"/>` +
    `<circle cx="50" cy="50" r="31" stroke="${fill}" stroke-width="18"/>` +
    `</svg>`
  )
}

function disc(value: string, paint: Paint, size: number): Html {
  const style = [
    `width:${size}px`,
    `height:${size}px`,
    // بلا هذا ينضغط القرص بيضة داخل صف الجهة المرن
    'flex: none',
    'border-radius: var(--radius-pill)',
    `background: ${paint.fill}`,
    `color: ${paint.on}`,
    'border: var(--stroke-base) solid var(--color-ink)',
    'display:grid',
    'place-items:center',
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-black)',
    `font-size: ${Math.round(size * 0.46)}px`,
    'line-height: 1',
  ].join(';')
  return html`<div style="${raw(style)}">${value}</div>`
}

/** صف جهة في العمود الجانبي — الجهة صاحبة الدور تُحاط بقصاصة صفراء. */
function sideRow(
  side: { mark: string; player: PlayerView },
  paint: Paint,
  active: boolean,
): Html {
  const box = [
    'display:flex',
    'align-items:center',
    'gap: var(--space-sm)',
    'padding: var(--space-xs)',
    'border-radius: var(--radius-sm)',
    `border: var(--stroke-thin) solid ${active ? 'var(--color-ink)' : 'transparent'}`,
    active ? 'background: color-mix(in srgb, var(--color-yellow) 40%, transparent)' : '',
  ]
    .filter(Boolean)
    .join(';')

  return html`
    <div style="${raw(box)}">
      ${avatar(side.player.avatar, 'avatar--sm')}
      <!-- bdi: أسماء ديسكورد لاتينية غالبًا وتنتقل حروفها المحايدة للطرف الخطأ في RTL -->
      <bdi class="player__name" style="max-width: 180px">${side.player.name}</bdi>
      <div class="grow"></div>
      ${mark(side.mark, paint, 46)}
    </div>
  `
}

const ROW = 'display:flex; align-items:center; justify-content:center; gap: var(--space-xs)'
const CLIP = 'overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0'

/** الاسم وحده يُقصّ، أما «الدور على» فلا ينكسر سطرًا وإلا صار الشريط سطرين. */
function turnChip(p: PlayerView): Html {
  return html`<div class="note note--ready" style="${raw(ROW)}; flex-wrap: nowrap">
    ${raw(icon('play', { size: 20, fill: true }))}
    <span style="flex: none; white-space: nowrap">الدور على</span>
    <bdi style="${raw(CLIP)}">${p.name}</bdi>
  </div>`
}

/** الملاحظة جملة كاملة لا اسمًا — تلتفّ سطرين ولا تُقصّ بنقاط. */
function noteChip(note: string, done: boolean): Html {
  return html`<div class="note ${raw(done ? 'note--ready' : '')}" style="${raw(ROW)}">
    <span style="flex: none">${raw(icon(done ? 'trophy' : 'hourglass', { size: 20 }))}</span>
    <bdi style="text-wrap: balance">${note}</bdi>
  </div>`
}

/** الشاشة لا تنتهي بلا فعل: اللاعب يعرف ماذا يضغط الآن (DESIGN §1). */
function hint(byColumn: boolean): Html {
  const style = 'font-size: var(--size-meta); color: color-mix(in srgb, var(--color-ink) 55%, transparent)'
  return html`<p style="${raw(style)}">
    ${byColumn ? 'اضغط رقم العمود لإسقاط قرصك' : 'اضغط رقم الخانة التي تريدها'}
  </p>`
}

/** نفس عمق خلفية اللوبي: كتل بلا حد خلف البطاقات فلا تزاحم اللوحة. */
function background(): Html {
  return html`
    ${blob({ width: 560, variant: 1, fill: 'var(--color-surface)', top: -190, end: -150 })}
    ${blob({ width: 500, variant: 2, fill: 'var(--color-surface)', bottom: -180, start: -160 })}
    ${blob({ width: 260, variant: 0, fill: 'var(--color-paper-tint)', top: 240, end: 300 })}
  `
}
