import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing , TYPING_KNOBS } from '../typing.ts'

type Row = { country: string; continent: string }

/** التحميل مؤجّل إلى أول جولة — انظر التعليق نفسه في «جمع». */
let deal: (() => Row) | undefined
function next(): Row {
  deal ??= dealer(loadData<Row>(import.meta.url, 'data.json'))
  return deal()
}

export default defineGame({
  key: 'qara',
  mode: 'game',
  name: 'قارة',
  aliases: ['قاره'],
  tagline: 'دولة تظهر، وقارتها تُكتب',
  howTo:
    'في كل جولة يظهر اسم دولة، واكتب القارة التي تقع فيها. ' +
    'الجولة قصيرة لأن الخيارات قليلة، وأول إجابة صحيحة تأخذ النقطة.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  tunables: TYPING_KNOBS,
  play: typing({
    rounds: 10,
    roundMs: 15_000,
    pick: () => {
      const row = next()
      return { prompt: row.country, answer: row.continent, hint: 'اكتب قارة هذه الدولة' }
    },
  }),
})
