/**
 * تطبيع النص العربي لمقارنة إجابات اللاعبين.
 *
 * اللاعبون يكتبون بسرعة في شات ديسكورد: همزات ناقصة، تشكيل عشوائي، تطويل،
 * أرقام هندية، مسافات زائدة، ومحارف اتجاه مخفية تلتصق بالنسخ واللصق.
 * المقارنة الخام ترفض إجابات صحيحة، ولذلك نمرّ بكل نص عبر خط تطبيع واحد
 * قبل أي مقارنة.
 *
 * قاعدة الاتجاه: نميل إلى القبول لا الرفض. التطبيع «الفضفاض» قد يقبل
 * إجابة قريبة جدًا من الصحيحة أحيانًا، وهذا أرخص بكثير من رفض إجابة صحيحة.
 *
 * ملاحظة للمحرّرين: المحارف غير المرئية مكتوبة بصيغة \uXXXX عمدًا — كتابتها
 * كمحارف حقيقية تجعل الملف غير قابل للمراجعة (ويرفضها no-irregular-whitespace).
 */

/** محارف غير مرئية: soft hyphen، ZWSP/ZWNJ/ZWJ، RLM/LRM، علامات التضمين والعزل، BOM. */
const INVISIBLE = /[\u00AD\u061C\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** التشكيل: فتحة/ضمة/كسرة/شدة/سكون/تنوين (U+064B–U+0652)، الألف الخنجرية (U+0670)، وعلامات المصاحف. */
const DIACRITICS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g

/** التطويل (الكشيدة) U+0640. */
const TATWEEL = /\u0640/g

/** الأرقام العربية الهندية (U+0660–U+0669) والفارسية (U+06F0–U+06F9). */
const DIGITS = /[\u0660-\u0669\u06F0-\u06F9]/g

/**
 * الحروف التي نوحّدها: الهمزات (U+0621–U+0626)، التاء المربوطة، الألف المقصورة،
 * ألف الوصل، وبدائل فارسية شائعة في لوحات المفاتيح (ک، ی، ۀ).
 */
const LETTERS = /[\u0621-\u0626\u0629\u0649\u0671\u06A9\u06C0\u06CC]/g

/** ترقيم شائع يُحذف من أطراف النص وأطراف كل كلمة. */
const EDGE_PUNCT = /^[.,،؛;:؟?!"'«»“”‘’…–—-]+|[.,،؛;:؟?!"'«»“”‘’…–—-]+$/g

const SPACES = /\s+/g

/**
 * كلمات تبدأ بـ«ال» أصالةً، فلا تُقتطع منها أداة التعريف.
 * مكتوبة بصيغتها بعد التطبيع (ألف موحّدة، بلا تشكيل).
 */
const ARTICLE_KEEP = new Set([
  'الله',
  'اللهم',
  'التي',
  'الذي',
  'الذين',
  'اللذان',
  'اللذين',
  'اللتان',
  'اللتين',
  'اللاتي',
  'اللائي',
  'اللواتي',
  'الان', // «الآن»
  'اليه', // «إليه»
  'اليها',
])

function toAsciiDigit(digit: string): string {
  const code = digit.codePointAt(0) ?? 0
  const base = code >= 0x06f0 ? 0x06f0 : 0x0660
  return String(code - base)
}

/**
 * توحيد الحروف.
 *
 * `dropHamza` يفعّل النسخة «الفضفاضة» التي تحذف الهمزة تمامًا بدل ردّها إلى
 * حرف أساسي — انظر شرح القرار فوق {@link normalizeLoose}.
 */
function mapLetters(text: string, dropHamza: boolean): string {
  return text.replace(LETTERS, (ch) => {
    switch (ch) {
      case 'أ': // أ
      case 'إ': // إ
      case 'آ': // آ
      case 'ٱ': // ٱ
        return 'ا' // ا
      case 'ة': // ة
      case 'ۀ': // ۀ
        return 'ه' // ه
      case 'ى': // ى
      case 'ی': // ی (فارسية)
        return 'ي' // ي
      case 'ک': // ک (فارسية)
        return 'ك' // ك
      case 'ئ': // ئ
        return dropHamza ? '' : 'ي' // ي
      case 'ؤ': // ؤ
        return dropHamza ? '' : 'و' // و
      case 'ء': // ء
        return dropHamza ? '' : 'ء'
      default:
        return ch
    }
  })
}

/**
 * حذف «ال» التعريف من بداية الكلمة.
 *
 * شرطان يمنعان الحذف:
 * 1. الكلمة في {@link ARTICLE_KEEP} (مثل «الله» و«التي» — «ال» فيها من بنية الكلمة).
 * 2. ما يتبقى بعد الحذف أقصر من حرفين (يحمي «إلى» ← «الي» و«إلا» ← «الا»).
 *
 * الحدّ عند حرفين لا ثلاثة كي تبقى الجذور القصيرة تعمل: «اليد» ← «يد»،
 * «الأم» ← «ام»، «الدم» ← «دم».
 *
 * الاقتطاع يجري على الطرفين معًا في {@link matches}، فالتماثل محفوظ: أي كلمة
 * تُقتطع منها «ال» خطأً (مثل «ألمانيا» ← «مانيا») تُقتطع كذلك في الإجابة
 * الصحيحة، فلا تنكسر المطابقة — أقصى الضرر قبولٌ أوسع قليلًا.
 */
function stripArticle(word: string): string {
  if (!word.startsWith('ال')) return word
  if (ARTICLE_KEEP.has(word)) return word
  const rest = word.slice(2)
  return rest.length >= 2 ? rest : word
}

function pipeline(input: string, dropHamza: boolean): string {
  // الدالة موصوفة بأنها تستقبل نصًا، لكنها تُستدعى من مسار رسائل ديسكورد،
  // فنحرس ضد null/undefined بدل أن نُسقط اللعبة كلها.
  if (typeof input !== 'string' || input.length === 0) return ''

  // NFKC يجمع «ا + همزة» في «أ»، ويردّ أشكال العرض المنسوخة (ﻻ، ﺍ) إلى حروفها.
  let text = input.normalize('NFKC')
  text = text.replace(INVISIBLE, '')
  text = text.replace(TATWEEL, '')
  text = text.replace(DIACRITICS, '')
  text = mapLetters(text, dropHamza)
  text = text.replace(DIGITS, toAsciiDigit)
  text = text.toLowerCase()
  text = text.replace(SPACES, ' ').trim()
  if (text.length === 0) return ''

  const words: string[] = []
  for (const raw of text.split(' ')) {
    const word = stripArticle(raw.replace(EDGE_PUNCT, ''))
    if (word.length > 0) words.push(word)
  }
  return words.join(' ')
}

/**
 * التطبيع الكامل — الصيغة المعيارية لأي نص قبل المقارنة أو التخزين.
 *
 * يشمل: توحيد الألف والتاء المربوطة والألف المقصورة، ردّ الهمزات إلى حروفها،
 * حذف التشكيل والتطويل والمحارف غير المرئية، تحويل الأرقام الهندية/الفارسية
 * إلى لاتينية، تصغير اللاتيني، توحيد المسافات، قصّ الترقيم من الأطراف،
 * وحذف «ال» التعريف.
 *
 * الإيموجي تبقى كما هي عمدًا: بعض الألعاب إجاباتها إيموجي، وحذفها يمحو
 * الإجابة نفسها. (ملاحظة: ZWJ يُحذف كما هو مطلوب، فتتفكك إيموجي العائلات
 * إلى مكوّناتها — وهذا متسق على الطرفين فلا يؤثّر على المقارنة.)
 */
export function normalize(s: string): string {
  return pipeline(s, false)
}

/**
 * تطبيع «فضفاض» يحذف الهمزة بالكامل (ء، ؤ، ئ) بدل ردّها إلى حرف.
 *
 * لماذا نحتاجه؟ ردّ `ؤ ← و` و`ئ ← ي` ليس آمنًا دائمًا. الكرسي الذي تجلس عليه
 * الهمزة إملائي لا صوتي، والكلمة الواحدة تُكتب بكرسيين:
 *
 *   «مسؤول» ← «مسوول»   بينما   «مسئول» ← «مسيول»
 *
 * أي أن قاعدة يُفترض أنها تزيد التسامح خلقت اختلافًا جديدًا بين إملاءين
 * صحيحين للكلمة نفسها. الحل: نحسب صيغة ثانية تحذف الهمزة تمامًا، فتلتقي
 * الكتابتان عند «مسول». {@link matches} يقارن الصيغتين معًا.
 *
 * الثمن المقبول: تسامح أوسع («سماء» تطابق «سما»، و«بئر» تطابق «بر»).
 * هذا في اتجاه القبول لا الرفض، وهو الاتجاه الصحيح للعبة.
 */
export function normalizeLoose(s: string): string {
  return pipeline(s, true)
}

/** المسافات لا تُميّز إجابة عن أخرى: «عبد الله» و«عبدالله» شيء واحد. */
function compact(s: string): string {
  return s.replace(/ /g, '')
}

/**
 * المقارنة النهائية: هل إجابة اللاعب مقبولة؟
 *
 * تُقبل إذا طابقت `correct` أو أي عنصر في `accept` بعد التطبيع. المقارنة
 * تتجاهل المسافات (فتطابق «انشاء الله» مع «إن شاء الله»)، وتجرّب الصيغة
 * المعيارية والصيغة الفضفاضة للهمزة، ولا تخلط بينهما.
 *
 * إجابة فارغة أو مسافات فقط تُرفض دائمًا.
 */
export function matches(answer: string, correct: string, accept?: string[]): boolean {
  const answerCanonical = compact(normalize(answer))
  if (answerCanonical.length === 0) return false
  const answerLoose = compact(normalizeLoose(answer))

  const targets = [correct, ...(Array.isArray(accept) ? accept : [])]
  for (const target of targets) {
    const targetCanonical = compact(normalize(target))
    if (targetCanonical.length === 0) continue
    if (answerCanonical === targetCanonical) return true
    if (answerLoose.length > 0 && answerLoose === compact(normalizeLoose(target))) return true
  }
  return false
}
