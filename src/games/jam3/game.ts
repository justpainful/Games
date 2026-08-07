import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing } from '../typing.ts'

type Pair = { singular: string; plural: string }

/**
 * التحميل مؤجّل إلى أول جولة لا إلى لحظة اكتشاف اللعبة: ملف الكلمات لا يُقرأ
 * إن لم تُلعب اللعبة، ولا يسقط البوت كله لو تأخّر الملف عن الوصول.
 */
let deal: (() => Pair) | undefined
function next(): Pair {
  deal ??= dealer(loadData<Pair>(import.meta.url, 'words.json'))
  return deal()
}

export default defineGame({
  key: 'jam3',
  name: 'جمع',
  tagline: 'المفرد أمامك، والجمع عليك',
  howTo:
    'في كل جولة تظهر كلمة مفردة، واكتب جمعها في الشات. ' +
    'أول إجابة صحيحة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play: typing({
    rounds: 10,
    roundMs: 20_000,
    pick: () => {
      const pair = next()
      return { prompt: pair.singular, answer: pair.plural, hint: 'اكتب جمع هذه الكلمة' }
    },
  }),
})
