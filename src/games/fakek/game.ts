import { matches } from '../../arabic.ts'
import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing , TYPING_KNOBS } from '../typing.ts'

type Entry = { word: string }

/** التحميل مؤجّل إلى أول جولة — انظر التعليق نفسه في «جمع». */
let deal: (() => Entry) | undefined
function next(): Entry {
  deal ??= dealer(loadData<Entry>(import.meta.url, 'words.json'))
  return deal()
}

/** تشكيل وتطويل يلتصق بالنسخ — يُحذف قبل قياس طول الحرف. */
const MARKS = /[ؐ-ًؚ-ٰٟۖ-ۭـ]/g

/**
 * التدقيق هنا **لا** يمكن أن يكون `matches` الافتراضية.
 *
 * `arabic.matches` تُسقط المسافات كليًا، والكلمة معروضة على الشاشة — فمن ينسخها
 * كما هي «مدرسة» يفوز بلا أن يفكّك شيئًا، وتسقط اللعبة من أساسها.
 *
 * لذلك الشرط بنيوي: **كل** رمز بين المسافات حرف واحد، وعددها أكثر من واحد،
 * ومجموعها يطابق الكلمة. هذا يقبل المسافات الزائدة ويرفض النسخ الملتصق.
 */
function splitCorrectly(raw: string, word: string): boolean {
  const tokens = raw
    .normalize('NFKC')
    .trim()
    .split(/\s+/)
    .map((t) => t.replace(MARKS, ''))
    .filter((t) => t.length > 0)

  if (tokens.length < 2) return false
  if (tokens.some((t) => [...t].length !== 1)) return false
  return matches(tokens.join(''), word)
}

export default defineGame({
  key: 'fakek',
  mode: 'game',
  name: 'فكك',
  tagline: 'كلمة واحدة، حرفًا حرفًا',
  howTo:
    'في كل جولة تظهر كلمة، واكتبها في الشات حروفًا مفصولة بمسافات مثل: م د ر س ة. ' +
    'أول من يفكّها صحيحة يأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  tunables: TYPING_KNOBS,
  play: typing({
    rounds: 8,
    roundMs: 30_000,
    pick: () => {
      const word = next().word
      return {
        prompt: word,
        answer: [...word].join(' '),
        hint: 'اكتب حروف الكلمة مفصولة بمسافات',
      }
    },
    // المقارنة مع الكلمة الملتصقة لا مع صيغة العرض المفكّكة: `normalize` يقتطع
    // «ال» من الكلمة الواحدة ولا يقتطعها من حروف مفرّقة، فتختلف «الشمس» عن
    // «ا ل ش م س» لو قورنتا كما هما.
    check: (raw, q) => splitCorrectly(raw, q.answer.replace(/\s+/g, '')),
  }),
})
