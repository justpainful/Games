import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  MessageFlags,
  ModalBuilder,
  StringSelectMenuBuilder,
  TextInputBuilder,
  TextInputStyle,
  type Message,
  type ModalSubmitInteraction,
  type TextBasedChannel,
} from 'discord.js'
import { EMOJI } from '../design/emoji.ts'
import { gameFace } from '../design/faces.ts'
import type { GameDef } from '../games/define.ts'
import type { PanelScene } from '../scenes/scene.ts'
import { holdPanel, releasePanel } from './panels.ts'
import { editScene, sendScene } from './reply.ts'

/**
 * لوحة إعداد الفعالية: تُضبط بالضغط لا بوسائط الأمر.
 *
 * ————————————————— لماذا لوحة لا وسائط —————————————————
 *
 * `فعالية اسرع اعلام 10` تعمل، وتشترط أن يحفظ صاحبها أسماء ستّ عشرة لعبة
 * وترتيب الوسائط. واللوحة تعرض ما هو متاح فيُختار منه، فلا يُخطئ أحد اسمًا
 * ولا يحتاج أن يتذكّر شيئًا. والأمر بوسائطه يبقى يعمل لمن اعتاده، ويملأ اللوحة
 * سلفًا بما كتبه.
 *
 * ————————————————— لماذا الإعداد قبل البدء —————————————————
 *
 * الفعالية تحتجز القناة دقائق، فبدؤها بإعداد خاطئ يعني إيقافها وإعادتها.
 * واللوحة تُظهر ما اختير قبل الضغط على «ابدأ»، فيُصحَّح قبل أن يُحتجز أحد.
 *
 * ————————————————— كل ما يُضبط يُضبط من هنا —————————————————
 *
 * الطول كان يُقرأ من وسائط الأمر وحدها، فمن فتح اللوحة لم يجد له سبيلًا إلى
 * عدد الجولات ولا إلى المدة، وهما أهم ما يُضبط في فعالية. صارا نافذة واحدة
 * لأنهما سؤال واحد: كم تطول؟
 */

export type EventSettings = {
  games: GameDef[]
  /** أول من يبلغها يُنهي الفعالية بطلًا، و`null` يعني لا هدف */
  target: number | null
  rounds: number | null
  minutes: number | null
}

type Draft = {
  games: GameDef[]
  target: number | null
  rounds: number | null
  minutes: number | null
}

const SETUP_MS = 180_000
const MAX_TARGET = 100
const MAX_ROUNDS = 40
const MAX_MINUTES = 180
/** فعالية بلا طول محدّد تأخذ هذا العدد — نفس افتراضي الأمر. */
const DEFAULT_ROUNDS = 5

export type SetupResult = { started: true; settings: EventSettings } | { started: false }

export async function runSetup(args: {
  channel: TextBasedChannel
  hostId: string
  games: GameDef[]
  preset: GameDef[]
  rounds?: number
  minutes?: number
}): Promise<SetupResult> {
  const { channel, hostId, games } = args
  const draft: Draft = {
    games: [...args.preset],
    target: null,
    rounds: args.rounds ?? (args.minutes === undefined ? DEFAULT_ROUNDS : null),
    minutes: args.minutes ?? null,
  }

  const message = await sendScene(channel, scene(draft), text(draft), rows(games, draft))
  if (!message) return { started: false }

  /**
   * اللوحة تُعلن ملكيتها لرسالتها قبل أول ضغطة.
   *
   * بدونها يؤجّل المستقبل العام كل ضغطة فور وصولها، والتفاعل المؤجَّل لا تُفتح
   * عليه نافذة — فيضغط صاحبها «نقاط الفوز» ولا يرى شيئًا.
   */
  holdPanel(message.id)

  try {
    const started = await collect(message, hostId, games, draft)
    // اللوحة تُنزع أزرارها أيًّا كانت النتيجة: لوحة معطّلة تبقى تدعو للضغط
    await message.edit({ components: [] }).catch(() => {})
    if (!started) return { started: false }
    return { started: true, settings: { ...draft } }
  } finally {
    releasePanel(message.id)
  }
}

