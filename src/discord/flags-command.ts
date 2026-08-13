import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, type Message } from 'discord.js'
import { EMOJI } from '../design/emoji.ts'
import { FLAGS, all, on, toggle, type Flag } from '../settings/flags.ts'
import type { PanelScene } from '../scenes/scene.ts'
import type { Command } from './commands.ts'
import { editScene, sendScene } from './reply.ts'

/**
 * لوحة مفاتيح الميزات.
 *
 * ————————————————— لماذا هذي قبل أي ميزة —————————————————
 *
 * الميزات المطلوبة (حماية، إنعاش، منع قنبلة) تغيّر نتيجة الجولة، والنتيجة هي
 * كل ما في اللعبة. فبناؤها أولًا يعني أن تدخل السيرفر لحظة كتابتها، ولا يبقى
 * لصاحبه إلا أن يوقف البوت كله لو لم تعجبه واحدة منها.
 *
 * وهذي اللوحة تقلب الترتيب: كل ميزة مطفأة حتى تُشغَّل بضغطة، ومفتاح «المتجر»
 * فوقها كلها يطفئها دفعةً واحدة حين تنقلب جولة على أحد. وهذا هو «التحكّم
 * الأقوى» الذي طُلب: لا تُطارَد ستة أزرار في لحظة يحتاج فيها الإيقاف أن يكون
 * أسرع من النقاش.
 */

const PANEL_MS = 300_000

export const flagsCommand: Command = {
  name: 'مفاتيح',
  aliases: ['الاعدادات', 'إعدادات', 'flags'],
  description: 'يشغّل ويطفئ ميزات المتجر والإحصائيات',
  needs: 'settings',
  async run(ctx) {
    const message = await sendScene(ctx.channel, scene(), text(), rows())
    if (!message) return
    await collect(message, ctx.member.id)
  },
}

async function collect(message: Message, ownerId: string): Promise<void> {
  const until = Date.now() + PANEL_MS

  while (Date.now() < until) {
    const press = await message
      .awaitMessageComponent({
        time: Math.max(1000, until - Date.now()),
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === ownerId,
      })
      .catch(() => null)

    if (!press) break

    const key = press.customId.replace('flag:', '') as Flag['key']
    if (FLAGS.some((f) => f.key === key)) toggle(key)
    await press.deferUpdate().catch(() => {})
    await editScene(message, scene(), text(), rows())
  }

  // اللوحة تُنزع أزرارها عند انتهاء المهلة: زر لا يستجيب أسوأ من غيابه
  await message.edit({ components: [] }).catch(() => {})
}

function scene(): PanelScene {
  return {
    kind: 'panel',
    title: 'مفاتيح الميزات',
    subtitle: 'كل ميزة مطفأة حتى تشغّلها، وإطفاء «المتجر» يطفئ ما تحته كله',
    items: FLAGS.map((flag) => ({
      label: flag.name,
      value: on(flag.key) ? 'شغّالة' : 'مطفأة',
      on: on(flag.key),
    })),
    footer: 'ما شُغّل هنا هو وحده ما يظهر في اللعب',
  }
}

function text(): string {
  const live = FLAGS.filter((f) => on(f.key)).map((f) => f.name)
  return (
    '**مفاتيح الميزات**\n' +
    (live.length > 0 ? `الشغّال الآن: ${live.join('، ')}` : 'ما فيه ميزة شغّالة، واللعب على أصله.')
  )
}

/**
 * الأزرار خمسة في الصف بترتيب المفاتيح نفسه.
 *
 * ولونها هو حالتها: الأخضر شغّال والرمادي مطفأ، فتُقرأ اللوحة من ألوانها قبل
 * أن تُقرأ من نصّها. والصورة تقول التفصيل، والأزرار تقول ما يُضغط.
 */
function rows(): ActionRowBuilder<ButtonBuilder>[] {
  const out: ActionRowBuilder<ButtonBuilder>[] = []

  for (let i = 0; i < FLAGS.length; i += 5) {
    const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
      FLAGS.slice(i, i + 5).map((flag) =>
        new ButtonBuilder()
          .setCustomId(`flag:${flag.key}`)
          .setLabel(flag.name)
          .setStyle(on(flag.key) ? ButtonStyle.Success : ButtonStyle.Secondary)
          .setEmoji(on(flag.key) ? EMOJI.st_check : EMOJI.st_cross),
      ),
    )
    out.push(row)
  }

  return out
}

/** يُصدَّر ليستعمله من يريد قراءة الحالة بلا استيراد الملف كله. */
export const flagState = all
