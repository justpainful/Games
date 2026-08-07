import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { shuffle } from '../phases.ts'
import { typing } from '../typing.ts'

type Entry = { word: string }

/**
 * البيانات مستعارة من «فكك»: نفس قائمة الكلمات تخدم اللعبتين في اتجاهين
 * متعاكسين، ونسخة ثانية منها تعني ملفين يتباعدان مع الوقت.
 */
let deal: (() => Entry) | undefined
function next(): Entry {
  deal ??= dealer(loadData<Entry>(import.meta.url, '../fakek/words.json'))
  return deal()
}

/**
 * يخلط حروف الكلمة ويضمن أن المعروض يخالف الأصل — خلطة تُعيد الترتيب نفسه
 * تجعل الجولة هبة مجانية. المحاولات محدودة كي لا ندور بلا نهاية على كلمة
 * كل حروفها متطابقة، وعندها نقلبها ونمضي.
 */
function scramble(word: string): string {
  const letters = [...word]
  if (letters.length < 2) return letters.join(' ')

  for (let attempt = 0; attempt < 12; attempt++) {
    const mixed = shuffle(letters)
    if (mixed.join('') !== word) return mixed.join(' ')
  }
  return [...letters].reverse().join(' ')
}

export default defineGame({
  key: 'rakeb',
  name: 'ركب',
  tagline: 'حروف مبعثرة تنتظر من يجمعها',
  howTo:
    'في كل جولة تظهر حروف كلمة مبعثرة، ورتّبها واكتب الكلمة في الشات. ' +
    'أول إجابة صحيحة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play: typing({
    rounds: 8,
    roundMs: 30_000,
    pick: () => {
      const word = next().word
      return {
        prompt: scramble(word),
        answer: word,
        hint: `رتّب الحروف واكتب الكلمة — عدد حروفها ${[...word].length}`,
      }
    },
  }),
})
