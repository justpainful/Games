import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Message,
} from 'discord.js'
import { EMOJI } from '../design/emoji.ts'
import { PERKS, keepOf, priceOf, setPrice, toggleKeep, type PerkKey } from '../shop/stock.ts'
import type { PanelScene } from '../scenes/scene.ts'
import type { Command } from './commands.ts'
import { editScene, sendScene } from './reply.ts'

/**
 * ضبط المتجر: السعر ووضع الميزة.
 *
 * صفحة منفصلة عن `مفاتيح` عمدًا. المفاتيح سؤال «هل تظهر؟» ويُجاب في ثانية
 * وقت انقلاب جولة، وهذي سؤال «بكم وكيف؟» ويُجاب على مهل. وخلطهما يعني لوحة
 * فيها عشرون زرًّا يُبحث فيها عن زر الإطفاء حين يكون الوقت أضيق ما يكون.
 */

const PANEL_MS = 300_000

export const tuningCommand: Command = {
  name: 'تسعير',
  aliases: ['اسعار', 'أسعار'],
  description: 'يضبط سعر كل ميزة، ودائمة هي أم تُصرف مرة',
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

    const [what, key] = press.customId.split(':') as [string, PerkKey]

    if (what === 'mode') {
      toggleKeep(key)
      await press.deferUpdate().catch(() => {})
      await editScene(message, scene(), text(), rows())
      continue
    }

    if (what === 'price') {
      const perk = PERKS.find((p) => p.key === key)
      if (!perk) continue
      const modal = new ModalBuilder()
        .setCustomId(`price:${key}:${Date.now()}`)
        .setTitle(`سعر ${perk.name}`)
        .addComponents(
          new ActionRowBuilder<TextInputBuilder>().addComponents(
            new TextInputBuilder()
              .setCustomId('value')
              .setLabel('كم نقطة؟ صفر يعني مجانية')
              .setStyle(TextInputStyle.Short)
              .setValue(String(priceOf(key)))
              .setRequired(true)
              .setMaxLength(5),
          ),
        )

      await press.showModal(modal).catch((error: unknown) => {
        console.error('تعذّر فتح نافذة السعر:', error)
      })
      const submit = await press
        .awaitModalSubmit({ time: 120_000, filter: (i) => i.customId === modal.toJSON().custom_id })
        .catch(() => null)
      if (!submit) continue
      await submit.deferUpdate().catch(() => {})

      const digits = submit.fields.getTextInputValue('value').replace(/[^\d]/g, '')
      if (digits) setPrice(key, Number(digits))
      await editScene(message, scene(), text(), rows())
    }
  }

  await message.edit({ components: [] }).catch(() => {})
}

function scene(): PanelScene {
  return {
    kind: 'panel',
    title: 'ضبط المتجر',
    subtitle: 'اضغط اسم الميزة لتغيير سعرها، وزر الوضع ليصير دائمًا أو مستهلكًا',
    items: PERKS.map((perk) => ({
      label: perk.name,
      value: `${priceOf(perk.key)} نقطة · ${keepOf(perk.key) ? 'تبقى في حسابه' : 'تُصرف مرة'}`,
      on: !keepOf(perk.key),
    })),
    footer: 'الدائمة تجعل من جمع أكثر أقوى ممن لعب أحسن — استعملها بحذر',
  }
}

function text(): string {
  return `**ضبط المتجر**\n${PERKS.map((p) => `${p.name} ${priceOf(p.key)}`).join(' · ')}`
}

/**
 * صفّان للسعر وصفّان للوضع، لا صفّ لكل ميزة.
 *
 * ديسكورد يسمح بخمسة صفوف، وستّ ميزات في صفّ لكلٍّ تعني اثني عشر صفًّا. والفصل
 * بين الفعلين يجعل الصفّ كله يقول شيئًا واحدًا: هذا سعر وهذا وضع.
 */
function rows(): ActionRowBuilder<ButtonBuilder>[] {
  const out: ActionRowBuilder<ButtonBuilder>[] = []
  const chunk = <T,>(list: readonly T[]): T[][] => {
    const parts: T[][] = []
    for (let i = 0; i < list.length; i += 3) parts.push(list.slice(i, i + 3))
    return parts
  }

  for (const group of chunk(PERKS)) {
    out.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        group.map((perk) =>
          new ButtonBuilder()
            .setCustomId(`price:${perk.key}`)
            .setLabel(`${perk.name} ${priceOf(perk.key)}`)
            .setStyle(ButtonStyle.Primary)
            .setEmoji(EMOJI.st_star),
        ),
      ),
    )
  }

  for (const group of chunk(PERKS)) {
    out.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        group.map((perk) =>
          new ButtonBuilder()
            .setCustomId(`mode:${perk.key}`)
            .setLabel(keepOf(perk.key) ? `${perk.name}: دائمة` : `${perk.name}: مرة`)
            .setStyle(keepOf(perk.key) ? ButtonStyle.Danger : ButtonStyle.Secondary)
            .setEmoji(keepOf(perk.key) ? EMOJI.st_crown : EMOJI.st_timer),
        ),
      ),
    )
  }

  return out
}
