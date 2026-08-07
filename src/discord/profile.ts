import type { Guild } from 'discord.js'
import { award, leaderboard, pointsOf, type Wallet } from '../players/points.ts'
import type { LeadersScene, NoticeScene, PlayerView, ProfileScene } from '../scenes/scene.ts'
import type { Command } from './commands.ts'
import { playerView } from './players.ts'

/**
 * أوامر النقاط: «نقاطي» و«توب» و«اعطاء».
 *
 * كلها تُخرج مشهدًا مصوّرًا يرافقه نص (DESIGN §6): الصورة هي المنتج، والنص
 * يبقي الرقم قابلًا للنسخ ومقروءًا لقارئ الشاشة وصالحًا لو فشل الرندر.
 */

/** المسح الذي يُحسب منه الترتيب — نفس سقف `leaderboard` الداخلي. */
const RANK_SCAN = 500
const TOP = 10
/** سقف الدفعة الواحدة: خطأ مطبعي في «اعطاء» لا يفسد لوحة الصدارة كلها. */
const MAX_AWARD = 1_000_000

const WALLETS: { wallet: Wallet; label: string; words: string[] }[] = [
  { wallet: 'roulette', label: 'الروليت', words: ['روليت', 'الروليت'] },
  { wallet: 'team', label: 'الجماعية', words: ['جماعية', 'جماعي', 'الجماعية'] },
  { wallet: 'solo', label: 'الفردية', words: ['فردية', 'فردي', 'الفردية'] },
]

// ————— نقاطي —————

const myPoints: Command = {
  name: 'نقاطي',
  aliases: ['نقاط', 'نقاطى'],
  description: 'يعرض نقاطك الثلاث ومجموعك وترتيبك في السيرفر',
  async run(ctx) {
    // «نقاطي @لاعب» يعرض نقاط غيرك — نفس الأمر بلا أمر ثانٍ يُحفظ
    const targetId = mentionedId(ctx.args) ?? ctx.member.id
    const player = await viewOf(ctx.member.guild, targetId)
    const points = await pointsOf(ctx.guildId, targetId)

    const scene: ProfileScene = {
      kind: 'profile',
      player,
      roulette: points.roulette,
      team: points.team,
      solo: points.solo,
      total: points.total,
      gamesPlayed: points.gamesPlayed,
      wins: points.wins,
      rank: points.total > 0 ? await rankOf(ctx.guildId, targetId) : null,
    }

    await ctx.scene(
      scene,
      `**${player.name}** — المجموع ${points.total} ` +
        `(روليت ${points.roulette} · جماعية ${points.team} · فردية ${points.solo})`,
    )
  },
}

/**
 * الترتيب يُقرأ من نفس مسح `leaderboard`، فلا يختلف الرقمان بين الشاشتين.
 * خارج الخمسمئة الأوائل يُعاد `null` — «غير مصنّف» أصدق من رقم مخمَّن.
 */
async function rankOf(guildId: string, userId: string): Promise<number | null> {
  const rows = await leaderboard(guildId, 'total', RANK_SCAN)
  const index = rows.findIndex((r) => r.userId === userId)
  return index === -1 ? null : index + 1
}

// ————— توب —————

const top: Command = {
  name: 'توب',
  aliases: ['الصداره', 'الصدارة', 'صدارة'],
  description: 'أعلى عشرة لاعبين في مجموع النقاط',
  async run(ctx) {
    const rows = await leaderboard(ctx.guildId, 'total', TOP)
    const players = await Promise.all(rows.map((r) => viewOf(ctx.member.guild, r.userId)))

    const scene: LeadersScene = {
      kind: 'leaders',
      title: 'الصدارة — مجموع النقاط',
      rows: rows.map((r, i) => ({
        player: players[i] ?? { id: r.userId, name: 'لاعب', avatar: null },
        points: r.points,
      })),
    }

    const text =
      rows.length === 0
        ? '**الصدارة** — ما أحد سجّل نقاطًا بعد.'
        : `**الصدارة** — ${scene.rows
            .map((r, i) => `${i + 1}. ${r.player.name} (${r.points})`)
            .join(' · ')}`

    await ctx.scene(scene, text.slice(0, 1900))
  },
}

