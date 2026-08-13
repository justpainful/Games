import { letterFace } from '../../design/faces.ts'
import type { Scene } from '../../scenes/scene.ts'
import type { ChatInput, GameResult, Table } from '../define.ts'
import { defineGame, zeroScores } from '../define.ts'
import { pickOne, shuffle } from '../phases.ts'
import { finish } from '../typing.ts'

/**
 * «حروف» لا تركب `typing()` لسبب واحد: لا توجد إجابة صحيحة واحدة تُقارن بها.
 * الشرط قاعدة لا نص — كلمة عربية تبدأ بحرف بعينه وطولها ثلاثة حروف فأكثر —
 * فالتحقق هنا دالة، والكشف عند فوات الوقت لا يكشف شيئًا لأن لا شيء مخبّأ.
 */

/**
 * حروف البداية. مستبعد منها ما لا تبدأ به كلمة عربية عمليًا: الهمزات على
 * كراسيها (ؤ، ئ، ء)، والتاء المربوطة، والألف المقصورة.
 */
const LETTERS: readonly string[] = [
  'ا',
  'ب',
  'ت',
  'ث',
  'ج',
  'ح',
  'خ',
  'د',
  'ذ',
  'ر',
  'ز',
  'س',
  'ش',
  'ص',
  'ض',
  'ط',
  'ظ',
  'ع',
  'غ',
  'ف',
  'ق',
  'ك',
  'ل',
  'م',
  'ن',
  'ه',
  'و',
  'ي',
]

const ROUNDS = 8
const ROUND_MS = 20_000
const BREATH_MS = 2_500
/** كم حرفًا يُعرض في الصف — الحرف المطلوب واحد منها */
const SHOWN = 6
const MIN_LENGTH = 3

/**
 * ضجيج يُحذف قبل أي فحص. المحارف مكتوبة بصيغة الهروب على نهج `src/arabic.ts`،
 * فكتابتها كمحارف حقيقية تجعل السطر غير قابل للمراجعة.
 */
/** التشكيل والألف الخنجرية وعلامات المصاحف. */
const MARKS = /[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED]/g

/** التطويل والمحارف غير المرئية التي تلتصق بالنسخ واللصق. */
const HIDDEN = /[\u00AD\u061C\u0640\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g

/** حروف عربية فقط: من الهمزة إلى الغين، ومن الفاء إلى الياء، وألف الوصل. */
const ARABIC_ONLY = /^[ء-غف-يٱ]+$/

/**
 * توحيد خفيف يخص أول الكلمة. لا نستعمل `arabic.normalize` هنا لأنه يقتطع
 * «ال» التعريف، فتصير «الشمس» كلمةً تبدأ بالشين ويسقط أول حرف من الشرط.
 */
function unify(letter: string): string {
  switch (letter) {
    case 'أ':
    case 'إ':
    case 'آ':
    case 'ٱ':
      return 'ا'
    case 'ة':
      return 'ه'
    case 'ى':
      return 'ي'
    default:
      return letter
  }
}

function clean(text: string): string {
  return text.normalize('NFKC').replace(MARKS, '').replace(HIDDEN, '').trim()
}

/**
 * هل تصلح إجابة اللاعب؟
 *
 * لا قاموس في المشروع، فالتحقق بنيوي: كلمة واحدة، حروفها عربية، طولها ثلاثة
 * فأكثر، وتبدأ بالحرف المطلوب. وشرط أخير يقطع أرخص حيلة: «ششش» تستوفي كل ما
 * سبق، فنطلب حرفين مختلفين على الأقل.
 *
 * فائدة جانبية مقصودة: ما يمرّ من هذا الفحص حروف عربية خالصة لا غير، فلا
 * منشن ولا تنسيق يتسرّب إلى رسالة الإعلان حين نردّد كلمة اللاعب.
 */
function accepts(text: string, letter: string): boolean {
  const word = clean(text)
  if (!ARABIC_ONLY.test(word)) return false

  const chars = [...word]
  if (chars.length < MIN_LENGTH) return false

  const first = chars[0]
  if (first === undefined || unify(first) !== unify(letter)) return false

  return new Set(chars.map(unify)).size >= 2
}

async function play(table: Table): Promise<GameResult> {
  const scores = zeroScores(table.players)

  for (let round = 1; round <= ROUNDS; round++) {
    if (table.aborted) break

    const row = shuffle(LETTERS).slice(0, SHOWN)
    // `pickOne` تُرجع undefined للمصفوفة الفارغة وحدها، و`row` ليست فارغة أبدًا.
    const target = pickOne(row) ?? 'ب'

    const scene: Scene = {
      kind: 'round',
      game: table.brief,
      prompt: row.join(' '),
      hint: `اكتب كلمة تبدأ بحرف ${target} وطولها ثلاثة حروف فأكثر`,
      index: round,
      total: ROUNDS,
    }

    const at = Math.floor(Date.now() / 1000) + Math.round(ROUND_MS / 1000)
    await table.show(scene, {
      // حرف الجولة هو الشرط كلّه، فيسبق نصَّه وجهُه المرسوم بخط المشروع. وهو
      // يبقى في النص أيضًا لأن اللاعب يكتب كلمة تبدأ به فيحتاجه مقروءًا منسوخًا.
      text:
        `${letterFace(target) ?? ''} **الجولة ${round}/${ROUNDS}** · ` +
        `كلمة تبدأ بحرف **${target}**. ينتهي <t:${at}:R>`,
    })

    const hit: ChatInput | null = await table.waitChat(ROUND_MS, (input) => {
      if (!scores.has(input.userId)) return false
      return accepts(input.text, target)
    })

    if (table.aborted) break

    if (hit) {
      scores.set(hit.userId, (scores.get(hit.userId) ?? 0) + 1)
      await table.say(`<@${hit.userId}> سبق الجميع بـ **${clean(hit.text)}**`)
    } else {
      await table.say(`انتهى الوقت. ما كتب أحد كلمة تبدأ بحرف **${target}**`)
    }

    if (round < ROUNDS) await table.sleep(BREATH_MS)
  }

  return finish(table, scores)
}

export default defineGame({
  key: 'huroof',
  mode: 'game',
  name: 'حروف',
  tagline: 'صف حروف، وكلمة تبدأ بواحد منها',
  howTo:
    'في كل جولة يظهر صف من الحروف، ويُطلب منك حرف واحد منها. ' +
    'اكتب في الشات كلمة عربية تبدأ بذلك الحرف وطولها ثلاثة حروف فأكثر. ' +
    'أول كلمة مقبولة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play,
})
