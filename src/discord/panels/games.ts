import { ChannelSelectMenuBuilder, ChannelType } from 'discord.js'
import { prisma } from '../../db/prisma.ts'
import { loadGames } from '../../games/all.ts'
import type { GameDef } from '../../games/define.ts'
import { forgetGuild, isGameEnabled, type GuildConfig } from '../../guilds/config.ts'
import type { Command, Ctx } from '../commands.ts'
import {
  ack,
  actionMenu,
  askText,
  chunk,
  noticeReply,
  ok,
  openPanel,
  row,
  warn,
  type PanelArgs,
  type PanelSpec,
  type PanelView,
} from './shared.ts'

/**
 * لوحة «اعدادات الالعاب».
 *
 * اللوحة ذات وضعين على **نفس الرسالة**: قائمة كل الألعاب، ثم تفاصيل لعبة
 * واحدة. البديل — رسالة خاصة لكل لعبة — يعني رسالة جديدة مع كل ضغطة وقناة
 * ممتلئة بلوحات ميتة.
 *
 * قائمة الألعاب تُقرأ من `loadGames()` لا من ثابت: اللعبة الجديدة تظهر هنا
 * بمجرّد وجود مجلدها، بلا تعديل هذا الملف.
 */

/** ديسكورد يرفض قائمة فيها أكثر من خمسة وعشرين خيارًا. */
const OPTIONS_CAP = 25
/** خمسة صفوف كحد أقصى في الرسالة، أولها قائمة القناة. */
const PICKER_ROWS = 4
/**
 * سقف بنود الصورة. ثلاثون بندًا = خمسة عشر صفًا في عمودين، وهو أقصى ما تبقى
 * معه اللوحة **مشهدًا** لا مستندًا (DESIGN §7). ما زاد يُذكر عددًا في التذييل.
 */
const ITEMS_CAP = 30

const WALLET: Record<GameDef['wallet'], string> = {
  solo: 'فردية',
  team: 'جماعية',
  roulette: 'روليت',
}

export const gamesPanelCommands: Command[] = [
  {
    name: 'اعدادات-الالعاب',
    aliases: ['اعدادات-الألعاب', 'الالعاب', 'الألعاب'],
    description: 'اعدادات الالعاب — تفعيل الألعاب وشات الألعاب وصور الألعاب',
    needs: 'settings',
    run: openGamesPanel,
  },
]

async function openGamesPanel(ctx: Ctx): Promise<void> {
  const games = await loadGames()

  // حالة اللوحة الوحيدة، وتعيش داخل هذا الإغلاق: لوحتان في قناتين لا تتداخلان
  let selected: GameDef | null = null

  await openPanel(ctx, {
    need: 'settings',
    render: (args) => (selected ? detailView(args, selected) : listView(args, games)),

    async handle(args) {
      const { guildId, config, interaction } = args

      if (interaction.isChannelSelectMenu() && interaction.customId === 'games:channel') {
        await ack(interaction)
        const channelId = interaction.values[0] ?? null
        await prisma.guild.update({ where: { id: guildId }, data: { gamesChannel: channelId } })
        forgetGuild(guildId)
        await noticeReply(
          interaction,
          ok(
            'تم الحفظ',
            channelId
              ? 'صارت الألعاب تبدأ في هذه القناة وحدها.'
              : 'صارت الألعاب تبدأ في أي قناة.',
          ),
        )
        return true
      }

      if (interaction.isStringSelectMenu() && interaction.customId.startsWith('games:pick')) {
        await ack(interaction)
        const key = interaction.values[0]
        selected = games.find((g) => g.key === key) ?? null
        return true
      }

      if (interaction.isStringSelectMenu() && interaction.customId === 'games:one') {
        const game = selected
        if (!game) {
          await ack(interaction)
          return false
        }
        return handleGame(guildId, config, game, interaction, () => {
          selected = null
        })
      }

      await ack(interaction)
      return false
    },
  })
}

// ————— العرض —————

