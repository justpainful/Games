import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing , TYPING_KNOBS } from '../typing.ts'

/** `accept` مفردات أخرى صحيحة للجمع نفسه: «بنات» مفردها بنت وابنة. */
type Pair = { singular: string; plural: string; accept?: string[] }

/** التحميل مؤجّل إلى أول جولة — انظر التعليق نفسه في «جمع». */
let deal: (() => Pair) | undefined
function next(): Pair {
  deal ??= dealer(loadData<Pair>(import.meta.url, 'words.json'))
  return deal()
}

export default defineGame({
  key: 'mufrad',
  mode: 'game',
  name: 'مفرد',
  tagline: 'الجمع أمامك، ردّه إلى أصله',
  howTo:
    'في كل جولة يظهر جمع، واكتب مفرده في الشات. ' +
    'أول إجابة صحيحة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  tunables: TYPING_KNOBS,
  play: typing({
    rounds: 10,
    roundMs: 20_000,
    pick: () => {
      const pair = next()
      return {
        prompt: pair.plural,
        answer: pair.singular,
        ...(pair.accept ? { accept: pair.accept } : {}),
        hint: 'اكتب مفرد هذه الكلمة',
      }
    },
  }),
})
