import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing } from '../typing.ts'

type Row = { country: string; emoji: string; code: string }

/** التحميل مؤجّل إلى أول جولة — انظر التعليق نفسه في «جمع». */
let deal: (() => Row) | undefined
function next(): Row {
  deal ??= dealer(loadData<Row>(import.meta.url, 'data.json'))
  return deal()
}

export default defineGame({
  key: 'aalam',
  mode: 'game',
  name: 'اعلام',
  aliases: ['أعلام'],
  tagline: 'علم يرفرف، ودولة تُعرف',
  howTo:
    'في كل جولة يظهر علم دولة، واكتب اسم الدولة في الشات. ' +
    'أول إجابة صحيحة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play: typing({
    rounds: 10,
    roundMs: 20_000,
    pick: () => {
      const row = next()
      return {
        prompt: row.emoji,
        answer: row.country,
        // رمز الآيزو مقبول أيضًا: من يعرف العلم بالرمز يعرف الدولة، ورفضه عناد.
        accept: [row.code],
        hint: 'اكتب اسم الدولة صاحبة هذا العلم',
      }
    },
  }),
})
