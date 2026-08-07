import { icon } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { RoundScene } from './scene.ts'

/**
 * مشهد الجولة — شاشة السؤال في ألعاب الكتابة.
 *
 * القرار الحاكم: اللاعب يقرأ هذه الصورة من جواله وسط محادثة تتحرك،
 * فالسؤال وحده هو بطل الشاشة. لذلك اسم اللعبة ينزل إلى الشريط العلوي
 * (بحجم label لا display)، ويأخذ السؤال المساحة كلها في بطاقة بطلة.
 *
 * السؤال بلون الحبر لا بالأحمر: الأحمر لون العناوين والهوية (DESIGN §3)،
 * والسؤال محتوى يُقرأ من بعيد — والحبر على السطح الكريمي ≈ 16:1 وهو أعلى
 * تباين متاح في اللوحة. الهوية تُحمل هنا بظل البطاقة الأحمر لا بلون النص.
 */
export function roundScene(s: RoundScene): string {
  const prompt = s.prompt.trim()
  // كلمة مفردة أم سؤال؟ العنوان يتبع المحتوى بدل أن يكذب عليه.
  const heading = prompt.includes(' ') ? 'السؤال' : 'الكلمة'

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>${s.game.name}</span>
          <span class="bar__count">الجولة ${s.index} من ${s.total}</span>
        </div>

        <div
          class="card card--hero grow center stack stack--lg"
          style="justify-content: center; padding-block: var(--space-lg)"
        >
          <h2 class="title title--quoted">${heading}</h2>
          ${promptText(prompt)} ${s.hint ? hintNote(s.hint) : ''}
        </div>

        <!-- لا تنتهي الشاشة بلا فعل: يعرف اللاعب ماذا يفعل الآن (DESIGN §1) -->
        <div class="note" style="${raw(CHIP)}">
          ${raw(icon('keyboard', { size: 24 }))} اكتب إجابتك في الشات
        </div>
      </div>
    </div>
  `.toString()
}

/** يُحوّل `.note` من شريط بعرض الأب إلى كبسولة بمقاس محتواها. */
const CHIP = 'align-self: center; display: inline-flex; align-items: center; gap: var(--space-xs)'

/**
 * السؤال نفسه. المقاس يتبع الطول: كلمة قصيرة تكبر حتى تملأ الشاشة،
 * وسؤال طويل ينزل درجات فلا يتجاوز سطرين. مقاس ثابت واحد كان سيترك
 * الكلمة القصيرة ضائعة أو يقصّ السؤال الطويل.
 */
function promptText(prompt: string): Html {
  const style = [
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-black)',
    `font-size: ${promptSize(prompt)}px`,
    // العربية لا تنزل تحت 1.7 (DESIGN §4) — والهواء هنا مقصود، السطر بطل الشاشة
    'line-height: 1.7',
    'letter-spacing: 0',
    'color: var(--color-ink)',
    'max-width: 1150px',
    'text-wrap: balance',
  ].join('; ')

  return html`<p style="${raw(style)}">${prompt}</p>`
}

/** عدد الحروف بالمحارف لا بالوحدات — العربية فيها محارف مركّبة. */
function promptSize(prompt: string): number {
  const n = [...prompt].length
  if (n <= 10) return 148
  if (n <= 18) return 122
  if (n <= 30) return 100
  if (n <= 52) return 82
  return 66
}

/** التلميح تابع للسؤال لا منافس له: كبسولة صغيرة تحته مباشرة. */
function hintNote(hint: string): Html {
  return html`<div class="note" style="${raw(CHIP)}">
    ${raw(icon('target', { size: 22 }))} ${hint}
  </div>`
}

/** نفس عمق خلفية اللوبي: كتل بلا حد تطفو خلف البطاقات فلا تزاحم النص. */
function background(): Html {
  return html`
    ${blob({ width: 560, variant: 2, fill: 'var(--color-surface)', top: -180, end: -140 })}
    ${blob({ width: 500, variant: 1, fill: 'var(--color-surface)', bottom: -170, start: -150 })}
    ${blob({ width: 260, variant: 0, fill: 'var(--color-paper-tint)', bottom: 60, end: 40 })}
  `
}