function listView({ config, guild }: PanelArgs, games: GameDef[]): PanelView {
  const enabled = games.filter((g) => isGameEnabled(config, g.key)).length

  const items: PanelView['scene']['items'] = [
    {
      label: 'شات الألعاب',
      value: config.gamesChannel ? `#${channelName(guild, config.gamesChannel)}` : 'كل القنوات',
      on: config.gamesChannel !== null,
    },
    ...games.map((g) => ({
      label: g.name,
      value: isGameEnabled(config, g.key) ? 'مفعّلة' : 'معطّلة',
      on: isGameEnabled(config, g.key),
    })),
  ]

  const hidden = Math.max(0, items.length - ITEMS_CAP)

  return {
    scene: {
      kind: 'panel',
      title: 'اعدادات الالعاب',
      subtitle: `${enabled} من ${games.length} مفعّلة`,
      items: items.slice(0, ITEMS_CAP),
      footer:
        hidden > 0
          ? `و${hidden} لعبة أخرى — اخترها من القائمة لضبط إعداداتها`
          : 'اختر لعبة من القائمة لضبط حالتها وصورتها وإعداداتها',
    },
    text: `**اعدادات الالعاب** — ${enabled}/${games.length} مفعّلة · شات الألعاب: ${
      config.gamesChannel ? `<#${config.gamesChannel}>` : 'كل القنوات'
    }`,
    rows: [channelMenu(config), ...pickerMenus(config, games)],
  }
}

function detailView({ config }: PanelArgs, game: GameDef): PanelView {
  const state = config.games.get(game.key)
  const on = state?.enabled ?? true
  const image = state?.imageUrl ?? null
  const custom = settingsEntries(state?.settings)

  return {
    scene: {
      kind: 'panel',
      title: game.name,
      subtitle: 'اعدادات اللعبة',
      items: [
        { label: 'الحالة', value: on ? 'مفعّلة' : 'معطّلة', on },
        { label: 'صورة اللعبة', value: image ?? 'الصورة الافتراضية', on: image !== null },
        { label: 'عدد اللاعبين', value: `${game.players.min} إلى ${game.players.max}` },
        { label: 'محفظة النقاط', value: WALLET[game.wallet] },
        ...custom.map(([key, value]) => ({ label: key, value })),
      ],
      footer: game.tagline,
    },
    text: `**${game.name}** — ${on ? 'مفعّلة' : 'معطّلة'} · ${game.players.min}-${game.players.max} لاعبين`,
    rows: [
      actionMenu('games:one', `${game.name} — اختر ما تغيّره`, [
        {
          value: 'toggle',
          label: on ? 'تعطيل اللعبة' : 'تفعيل اللعبة',
          description: on ? 'ما عاد أحد يقدر يبدأها هنا' : 'ترجع متاحة للجميع',
        },
        {
          value: 'image',
          label: 'تغيير صورة اللعبة',
          description: 'رابط https لصورة تحلّ محل الصورة الافتراضية',
        },
        {
          value: 'image-clear',
          label: 'إرجاع الصورة الافتراضية',
          description: 'يمسح الرابط المخصّص',
        },
        {
          value: 'settings',
          label: 'إعدادات اللعبة',
          description: 'أسطر بصيغة: مفتاح = قيمة',
        },
        { value: 'back', label: 'رجوع لقائمة الألعاب', description: 'يعرض كل الألعاب من جديد' },
      ]),
    ],
  }
}

function channelName(guild: PanelArgs['guild'], id: string): string {
  const channel = guild.channels.cache.get(id)
  return channel && 'name' in channel ? channel.name : 'قناة محذوفة'
}

function channelMenu(config: GuildConfig): PanelView['rows'][number] {
  const menu = new ChannelSelectMenuBuilder()
    .setCustomId('games:channel')
    .setPlaceholder('شات الألعاب — اتركه فارغًا ليعمل البوت في كل القنوات')
    .setChannelTypes(ChannelType.GuildText)
    .setMinValues(0)
    .setMaxValues(1)
  if (config.gamesChannel) menu.setDefaultChannels(config.gamesChannel)
  return row(menu)
}

/** الألعاب تُقسّم على قوائم بخمسة وعشرين، فيتّسع الصف الواحد لمئة لعبة. */
function pickerMenus(config: GuildConfig, games: GameDef[]): PanelView['rows'] {
  return chunk(games, OPTIONS_CAP)
    .slice(0, PICKER_ROWS)
    .map((part, index) =>
      actionMenu(
        `games:pick:${index}`,
        chunk(games, OPTIONS_CAP).length > 1
          ? `اختر لعبة (${index + 1})`
          : 'اختر لعبة لضبط إعداداتها',
        part.map((g) => ({
          value: g.key,
          label: g.name,
          description: `${isGameEnabled(config, g.key) ? 'مفعّلة' : 'معطّلة'} — ${g.tagline}`,
        })),
      ),
    )
}

// ————— التعديل —————

async function handleGame(
  guildId: string,
  config: GuildConfig,
  game: GameDef,
  i: Parameters<PanelSpec['handle']>[0]['interaction'],
  back: () => void,
): Promise<boolean> {
  const state = config.games.get(game.key)
  const choice = i.values[0]

  if (choice === 'back') {
    await ack(i)
    back()
    return true
  }

  if (choice === 'toggle') {
    await ack(i)
    const next = !(state?.enabled ?? true)
    await saveGame(guildId, game.key, { enabled: next })
    forgetGuild(guildId)
    await noticeReply(
      i,
      ok(
        next ? `اشتغلت ${game.name}` : `تعطّلت ${game.name}`,
        next ? 'صار الجميع يقدر يبدأها.' : 'ما عاد أحد يقدر يبدأها في هذا السيرفر.',
      ),
    )
    return true
  }

  if (choice === 'image-clear') {
    await ack(i)
    await saveGame(guildId, game.key, { imageUrl: null })
    forgetGuild(guildId)
    await noticeReply(i, ok('رجعت الصورة الافتراضية', `${game.name} صارت بصورتها الأصلية.`))
    return true
  }

  if (choice === 'image') {
    const asked = await askText(i, {
      title: `صورة ${game.name}`.slice(0, 45),
      label: 'رابط الصورة',
      hint: 'رابط https مباشر لصورة png أو jpg',
      value: state?.imageUrl ?? null,
      max: 400,
    })
    if (!asked) return false

    if (!isImageLink(asked.value)) {
      await noticeReply(
        asked.submit,
        warn('رابط غير صالح', 'لازم يبدأ بـ https:// ويكون رابطًا مباشرًا لصورة.'),
      )
      return false
    }

    await saveGame(guildId, game.key, { imageUrl: asked.value })
    forgetGuild(guildId)
    await noticeReply(asked.submit, ok('تم الحفظ', `صارت ${game.name} بالصورة الجديدة.`))
    return true
  }

  if (choice === 'settings') {
    const asked = await askText(i, {
      title: `إعدادات ${game.name}`.slice(0, 45),
      label: 'سطر لكل إعداد',
      hint: 'مثال: الجولات = 5 — والقيمة تقبل رقمًا أو صح/خطأ أو نصًا',
      value: settingsText(state?.settings),
      max: 1000,
      required: false,
      paragraph: true,
    })
    if (!asked) return false

    const parsed = parseSettings(asked.value)
    await saveGame(guildId, game.key, { settings: parsed })
    forgetGuild(guildId)
    await noticeReply(
      asked.submit,
      ok(
        'تم الحفظ',
        Object.keys(parsed).length === 0
          ? `رجعت ${game.name} لإعداداتها الافتراضية.`
          : `حفظت ${Object.keys(parsed).length} إعدادًا لـ ${game.name}.`,
      ),
    )
    return true
  }

  await ack(i)
  return false
}

type GamePatch = { enabled?: boolean; imageUrl?: string | null; settings?: object }

/**
 * صف اللعبة قد لا يكون موجودًا: الألعاب مفعّلة افتراضيًا بلا صف في الجدول،
 * فأول تعديل هو الذي ينشئه — ولذلك `upsert` لا `update`.
 */
async function saveGame(guildId: string, gameKey: string, patch: GamePatch): Promise<void> {
  await prisma.gameConfig.upsert({
    where: { guildId_gameKey: { guildId, gameKey } },
    create: { guildId, gameKey, ...patch },
    update: patch,
  })
}

/** روابط `file://` أو مسارات محلية تُرفض: القيمة تُقرأ لاحقًا كمصدر صورة. */
function isImageLink(value: string): boolean {
  try {
    return new URL(value).protocol === 'https:'
  } catch {
    return false
  }
}

function settingsEntries(value: unknown): [string, string][] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return []
  return Object.entries(value as Record<string, unknown>).map(([k, v]) => [k, String(v)])
}

function settingsText(value: unknown): string {
  return settingsEntries(value)
    .map(([k, v]) => `${k} = ${v}`)
    .join('\n')
}

/**
 * صيغة `مفتاح = قيمة` بدل JSON.
 * لا يوجد مخطط لإعدادات كل لعبة في `GameDef`، فالمحرّر عام مهما كانت اللعبة —
 * وسطر بسيط أرحم على مشرف عربي من قوس مجعّد وفاصلة منسية تكسر الحفظ كله.
 */
function parseSettings(text: string): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {}
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key) continue
    out[key] = coerce(trimmed.slice(eq + 1).trim())
  }
  return out
}

function coerce(value: string): string | number | boolean {
  if (value === 'صح' || value === 'true') return true
  if (value === 'خطأ' || value === 'false') return false
  if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value)
  return value
}
