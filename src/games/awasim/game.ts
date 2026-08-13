import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing } from '../typing.ts'

type Row = { country: string; capital: string }

/** التحميل مؤجّل إلى أول جولة — انظر التعليق نفسه في «جمع». */
let deal: (() => Row) | undefined
function next(): Row {
  deal ??= dealer(loadData<Row>(import.meta.url, 'data.json'))
  return deal()
}

export default defineGame({
  key: 'awasim',
  mode: 'game',
  name: 'عواصم',
  tagline: 'دولة تظهر، وعاصمتها تُكتب',
  howTo:
    'في كل جولة يظهر اسم دولة، واكتب عاصمتها في الشات. ' +
    'أول إجابة صحيحة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play: typing({
    rounds: 10,
    roundMs: 20_000,
    pick: () => {
      const row = next()
      return { prompt: row.country, answer: row.capital, hint: 'اكتب عاصمة هذه الدولة' }
    },
  }),
})