async function collect(
  message: Message,
  hostId: string,
  games: GameDef[],
  draft: Draft,
): Promise<boolean> {
  const until = Date.now() + SETUP_MS

  while (Date.now() < until) {
    const left = Math.max(1000, until - Date.now())
    const press = await message
      .awaitMessageComponent({ time: left, filter: (i) => i.user.id === hostId })
      .catch(() => null)

    if (!press) return false

    if (press.componentType === ComponentType.StringSelect) {
      draft.games = press.values
        .map((key) => games.find((g) => g.key === key))
        .filter((g): g is GameDef => g !== undefined)
      await press.deferUpdate().catch(() => {})
      await refresh(message, games, draft)
      continue
    }

    if (press.customId === 'event:cancel') {
      await press.deferUpdate().catch(() => {})
      return false
    }

    if (press.customId === 'event:length' && press.isButton()) {
      const submit = await openModal(press, lengthModal(draft))
      if (submit) {
        applyLength(draft, submit)
        await refresh(message, games, draft)
      }
      continue
    }

    if (press.customId === 'event:target' && press.isButton()) {
      const submit = await openModal(press, targetModal(draft))
      if (submit) {
        const n = digits(submit.fields.getTextInputValue('value'))
        draft.target = n !== null && n >= 1 ? Math.min(n, MAX_TARGET) : null
        await refresh(message, games, draft)
      }
      continue
    }

    if (press.customId === 'event:start') {
      if (draft.games.length === 0) {
        await press
          .reply({ content: 'اختر لعبة واحدة على الأقل.', flags: MessageFlags.Ephemeral })
          .catch(() => {})
        continue
      }
      await press.deferUpdate().catch(() => {})
      return true
    }
  }

  return false
}

/**
 * يفتح نافذة وينتظر إرسالها.
 *
 * `showModal` هو الردّ على الضغطة، فلا يسبقه `deferUpdate`. وانتظار الإرسال
 * يُقيَّد بمعرّف النافذة نفسها، وإلا التقط إرسال نافذة أخرى فتحها الشخص نفسه
 * في اللحظة ذاتها.
 */
async function openModal(
  press: { id: string; showModal: (m: ModalBuilder) => Promise<void>; awaitModalSubmit: (o: { time: number; filter: (i: ModalSubmitInteraction) => boolean }) => Promise<ModalSubmitInteraction> },
  modal: ModalBuilder,
): Promise<ModalSubmitInteraction | null> {
  const id = modal.toJSON().custom_id
  try {
    await press.showModal(modal)
  } catch (error) {
    console.error('تعذّر فتح نافذة إعداد الفعالية:', error)
    return null
  }

  const submit = await press
    .awaitModalSubmit({ time: 120_000, filter: (i) => i.customId === id })
    .catch(() => null)
  if (!submit) return null
  await submit.deferUpdate().catch(() => {})
  return submit
}

function lengthModal(draft: Draft): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`event:length:${Date.now()}`)
    .setTitle('طول الفعالية')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('rounds')
          .setLabel('كم جولة؟ اتركه فارغًا لو تبي بالوقت')
          .setStyle(TextInputStyle.Short)
          .setValue(draft.rounds === null ? '' : String(draft.rounds))
          .setRequired(false)
          .setMaxLength(3),
      ),
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('minutes')
          .setLabel('كم دقيقة؟ اتركه فارغًا لو تبي بالجولات')
          .setStyle(TextInputStyle.Short)
          .setValue(draft.minutes === null ? '' : String(draft.minutes))
          .setRequired(false)
          .setMaxLength(3),
      ),
    )
}

function targetModal(draft: Draft): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`event:target:${Date.now()}`)
    .setTitle('نقاط الفوز')
    .addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(
        new TextInputBuilder()
          .setCustomId('value')
          .setLabel('كم نقطة تُنهي الفعالية؟ صفر يعني بلا هدف')
          .setStyle(TextInputStyle.Short)
          .setValue(draft.target === null ? '' : String(draft.target))
          .setRequired(false)
          .setMaxLength(3),
      ),
    )
}

/**
 * الطول لا يجوز أن يخرج فارغًا من الطرفين.
 *
 * من مسح الحقلين معًا يقصد فعالية بلا حدّ، وتلك لا تنتهي إلا بصمت جولتين أو
 * بإيقاف يدوي — والقناة محجوزة طوال ذلك. فيُردّ إلى الافتراضي بدل أن يُترك
 * الباب مفتوحًا بلا قصد.
 */
function applyLength(draft: Draft, submit: ModalSubmitInteraction): void {
  const rounds = digits(submit.fields.getTextInputValue('rounds'))
  const minutes = digits(submit.fields.getTextInputValue('minutes'))

  draft.rounds = rounds !== null && rounds >= 1 ? Math.min(rounds, MAX_ROUNDS) : null
  draft.minutes = minutes !== null && minutes >= 1 ? Math.min(minutes, MAX_MINUTES) : null
  if (draft.rounds === null && draft.minutes === null) draft.rounds = DEFAULT_ROUNDS
}

