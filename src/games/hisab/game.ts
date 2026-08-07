import { defineGame } from '../define.ts'
import { typing, type Question } from '../typing.ts'

/**
 * حساب — أكمل المتتابعة.
 *
 * تختلف عن «ارقام» عمدًا: تلك مسألة حسابية مباشرة، وهذه استنتاج قاعدة من
 * أرقام معروضة. لو كانتا كلتاهما جمعًا وطرحًا لصارتا لعبة واحدة باسمين.
 */

type Kind = 'arith' | 'geom' | 'square' | 'fib' | 'alt'

const KINDS: Kind[] = ['arith', 'arith', 'geom', 'square', 'fib', 'alt']

function randInt(min: number, max: number): number {
  return min + Math.floor(Math.random() * (max - min + 1))
}

/** يبني متتابعة من خمسة حدود ظاهرة والسادس هو المطلوب. */
function build(kind: Kind): { terms: number[]; answer: number; rule: string } {
  switch (kind) {
    case 'arith': {
      const start = randInt(1, 20)
      const step = randInt(2, 12)
      const terms = Array.from({ length: 5 }, (_, i) => start + step * i)
      return { terms, answer: start + step * 5, rule: `نضيف ${step} كل مرة` }
    }
    case 'geom': {
      const start = randInt(1, 5)
      const ratio = randInt(2, 3)
      const terms = Array.from({ length: 5 }, (_, i) => start * ratio ** i)
      return { terms, answer: start * ratio ** 5, rule: `نضرب في ${ratio} كل مرة` }
    }
    case 'square': {
      const from = randInt(1, 6)
      const terms = Array.from({ length: 5 }, (_, i) => (from + i) ** 2)
      return { terms, answer: (from + 5) ** 2, rule: 'مربعات أعداد متتالية' }
    }
    case 'fib': {
      let a = randInt(1, 6)
      let b = a + randInt(1, 5)
      const terms = [a, b]
      while (terms.length < 5) {
        const nxt = a + b
        terms.push(nxt)
        a = b
        b = nxt
      }
      return { terms, answer: a + b, rule: 'كل حد مجموع الحدين قبله' }
    }
    case 'alt': {
      // متتابعتان متداخلتان: الفردي يزيد، والزوجي ينقص
      const up = randInt(2, 9)
      const down = randInt(2, 9)
      const base = randInt(30, 60)
      const terms = [base, base + 40, base + up, base + 40 - down, base + up * 2]
      return { terms, answer: base + 40 - down * 2, rule: 'متتابعتان متداخلتان' }
    }
  }
}

function pick(): Question {
  const kind = KINDS[Math.floor(Math.random() * KINDS.length)]!
  const { terms, answer } = build(kind)

  /*
   * الفاصل «،» والأرقام كلها من فئة اتجاهية ضعيفة، فترتيبها داخل مشهد RTL
   * يتبع القراءة من اليمين — وهو المطلوب للقارئ العربي. الاعتماد على مسافة
   * مجرّدة كان يترك الترتيب رهن ما حول النص.
   */
  return {
    prompt: `${terms.join('، ')}، ؟`,
    answer: String(answer),
    hint: 'ما الرقم التالي في المتتابعة؟',
  }
}

export default defineGame({
  key: 'hisab',
  name: 'حساب',
  aliases: ['متتابعة'],
  tagline: 'أكمل المتتابعة قبل الجميع',
  howTo:
    'في كل جولة تظهر متتابعة أرقام ينقصها الحد الأخير. اكتشف القاعدة واكتب الرقم التالي في الشات. ' +
    'أول إجابة صحيحة تأخذ نقطة الجولة، ومن يجمع أكثر النقاط يفوز.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play: typing({
    rounds: 10,
    roundMs: 25_000,
    pick,
  }),
})
