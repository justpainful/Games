import { pointsOf } from '../players/points.ts'
import { on } from '../settings/flags.ts'
import type { PanelScene } from '../scenes/scene.ts'
import type { Command } from './commands.ts'

/**
 * إحصائيات اللاعب.
 *
 * لا جدول جديد ولا عدّاد جديد: الأرقام كلها في صفّ اللاعب أصلًا (لعبات، فوز،
 * ثلاث محافظ)، وما كان ينقص هو عرضها. ولذلك هذي أول ما نُفّذ من الاقتراح
 * وأقلّه خطرًا: تقول ما وقع، ولا تغيّر شيئًا مما سيقع.
 *
 * ونسبة الفوز تُحسب ولا تُخزَّن: تخزينها يعني رقمًا يتقادم مع كل جولة، وحسابها
 * سطر واحد.
 */
export const statsCommand: Command = {
  name: 'احصائياتي',
  aliases: ['إحصائياتي', 'stats'],
  description: 'يعرض أرقامك: كم لعبت وكم فزت وأين نقاطك',
  async run(ctx) {
    if (!on('stats')) {
      await ctx.say('الإحصائيات مقفلة حاليًا.')
      return
    }

    const p = await pointsOf(ctx.guildId, ctx.member.id)
    // القسمة على صفر تُخرج NaN، ولاعب جديد يقرأها قبل أن يلعب جولة واحدة
    const rate = p.gamesPlayed > 0 ? Math.round((p.wins / p.gamesPlayed) * 100) : 0

    const scene: PanelScene = {
      kind: 'panel',
      title: `أرقام ${ctx.member.displayName}`,
      subtitle: p.gamesPlayed > 0 ? `${p.gamesPlayed} لعبة · ${p.wins} فوز` : 'ما لعبت جولة بعد',
      items: [
        { label: 'المجموع', value: `${p.total} نقطة`, on: p.total > 0 },
        { label: 'نسبة الفوز', value: `${rate}%`, on: rate >= 50 },
        { label: 'فردي', value: String(p.solo) },
        { label: 'فرق', value: String(p.team) },
        { label: 'روليت', value: String(p.roulette) },
      ],
      footer: 'الأرقام تتحدّث مع كل جولة تنتهي',
    }

    await ctx.scene(scene, `**أرقامك** · ${p.total} نقطة من ${p.gamesPlayed} لعبة`)
  },
}
