import { dealer, loadData } from '../data.ts'
import { defineGame } from '../define.ts'
import { typing, type Question } from '../typing.ts'

/**
 * ايفنت — مسابقة مطوّلة تخلط أسئلة كل ألعاب المعرفة في جولة واحدة.
 *
 * تقرأ بيانات الألعاب الأخرى بدل تكرارها: ملف واحد يتغيّر ينعكس هنا تلقائيًا،
 * ولا يوجد ملف بيانات ثالث يتعفّن.
 */

type Trivia = { question: string; answer: string; accept?: string[] }
type Capital = { country: string; capital: string }
type Continent = { country: string; continent: string }
type Flag = { country: string; emoji: string; code: string }

type Source = () => Question

let sources: Source[] | undefined

function build(): Source[] {
  const trivia = dealer(loadData<Trivia>(import.meta.url, '../maarifa/data.json'))
  const capitals = dealer(loadData<Capital>(import.meta.url, '../awasim/data.json'))
  const continents = dealer(loadData<Continent>(import.meta.url, '../qara/data.json'))
  const flags = dealer(loadData<Flag>(import.meta.url, '../aalam/data.json'))

  return [
    () => {
      const t = trivia()
      return { prompt: t.question, answer: t.answer, ...(t.accept ? { accept: t.accept } : {}) }
    },
    () => {
      const c = capitals()
      return { prompt: `ما عاصمة ${c.country}؟`, answer: c.capital, hint: 'عواصم' }
    },
    () => {
      const c = continents()
      return { prompt: `في أي قارة تقع ${c.country}؟`, answer: c.continent, hint: 'قارات' }
    },
    () => {
      const f = flags()
      return { prompt: f.emoji, answer: f.country, hint: 'ما اسم هذه الدولة؟' }
    },
  ]
}

export default defineGame({
  key: 'event',
  name: 'ايفنت',
  aliases: ['إيفنت'],
  tagline: 'مسابقة كبيرة تخلط كل أنواع الأسئلة',
  howTo:
    'مسابقة طويلة تجمع أسئلة المعرفة والعواصم والقارات والأعلام في جولة واحدة. ' +
    'اكتب إجابتك في الشات، وأول من يجيب صحيحًا يأخذ نقطة الجولة. ' +
    'من يجمع أكثر النقاط في نهاية الإيفنت هو البطل.',
  players: { min: 2, max: 30 },
  wallet: 'team',
  play: typing({
    rounds: 20,
    roundMs: 25_000,
    pick: () => {
      sources ??= build()
      // النوع يُختار عشوائيًا كل جولة فلا يمل اللاعبون من نمط واحد
      return sources[Math.floor(Math.random() * sources.length)]!()
    },
  }),
})
