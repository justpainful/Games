import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing } from '../typing.ts'

/**
 * القائمة صارت ملفًا بعد أن كانت في هذا المصدر.
 *
 * كان سطرها: «ليست معرفة تُصحّح ولا تُوسّع، فمكانها الكود». وقد وُسّعت: تسعة
 * وستون نصًّا تعني أن اللاعب يرى النص نفسه مرتين في ليلة واحدة، وثمانمئة نصّ
 * داخل ملف مصدر تُغرق اللعبة في بياناتها. فنزلت إلى `words.json` كبقية الألعاب.
 *
 * ومعيار الاختيار لم يتغيّر: لا شيء قصير. النص القصير يكتبه الجميع في اللحظة
 * نفسها فتصير الجولة قرعة على تأخير الشبكة لا سباق أصابع. والعبارات المركّبة
 * («كل عام وأنتم بخير») هي أصعب ما في القائمة، لأن المسافة والهمزة هما ما
 * يفرّق السريع من الأسرع.
 */
let deal: (() => string) | undefined
function next(): string {
  deal ??= dealer(loadData<string>(import.meta.url, 'words.json'))
  return deal()
}

export default defineGame({
  key: 'asraa',
  mode: 'game',
  name: 'اسرع',
  aliases: ['أسرع'],
  tagline: 'لا معرفة ولا تفكير — أصابع فقط',
  howTo:
    'في كل جولة يظهر نص، وانسخه بالكتابة في الشات كما هو. ' +
    'لا سؤال ولا حلّ، أول من يكتبه صحيحًا يأخذ النقطة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play: typing({
    rounds: 10,
    roundMs: 12_000,
    pick: () => {
      const word = next()
      return { prompt: word, answer: word, hint: 'اكتب النص كما هو' }
    },
  }),
})
