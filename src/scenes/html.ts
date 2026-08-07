/**
 * أدوات بناء HTML للقوالب.
 *
 * أسماء ديسكورد يكتبها المستخدمون ويمكن أن تحوي < > & — تمرير أي منها
 * خامًا يكسر التخطيط أو يحقن عناصر. لذلك `html` يهرّب كل قيمة مُدرَجة
 * افتراضيًا، ولا يمرّ الخام إلا عبر `raw` صراحةً.
 */

export class Html {
  constructor(readonly value: string) {}
  toString(): string {
    return this.value
  }
}

/** يمرّر نصًا كـ HTML بلا تهريب — استخدمه فقط لمخرجات قوالبنا. */
export function raw(value: string): Html {
  return new Html(value)
}

export function esc(value: unknown): string {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function html(strings: TemplateStringsArray, ...values: unknown[]): Html {
  let out = strings[0] ?? ''
  for (let i = 0; i < values.length; i++) {
    out += render(values[i]) + (strings[i + 1] ?? '')
  }
  return new Html(out)
}

function render(value: unknown): string {
  if (value instanceof Html) return value.value
  if (value == null || value === false) return ''
  if (Array.isArray(value)) return value.map(render).join('')
  return esc(value)
}

/**
 * كتل عضوية — بديل غيوم المرجع.
 *
 * البرييف الأصلي نصّ على "أشكال هندسية عضوية (blobs) لا مستطيلات"، وهي أيضًا
 * لغة صور Drb7h و Real. استبدال الغيوم بها يخرجنا من هوية Swip ويعيدنا لهويتنا.
 */
/*
 * أنصاف الأقطار متفاوتة عمدًا. الكتلة ذات الأنصاف المتساوية تُقرأ دائرة
 * لا شكلًا عضويًا — وهذا ما يفصل لغة Drb7h البصرية عن مجرد أيقونة مدوّرة.
 */
const BLOB_PATHS = [
  'M167 41c19 26 27 63 12 90c-15 27-53 44-84 47c-31 3-55-8-73-30C4 126-4 92 8 63C20 34 52 10 86 5c34-5 62 10 81 36z',
  'M181 60c13 33 5 76-17 101c-22 25-58 32-90 25c-32-7-60-28-69-58c-9-30 1-69 24-92C71 13 108 6 138 15c30 9 30 12 43 45z',
  'M158 26c26 21 42 61 38 96c-4 35-28 65-59 76c-31 11-69 3-95-19C16 157 2 121 8 88C14 55 40 25 73 13c33-12 59-8 85 13z',
]

export function blob(opts: {
  width: number
  variant?: 0 | 1 | 2
  /** لون التعبئة — تمرير var() من التوكنات. */
  fill: string
  /** حد أسود يحوّلها من عمق خلفي إلى ملصق بارز. */
  outlined?: boolean
  rotate?: number
  top?: number
  bottom?: number
  start?: number
  end?: number
}): Html {
  const pos = [
    opts.top !== undefined ? `top:${opts.top}px` : '',
    opts.bottom !== undefined ? `bottom:${opts.bottom}px` : '',
    opts.start !== undefined ? `inset-inline-start:${opts.start}px` : '',
    opts.end !== undefined ? `inset-inline-end:${opts.end}px` : '',
    opts.rotate ? `transform:rotate(${opts.rotate}deg)` : '',
  ]
    .filter(Boolean)
    .join(';')

  const d = BLOB_PATHS[opts.variant ?? 0]
  const stroke = opts.outlined
    ? 'stroke="var(--color-ink)" stroke-width="9" stroke-linejoin="round"'
    : ''

  return raw(`
    <svg class="blob" style="${pos}" width="${opts.width}" viewBox="-6 -6 214 214" fill="none">
      <path d="${d}" fill="${opts.fill}" ${stroke}/>
    </svg>`)
}

/** أفتار اللاعب، أو دائرة متقطّعة إن كانت الخانة فارغة. */
export function avatar(src: string | null, extraClass = ''): Html {
  const cls = `avatar ${extraClass}`.trim()
  return src
    ? html`<img class="${raw(cls)}" src="${src}" alt="" />`
    : html`<div class="${raw(cls)} avatar--empty"></div>`
}
