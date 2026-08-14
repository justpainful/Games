import { defineGame } from '../define.ts'
import { typing , TYPING_KNOBS } from '../typing.ts'

/**
 * لا ملف بيانات: المسائل تُولّد. قائمة ثابتة من الأسئلة الحسابية تُحفظ بعد
 * جلستين وتفقد معناها، والتوليد يعطي عمرًا لا نهائيًا بلا صيانة.
 *
 * ملاحظة اتجاه: المسألة تُقرأ من اليمين مثل بقية المشهد. الطرح دائمًا موجب
 * (الأكبر أولًا)، فمن قرأها معكوسة يخرج بناتج سالب ويعرف فورًا أنه عكسها —
 * وهذا أرخص من حشو النص بمحارف اتجاه غير مرئية.
 */

type Problem = { prompt: string; answer: number }

function rnd(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/**
 * ستة أنواع بأوزان متعمّدة: الجمع والطرح ثلثا المسائل لأنهما يبقيان الإيقاع
 * سريعًا، والضرب الكبير نوع واحد فقط كي لا تتحوّل اللعبة إلى ورقة امتحان.
 */
function make(): Problem {
  switch (rnd(1, 6)) {
    case 1:
    case 2: {
      const a = rnd(13, 99)
      const b = rnd(13, 99)
      return { prompt: `${a} + ${b}`, answer: a + b }
    }
    case 3:
    case 4: {
      const a = rnd(35, 99)
      const b = rnd(11, a - 10)
      return { prompt: `${a} - ${b}`, answer: a - b }
    }
    case 5: {
      const a = rnd(3, 12)
      const b = rnd(3, 12)
      return { prompt: `${a} × ${b}`, answer: a * b }
    }
    default: {
      const a = rnd(11, 25)
      const b = rnd(4, 9)
      return { prompt: `${a} × ${b}`, answer: a * b }
    }
  }
}

/**
 * `dealer()` يمنع التكرار حين تكون العناصر معدودة؛ هنا هي مولّدة، فالبديل
 * المكافئ ذاكرة قصيرة بآخر ما عُرض. عشرون كافية لجولات لعبة كاملة وأكثر.
 */
const RECENT_LIMIT = 20
const recent: string[] = []

function next(): Problem {
  for (let attempt = 0; attempt < 12; attempt++) {
    const problem = make()
    if (recent.includes(problem.prompt)) continue
    recent.push(problem.prompt)
    if (recent.length > RECENT_LIMIT) recent.shift()
    return problem
  }
  return make()
}

export default defineGame({
  key: 'arqam',
  mode: 'game',
  name: 'ارقام',
  aliases: ['أرقام'],
  tagline: 'مسألة تظهر، وأول ناتج صحيح يفوز',
  howTo:
    'في كل جولة تظهر مسألة حسابية جديدة، واكتب ناتجها في الشات. ' +
    'الأرقام العربية والهندية كلاهما مقبول، وأول إجابة صحيحة تأخذ النقطة.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  tunables: TYPING_KNOBS,
  play: typing({
    rounds: 10,
    roundMs: 15_000,
    pick: () => {
      const problem = next()
      return { prompt: problem.prompt, answer: String(problem.answer), hint: 'اكتب الناتج' }
    },
  }),
})
