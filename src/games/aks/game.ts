import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing } from '../typing.ts'

/**
 * `accept` بدائل الضدّ الصحيحة.
 *
 * الملف يحمل الزوج في اتجاهيه: «كبير ← صغير» و«صغير ← كبير». وبعض الكلمات لها
 * ضدّان مقبولان — «بارد» ضدّها «حار» وضدّها «دافئ» — فالقلب يجعل الاثنين
 * إجابتين صحيحتين للسؤال نفسه. وبلا هذا الحقل يُخطَّأ من كتب الثاني، وهو
 * أسوأ ما يقع في لعبة لغة: أن تقول للاعب «خطأ» وهو مصيب.
 */
type Pair = { word: string; opposite: string; accept?: string[] }

/** التحميل مؤجّل إلى أول جولة — انظر التعليق نفسه في «جمع». */
let deal: (() => Pair) | undefined
function next(): Pair {
  deal ??= dealer(loadData<Pair>(import.meta.url, 'words.json'))
  return deal()
}

export default defineGame({
  key: 'aks',
  mode: 'game',
  name: 'عكس',
  tagline: 'كلمة تظهر، وضدّها يفوز',
  howTo:
    'في كل جولة تظهر كلمة، واكتب عكسها في الشات. ' +
    'أول إجابة صحيحة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play: typing({
    rounds: 10,
    roundMs: 18_000,
    pick: () => {
      const pair = next()
      return {
        prompt: pair.word,
        answer: pair.opposite,
        ...(pair.accept ? { accept: pair.accept } : {}),
        hint: 'اكتب عكس هذه الكلمة',
      }
    },
  }),
})
