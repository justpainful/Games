import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing } from '../typing.ts'

type Row = { question: string; answer: string; accept?: string[] }

/** التحميل مؤجّل إلى أول جولة — انظر التعليق نفسه في «جمع». */
let deal: (() => Row) | undefined
function next(): Row {
  deal ??= dealer(loadData<Row>(import.meta.url, 'data.json'))
  return deal()
}

export default defineGame({
  key: 'maarifa',
  name: 'معرفه',
  aliases: ['معرفة'],
  tagline: 'أسئلة عامة، وأسرع من يعرف',
  howTo:
    'في كل جولة يظهر سؤال معرفة عامة، واكتب إجابتك في الشات. ' +
    'أول إجابة صحيحة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play: typing({
    rounds: 10,
    roundMs: 25_000,
    pick: () => {
      const row = next()
      return {
        prompt: row.question,
        answer: row.answer,
        // الصياغات البديلة تأتي من ملف البيانات، وغيابها ليس خطأ.
        ...(Array.isArray(row.accept) && row.accept.length > 0 ? { accept: row.accept } : {}),
      }
    },
  }),
})
