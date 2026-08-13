import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, MessageFlags, type Message } from 'discord.js'
import { EMOJI } from '../design/emoji.ts'
import { award, pointsOf } from '../players/points.ts'
import { on } from '../settings/flags.ts'
import { PERKS, bagOf, give, keepOf, priceOf, type Perk } from '../shop/stock.ts'
import type { PanelScene } from '../scenes/scene.ts'
import type { Command } from './commands.ts'
import { editScene, sendScene } from './reply.ts'

/**
 * المتجر.
 *
 * لا يعرض إلا ما شُغّل في لوحة المفاتيح: ميزة مطفأة لا تُباع ولا تُذكر، فلا
 * يرى اللاعب شيئًا لا يستطيع استعماله. ومتجر بلا ميزة واحدة مشغّلة يقول ذلك
 * صراحة بدل أن يفتح لوحة فارغة.
 *
 * والشراء يخصم من محفظة «سولو» لأنها المحفظة التي يكسبها الفرد بنفسه، وخصمها
 * لا يمسّ نقاط الفرق التي كسبها معه غيره.
 */

const PANEL_MS = 180_000

export const shopCommand: Command = {
  name: 'متجر',
  aliases: ['المتجر', 'shop'],
  description: 'يشتري ميزات بنقاطك',
  async run(ctx) {
    if (!on('shop')) {
      await ctx.say('المتجر مقفل حاليًا.')
      return
    }

    const open = PERKS.filter((perk) => on(perk.flag))
    if (open.length === 0) {
      await ctx.say('ما فيه ميزة معروضة الآن.')
      return
    }

    const purse = await pointsOf(ctx.guildId, ctx.member.id)
    const message = await sendScene(
      ctx.channel,
      scene(open, purse.solo, bagOf(ctx.guildId, ctx.member.id)),
      text(purse.solo),
      rows(open, purse.solo),
    )
    if (!message) return

    await collect(message, ctx, open)
  },
}

async function collect(
  message: Message,
  ctx: Parameters<Command['run']>[0],
  open: readonly Perk[],
): Promise<void> {
  const until = Date.now() + PANEL_MS

  while (Date.now() < until) {
    const press = await message
      .awaitMessageComponent({
        time: Math.max(1000, until - Date.now()),
        componentType: ComponentType.Button,
        filter: (i) => i.user.id === ctx.member.id,
      })
      .catch(() => null)
    if (!press) break

    const perk = open.find((p) => `buy:${p.key}` === press.customId)
    if (!perk) continue

    const purse = await pointsOf(ctx.guildId, ctx.member.id)
    const cost = priceOf(perk.key)
    if (purse.solo < cost) {
      await press
        .reply({
          content: `${EMOJI.hot_cross} ناقصك ${cost - purse.solo} نقطة على «${perk.name}».`,
          flags: MessageFlags.Ephemeral,
        })
        .catch(() => {})
      continue
    }

    // الخصم أولًا ثم التسليم: لو انقطع بينهما ضاعت نقاط لا ميزة مجانية
    await award(ctx.guildId, ctx.member.id, 'solo', -cost)
    const held = give(ctx.guildId, ctx.member.id, perk.key)
    await press.deferUpdate().catch(() => {})

    const left = await pointsOf(ctx.guildId, ctx.member.id)
    await editScene(
      message,
      scene(open, left.solo, bagOf(ctx.guildId, ctx.member.id)),
      text(left.solo),
      rows(open, left.solo),
    )
    await ctx.say(`${EMOJI.win_check} <@${ctx.member.id}> اشترى **${perk.name}** · صار عنده ${held}`)
  }

  await message.edit({ components: [] }).catch(() => {})
}

function scene(open: readonly Perk[], purse: number, bag: Record<string, number | undefined>): PanelScene {
  return {
    kind: 'panel',
    title: 'المتجر',
    subtitle: `عندك ${purse} نقطة · الميزة تُستهلك مرة واحدة`,
    items: open.map((perk) => ({
      label: `${perk.name} · ${priceOf(perk.key)}`,
      value:
        (bag[perk.key] ? `${perk.about} — عندك ${bag[perk.key]}` : perk.about) +
        (keepOf(perk.key) ? ' · تبقى معك' : ''),
      on: purse >= priceOf(perk.key),
    })),
    footer: 'ما تشتريه يُصرف في جولة واحدة، ولا يُصرف إلا إذا نفعك',
  }
}

function text(purse: number): string {
  return `**المتجر** · رصيدك ${purse} نقطة`
}

function rows(open: readonly Perk[], purse: number): ActionRowBuilder<ButtonBuilder>[] {
  const out: ActionRowBuilder<ButtonBuilder>[] = []
  for (let i = 0; i < open.length; i += 5) {
    out.push(
      new ActionRowBuilder<ButtonBuilder>().addComponents(
        open.slice(i, i + 5).map((perk) =>
          new ButtonBuilder()
            .setCustomId(`buy:${perk.key}`)
            .setLabel(`${perk.name} ${priceOf(perk.key)}`)
            .setStyle(purse >= priceOf(perk.key) ? ButtonStyle.Success : ButtonStyle.Secondary)
            .setDisabled(purse < priceOf(perk.key))
            .setEmoji(EMOJI.st_star),
        ),
      ),
    )
  }
  return out
}