function digits(raw: string): number | null {
  const only = raw.replace(/[^\d]/g, '')
  if (!only) return null
  const n = Number(only)
  return Number.isFinite(n) ? n : null
}

async function refresh(message: Message, games: GameDef[], draft: Draft): Promise<void> {
  await editScene(message, scene(draft), text(draft), rows(games, draft))
}

/** «5 جولات · 15 دقيقة» أو أحدهما — يقرأه صاحب اللوحة كما سيقرأه اللاعبون. */
function lengthLabel(draft: Draft): string {
  const parts: string[] = []
  if (draft.rounds !== null) parts.push(draft.rounds === 1 ? 'جولة واحدة' : `${draft.rounds} جولة`)
  if (draft.minutes !== null) {
    parts.push(draft.minutes === 1 ? 'دقيقة واحدة' : `${draft.minutes} دقيقة`)
  }
  if (parts.length === 0) return 'بلا حدّ'
  // الشرطان معًا: أيّهما بلغ أولًا أنهى الفعالية
  return parts.join(' أو ')
}

function scene(draft: Draft): PanelScene {
  return {
    kind: 'panel',
    title: 'إعدادات الفعالية',
    subtitle: 'اختر الألعاب وطولها، ثم ابدأ',
    items: [
      {
        label: 'الألعاب',
        value: draft.games.length > 0 ? draft.games.map((g) => g.name).join('، ') : 'ما اخترت شيئًا بعد',
        on: draft.games.length > 0,
      },
      { label: 'الطول', value: lengthLabel(draft), on: true },
      {
        label: 'نقاط الفوز',
        value: draft.target === null ? 'بلا هدف، تنتهي بطولها' : String(draft.target),
        on: draft.target !== null,
      },
      {
        label: 'الترتيب',
        value: draft.games.length > 1 ? 'جولة لكل لعبة بالتناوب' : 'جولات متتابعة من لعبة واحدة',
      },
    ],
    footer: 'الفعالية تتوقّف أيضًا لو ما حاول أحد جولتين متتاليتين',
  }
}

function text(draft: Draft): string {
  const list = draft.games.length > 0 ? draft.games.map((g) => g.name).join(' ثم ') : 'لم تُختر ألعاب'
  return (
    `**إعدادات الفعالية**\nالألعاب: ${list}\nالطول: ${lengthLabel(draft)}` +
    `\nنقاط الفوز: ${draft.target ?? 'بلا هدف'}`
  )
}

function rows(games: GameDef[], draft: Draft): ActionRowBuilder<never>[] {
  const picked = new Set(draft.games.map((g) => g.key))

  const menu = new StringSelectMenuBuilder()
    .setCustomId('event:games')
    .setPlaceholder('اختر الألعاب — بالترتيب الذي تريد')
    .setMinValues(1)
    // ديسكورد يرفض أكثر من خمسة وعشرين خيارًا، وعندنا ستّ عشرة لعبة مفتوحة
    .setMaxValues(Math.min(games.length, 25))
    .addOptions(
      games.slice(0, 25).map((game) => ({
        value: game.key,
        label: game.name.slice(0, 100),
        description: game.tagline.slice(0, 100),
        default: picked.has(game.key),
        ...(gameFace(game.key) ? { emoji: gameFace(game.key) } : {}),
      })),
    )

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId('event:start')
      .setLabel('ابدأ الفعالية')
      .setStyle(ButtonStyle.Success)
      .setEmoji(EMOJI.act_start),
    new ButtonBuilder()
      .setCustomId('event:length')
      .setLabel('الطول')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(EMOJI.st_timer),
    new ButtonBuilder()
      .setCustomId('event:target')
      .setLabel('نقاط الفوز')
      .setStyle(ButtonStyle.Secondary)
      .setEmoji(EMOJI.st_target),
    new ButtonBuilder()
      .setCustomId('event:cancel')
      .setLabel('إلغاء')
      .setStyle(ButtonStyle.Danger)
      .setEmoji(EMOJI.act_cancel),
  )

  return [
    new ActionRowBuilder<never>().addComponents(menu as never),
    buttons as unknown as ActionRowBuilder<never>,
  ]
}