// ————— اعطاء —————

const giveFormat: NoticeScene = {
  kind: 'notice',
  tone: 'info',
  title: 'صيغة الأمر',
  body: 'اكتب: اعطاء @لاعب 5 — ويمكن إضافة نوع المحفظة في الآخر: روليت أو جماعية أو فردية.',
}

const give: Command = {
  name: 'اعطاء',
  aliases: ['إعطاء', 'اعطاءنقاط'],
  description: 'إعطاء نقاط للاعب — اعطاء @لاعب 5',
  needs: 'awardPoints',
  async run(ctx) {
    const parsed = parseGive(ctx.args)
    if (!parsed) {
      await ctx.scene(giveFormat, 'صيغة الأمر: `اعطاء @لاعب 5`')
      return
    }

    const { userId, amount, wallet } = parsed
    const player = await viewOf(ctx.member.guild, userId)

    await award(ctx.guildId, userId, wallet, amount)
    const points = await pointsOf(ctx.guildId, userId)

    const label = WALLETS.find((w) => w.wallet === wallet)?.label ?? 'الفردية'
    const verb = amount > 0 ? `أُضيفت ${amount}` : `خُصمت ${Math.abs(amount)}`

    const scene: NoticeScene = {
      kind: 'notice',
      tone: 'ok',
      title: amount > 0 ? 'تمّت الإضافة' : 'تمّ الخصم',
      body: `${verb} نقطة إلى محفظة ${label} عند ${player.name}. مجموعه الآن ${points.total}.`,
    }

    await ctx.scene(scene, `<@${userId}> — ${verb} نقطة (${label}). المجموع ${points.total}.`)
  },
}

type Give = { userId: string; amount: number; wallet: Wallet }

/**
 * يقبل `اعطاء @لاعب 5` و `اعطاء 5 @لاعب` و`اعطاء @لاعب 5 روليت`.
 *
 * ترتيب الوسيطين لا يُفرض: المستخدم يكتب ما يخطر له أولًا، ورفض الأمر لأنه
 * قلب كلمتين تكلفة بلا فائدة — المعرّف والرقم متمايزان بشكلهما لا بموضعهما.
 */
function parseGive(args: string[]): Give | null {
  const userId = mentionedId(args)
  if (!userId) return null

  const amountWord = args.find((a) => /^[+-]?\d{1,9}$/.test(a))
  if (amountWord === undefined) return null

  const amount = Number(amountWord)
  if (!Number.isSafeInteger(amount) || amount === 0 || Math.abs(amount) > MAX_AWARD) return null

  const wallet =
    WALLETS.find((w) => args.some((a) => w.words.includes(a)))?.wallet ??
    // الفردية هي الافتراضي: أكثر الألعاب فردية، والروليت لا تُمنح يدويًا عادة
    'solo'

  return { userId, amount, wallet }
}

/** `<@123>` و `<@!123>` ومعرّف خام — ديسكورد يكتب الأول ويكتب المستخدم الثالث. */
function mentionedId(args: string[]): string | null {
  for (const arg of args) {
    const mention = /^<@!?(\d{5,25})>$/.exec(arg)
    if (mention?.[1]) return mention[1]
    if (/^\d{15,25}$/.test(arg)) return arg
  }
  return null
}

/**
 * اللاعب قد يكون غادر السيرفر بعد أن سجّل نقاطه.
 * الجلب عضوًا أولًا ليظهر لقبه في السيرفر، ثم مستخدمًا، ثم اسم بديل —
 * ولا يسقط المشهد كله لأن حسابًا واحدًا اختفى.
 */
async function viewOf(guild: Guild, userId: string): Promise<PlayerView> {
  const member = await guild.members.fetch(userId).catch(() => null)
  if (member) return playerView(member)

  const user = await guild.client.users.fetch(userId).catch(() => null)
  if (user) return playerView(user)

  return { id: userId, name: 'لاعب غادر', avatar: null }
}

export const profileCommands: Command[] = [myPoints, top, give]
