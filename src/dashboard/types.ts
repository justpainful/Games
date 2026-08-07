/**
 * عقد الداشبورد — نماذج العرض وأفعال الكتابة.
 *
 * الداشبورد **ليس للقراءة فقط**: كل شاشة فيها أفعال تعدّل قاعدة البيانات فعلًا.
 * تعريف الأفعال هنا في مكان واحد يجعل التحقق من المدخلات والصلاحية موحّدًا،
 * بدل أن يكرّره كل معالج بطريقته وينسى واحد منها فحصًا.
 */
import type { RoleKind } from '@prisma/client'

/** مستخدم مسجَّل في الداشبورد. */
export type WebUser = {
  id: string
  username: string
  displayName: string | null
  avatarHash: string | null
}

/** سيرفر يديره المستخدم ويوجد فيه البوت. */
export type ManagedGuild = {
  id: string
  name: string
  iconHash: string | null
  /** هل البوت موجود فعلًا؟ إن لا، نعرض دعوة لإضافته بدل صفحة إعدادات فارغة. */
  botPresent: boolean
}

export type RoleOption = { id: string; name: string; color: number }
export type ChannelOption = { id: string; name: string }

/** إعدادات سيرفر كما تُعرض وتُحرَّر. */
export type GuildSettingsView = {
  guild: ManagedGuild
  prefix: string
  prefixEnabled: boolean
  gamesChannel: string | null
  nickname: string | null
  roles: Record<RoleKind, string[]>
  authorized: string[]
  games: GameSettingView[]
  /** خيارات السيرفر الحقيقية لملء القوائم */
  allRoles: RoleOption[]
  allChannels: ChannelOption[]
}

export type GameSettingView = {
  key: string
  name: string
  tagline: string
  enabled: boolean
  imageUrl: string | null
  settings: Record<string, unknown>
}

export type LeaderView = {
  userId: string
  displayName: string
  avatarHash: string | null
  roulette: number
  team: number
  solo: number
  total: number
  gamesPlayed: number
  wins: number
}

/**
 * كل فعل كتابة في الداشبورد.
 *
 * الاسم هو نفسه قيمة الحقل المخفي `action` في النموذج، فالمعالج يوزّع عليه
 * بلا سلسلة مسارات، ونسيان تسجيل فعل يظهر كخطأ نوع لا كصفحة صامتة.
 */
export type DashAction =
  | { kind: 'setPrefix'; prefix: string }
  | { kind: 'togglePrefix'; enabled: boolean }
  | { kind: 'setGamesChannel'; channelId: string | null }
  | { kind: 'setNickname'; nickname: string | null }
  | { kind: 'addRole'; role: RoleKind; roleId: string }
  | { kind: 'removeRole'; role: RoleKind; roleId: string }
  | { kind: 'addAuthorized'; userId: string }
  | { kind: 'removeAuthorized'; userId: string }
  | { kind: 'toggleGame'; gameKey: string; enabled: boolean }
  | { kind: 'setGameImage'; gameKey: string; imageUrl: string | null }
  | { kind: 'setGameSetting'; gameKey: string; field: string; value: string }
  | { kind: 'awardPoints'; userId: string; wallet: Wallet; amount: number }
  | { kind: 'resetPlayer'; userId: string }

export type Wallet = 'roulette' | 'team' | 'solo'

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

/** نتيجة فحص الصلاحية على سيرفر بعينه. */
export type Access =
  | { allowed: true; guild: ManagedGuild }
  | { allowed: false; reason: string }
