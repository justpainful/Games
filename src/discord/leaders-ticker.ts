import type { Guild } from 'discord.js'
import { prisma } from '../db/prisma.ts'
import { leaderboard } from '../players/points.ts'
import type { LeadersScene, PlayerView } from '../scenes/scene.ts'
import { client } from './client.ts'
import { editScene, sendScene } from './reply.ts'

/**
 * لوحة صدارة دائمة تُحدَّث كل خمس دقائق.
 *
 * ————————————————— تُحرَّر ولا يُعاد نشرها —————————————————
 *
 * النشر كل خمس دقائق يعني مئتين وثمانيًا وثمانين رسالة في اليوم، فتصير القناة
 * سجلًّا لحالات ماضية لا لوحةَ حالٍ راهن. والتحرير يُبقيها رسالة واحدة يعود
 * إليها من أراد، ولا يُشعر أحدًا بشيء.
 *
 * ومعرّف الرسالة محفوظ في قاعدة البيانات لا في الذاكرة: بلا ذلك يبدأ كل
 * تشغيل رسالةً جديدة، فتتراكم لوحات ميتة كلّما أُعيد تشغيل البوت — وقد أُعيد
 * تشغيله اليوم وحده عشر مرات.
 *
 * ————————————————— موعد التحديث في النص —————————————————
 *
 * الوقت المتبقّي يُكتب بختم `<t:...:R>` لا برقم ثابت. عميل ديسكورد يعدّه عند
 * كل قارئ بتوقيته هو ويحدّثه بلا طلب منّا، فيبقى «بعد دقيقتين» صادقًا بينما
 * «سيُحدَّث بعد 5 دقائق» يكذب بعد ثانية من كتابته.
 */

const EVERY_MS = 5 * 60_000
const TOP = 10

let timer: NodeJS.Timeout | null = null

export function startLeadersTicker(): void {
  if (timer) return
  // أول تحديث بعد مهلة قصيرة: الإقلاع مزدحم، ولا داعي لمزاحمته برندر
  setTimeout(() => void tick(), 10_000)
  timer = setInterval(() => void tick(), EVERY_MS)
}

export function stopLeadersTicker(): void {
  if (timer) clearInterval(timer)
  timer = null
}

async function tick(): Promise<void> {
  const rows = await prisma.guild
    .findMany({ where: { leadersChannel: { not: null } } })
    .catch(() => [])

  for (const row of rows) {
    await refresh(row.id, row.leadersChannel, row.leadersMessage).catch((err: unknown) => {
      console.error(`[صدارة] ${row.id}:`, err)
    })
  }
}

async function refresh(
  guildId: string,
  channelId: string | null,
  messageId: string | null,
): Promise<void> {
  if (!channelId) return

  const channel = await client.channels.fetch(channelId).catch(() => null)
  if (!channel || !channel.isTextBased() || !channel.isSendable()) return

  const guild = client.guilds.cache.get(guildId) ?? (await client.guilds.fetch(guildId).catch(() => null))
  if (!guild) return

  const scene = await build(guild, guildId)
  const text = summary(scene)

  if (messageId) {
    const existing = await channel.messages.fetch(messageId).catch(() => null)
    if (existing) {
      const edited = await editScene(existing, scene, text, [])
      if (edited) return
      // فشل التحرير يعني رسالة حُذفت بيد أحدهم، فتُنشأ بديلة وتُحفظ
    }
  }

  const posted = await sendScene(channel, scene, text, [])
  if (!posted) return
  await prisma.guild
    .update({ where: { id: guildId }, data: { leadersMessage: posted.id } })
    .catch(() => null)
}

async function build(guild: Guild, guildId: string): Promise<LeadersScene> {
  const rows = await leaderboard(guildId, 'total', TOP)
  const players = await Promise.all(rows.map((row) => viewOf(guild, row.userId)))

  return {
    kind: 'leaders',
    title: 'الصدارة — مجموع النقاط',
    rows: rows.map((row, i) => ({
      player: players[i] ?? { id: row.userId, name: 'لاعب', avatar: null },
      points: row.points,
    })),
  }
}

/**
 * نصّ الرسالة بجانب الصورة: موعد التحديث وحده.
 *
 * كان يحمل الأسماء والنقاط أيضًا عملًا بـDESIGN.md §6، وهو يوجب نسخ كل حالة
 * حرجة خارج الصورة. وقرّر صاحب المشروع أن الصورة تكفي هنا، وله وجه: §6 مبنيّة
 * على لعبة جارية يترك فيها فشلُ الرندر لاعبًا لا يعرف دوره، ولوحة تتجدّد كل
 * خمس دقائق ليس لها ذلك الأثر.
 *
 * والثمن المدفوع أن قارئ الشاشة لا يرى الترتيب، وأن الأسماء لا تُنسخ ولا
 * تُبحث. مذكور هنا لأنه ثمن قرارٍ لا سهوٌ فيه.
 *
 * وموعد التحديث يبقى بختم `<t:...:R>`: عميل ديسكورد يعدّه عند كل قارئ بتوقيته
 * ويحدّثه بلا طلب، فيبقى صادقًا بينما رقم ثابت يكذب بعد ثانية من كتابته.
 */
function summary(scene: LeadersScene): string {
  const when = Math.floor((Date.now() + EVERY_MS) / 1000)
  if (scene.rows.length === 0) {
    return `ما أحد سجّل نقاطًا بعد · التحديث القادم <t:${when}:R>`
  }
  return `التحديث القادم <t:${when}:R>`
}

async function viewOf(guild: Guild, userId: string): Promise<PlayerView> {
  const member = await guild.members.fetch(userId).catch(() => null)
  if (!member) return { id: userId, name: 'لاعب غادر', avatar: null }
  return {
    id: userId,
    name: member.displayName,
    avatar: member.displayAvatarURL({ extension: 'png', size: 128 }),
  }
}
