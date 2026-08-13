import { EMOJI } from './emoji.ts'
import { ARABIC } from './letters.ts'

/**
 * البحث عن إيموجي باسم يُركَّب وقت التشغيل.
 *
 * `emoji.ts` ملف مولَّد بمفاتيح ثابتة، فـ`EMOJI.num_7` تُفحص عند الترجمة وهذا
 * هو المطلوب. لكن رقم الخانة وحرف الجولة ومفتاح اللعبة لا تُعرف إلا وقت
 * التشغيل، فتحتاج بابًا ثانيًا. وهذا الملف هو الباب، ووظيفته أن يبقى ضيّقًا:
 * كل دالة هنا تعرف مجالها وتردّ `undefined` خارجه بدل أن تُخرج نصًّا مكسورًا.
 *
 * والإيموجي الغائب يظهر عند ديسكورد مربّعًا فارغًا لا خطأً، فالسكوت عن الغياب
 * أسوأ من عدم وضع إيموجي أصلًا. لذلك ترجع `undefined` ويحذف المستدعي الحقل.
 */
const ALL = EMOJI as Record<string, string | undefined>

/** أقصى ما يعطيه ديسكورد من أزرار في رسالة، وهو سقف كل ترقيم في البوت. */
export const MAX_NUMBERED = 25

/** رقم محايد على شكل حبري. */
export function numberFace(n: number): string | undefined {
  return n >= 0 && n <= MAX_NUMBERED ? ALL[`num_${n}`] : undefined
}

/** الرقم نفسه أصفر — «هذا اختيارك» بلا كلمة زائدة في الزر. */
export function pickFace(n: number): string | undefined {
  return n >= 1 && n <= MAX_NUMBERED ? ALL[`pick_${n}`] : undefined
}

/** وجه اللعبة من مفتاحها كما في `games/all.ts`. */
export function gameFace(key: string): string | undefined {
  return ALL[`game_${key}`]
}

/** وجه النرد بنقاطه — يُقرأ بلمحة حيث لا يُقرأ الرقم. */
export function diceFace(n: number): string | undefined {
  return n >= 1 && n <= 6 ? ALL[`dice_${n}`] : undefined
}

/** فرق حتى أربعة: اللون يفرقها والحرف يفرقها عند عمى الألوان. */
export function teamFace(index: number): string | undefined {
  return ALL[`team_${['a', 'b', 'c', 'd'][index] ?? ''}`]
}

/** فرق النقاط الموجب. غير المتاح يعود `undefined` فلا يُخترع رقم قريب. */
export function plusFace(n: number): string | undefined {
  return ALL[`plus_${n}`]
}

const BY_LETTER = new Map(ARABIC.map(([slug, ch]) => [ch, slug]))

/** وجه حرف عربي. الهمزات وما لا يبدأ به اسم في الجدول تعود `undefined`. */
export function letterFace(ch: string): string | undefined {
  const slug = BY_LETTER.get(ch)
  return slug ? ALL[`ar_${slug}`] : undefined
}
