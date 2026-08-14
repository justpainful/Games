import type { GameDef, Tunable } from './define.ts'
import type { GuildConfig } from '../guilds/config.ts'

/**
 * مقابض اللعبة: ما يضبطه صاحب السيرفر فيغيّر اللعب فعلًا.
 *
 * ————————————————— لماذا تُعلَن ولا تُخترع —————————————————
 *
 * كان في قاعدة البيانات عمود `GameConfig.settings` مفتوح على أي JSON، وكان
 * الداشبورد يكتب فيه أي حقل يُرسل إليه. والقيمة تُحفظ فعلًا، **ولا لعبة واحدة
 * تقرأها**. فالنتيجة مقبض يدور بلا أن يوصل بشيء: يُضبط، ويُعرض مضبوطًا، ولا
 * يتغيّر شيء في اللعب أبدًا. وذلك أسوأ من غياب المقبض، لأن الأول يُبحث عن
 * سببه في اللعبة بينما العطل في الأساس.
 *
 * فالمقبض هنا يبدأ من تعريف اللعبة: تعلن ما تقبله باسمه ونوعه وحدّيه، ويُعرض
 * ما أُعلن وحده، وتُقرأ القيمة من نفس التعريف الذي أعلنها. ولا يُعرض للسيرفر
 * مقبضٌ لا يقرؤه أحد.
 *
 * ————————————————— لماذا يُحصر المدى هنا —————————————————
 *
 * القيمة تأتي من جهاز خارج الخادم، وقد تكون قديمة من قبل تضييق المدى. فقراءتها
 * كما هي تعني جولة مدتها ساعة أو مئة جولة تحتجز القناة. والحصر عند القراءة لا
 * عند الكتابة وحدها: ما في القاعدة اليوم كُتب قبل هذا الملف.
 */

export function tunablesOf(game: GameDef): readonly Tunable[] {
  return game.tunables ?? []
}

/** القيمة المحفوظة لهذه اللعبة في هذا السيرفر، محصورة في مداها. */
export function tuneValue(
  game: GameDef,
  saved: Record<string, unknown> | undefined,
  key: string,
): number {
  const knob = tunablesOf(game).find((one) => one.key === key)
  if (!knob) return 0

  const raw = saved?.[key]
  const asNumber = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(asNumber)) return knob.fallback
  return Math.min(knob.max, Math.max(knob.min, Math.round(asNumber)))
}

function savedFor(config: GuildConfig | undefined, gameKey: string): Record<string, unknown> {
  const stored = config?.games.get(gameKey)?.settings
  if (typeof stored !== 'object' || stored === null || Array.isArray(stored)) return {}
  return stored as Record<string, unknown>
}

/** القارئ الذي يُمرَّر إلى الطاولة — يغلق على السيرفر واللعبة معًا. */
export function tunerFor(game: GameDef, config: GuildConfig | undefined): (key: string) => number {
  const saved = savedFor(config, game.key)
  return (key) => tuneValue(game, saved, key)
}

/** ما يُعرض في التطبيق: المقبض وقيمته الحالية. */
export function tuningView(
  game: GameDef,
  config: GuildConfig | undefined,
): { key: string; name: string; about: string; min: number; max: number; unit: string; value: number }[] {
  const saved = savedFor(config, game.key)
  return tunablesOf(game).map((knob) => ({
    key: knob.key,
    name: knob.name,
    about: knob.about,
    min: knob.min,
    max: knob.max,
    unit: knob.unit,
    value: tuneValue(game, saved, knob.key),
  }))
}
