import type { Prisma, RoleKind } from '@prisma/client'
import { prisma } from '../db/prisma.ts'
import { forgetGuild, guildConfig } from '../guilds/config.ts'
import { award } from '../players/points.ts'
import { gameKeys } from './data.ts'
import { access, isSnowflake } from './guard.ts'
import type { ActionResult, DashAction, WebUser, Wallet } from './types.ts'

/**
 * تنفيذ أفعال الكتابة.
 *
 * ترتيب الثلاثة لا يتغيّر: **صلاحية، ثم تحقّق مدخلات، ثم كتابة**.
 *
 * الصلاحية أولًا لأن رسالة تحقّق مختلفة لسيرفر لا يملكه المستخدم تُخبره بشيء
 * عنه؛ والتحقّق قبل الكتابة لأن كل حقل هنا يصل من نموذج HTML، وحقل النموذج
 * ليس ما رسمناه في الصفحة بل ما أرسله الطرف الآخر: `curl` واحد يرسل بريفكسًا
 * بطول ميغابايت أو `gameKey` مخترعًا أو رابط `javascript:`.
 */

const PREFIX_RE = /^\S{1,5}$/
const FIELD_RE = /^[A-Za-z][A-Za-z0-9_]{0,31}$/
const MAX_NICKNAME = 32
const MAX_IMAGE_URL = 512
const MAX_SETTING_VALUE = 200
/** مليون نقطة سقفٌ لا تبلغه لعبة، ويمنع أن يقلب فيضانُ عدد صحيح الترتيب. */
const MAX_POINTS = 1_000_000

const ROLE_KINDS = ['ADMIN', 'GAMES', 'POINTS'] as const satisfies readonly RoleKind[]
const WALLETS = ['roulette', 'team', 'solo'] as const satisfies readonly Wallet[]

function isRoleKind(value: string): value is RoleKind {
  return (ROLE_KINDS as readonly string[]).includes(value)
}

function isWallet(value: string): value is Wallet {
  return (WALLETS as readonly string[]).includes(value)
}

// ————————————————————— التحقّق —————————————————————

function badImageUrl(url: string): string | null {
  if (url.length > MAX_IMAGE_URL) return `رابط الصورة أطول من ${MAX_IMAGE_URL} حرفًا.`

  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return 'رابط الصورة غير صالح.'
  }
  // `https` وحده: `http` يُحمَّل من قناة مكشوفة، و`javascript:`/`data:` تُحقن في الصفحة
  if (parsed.protocol !== 'https:') return 'رابط الصورة يجب أن يبدأ بـ https.'
  if (!parsed.hostname.includes('.')) return 'نطاق رابط الصورة غير صالح.'
  return null
}

/**
 * يعيد رسالة عربية بالمشكلة، أو `null` إن كان الفعل سليمًا.
 *
 * دالة خالصة عمدًا: `gameKeys` تُمرَّر ولا تُقرأ من القرص هنا، فيصير كل شرط
 * قابلًا للاختبار بلا شبكة ولا قاعدة بيانات (`scripts/dash-check.ts`).
 */
export function validateAction(action: DashAction, gameKeys: ReadonlySet<string>): string | null {
  switch (action.kind) {
    case 'setPrefix':
      if (!PREFIX_RE.test(action.prefix)) {
        return 'البريفكس من حرف إلى خمسة أحرف بلا مسافات.'
      }
      return null

    case 'togglePrefix':
      return null

    case 'setGamesChannel':
      if (action.channelId !== null && !isSnowflake(action.channelId)) {
        return 'معرّف القناة غير صالح.'
      }
      return null

    case 'setNickname': {
      if (action.nickname === null) return null
      const nickname = action.nickname.trim()
      if (nickname.length === 0) return 'الاسم المستعار فارغ — استخدم «إزالة» بدلًا منه.'
      if (nickname.length > MAX_NICKNAME) return `الاسم المستعار أطول من ${MAX_NICKNAME} حرفًا.`
      return null
    }

    case 'addRole':
    case 'removeRole':
      if (!isRoleKind(action.role)) return 'نوع الصلاحية غير معروف.'
      if (!isSnowflake(action.roleId)) return 'معرّف الرول غير صالح.'
      return null

    case 'addAuthorized':
    case 'removeAuthorized':
    case 'resetPlayer':
      if (!isSnowflake(action.userId)) return 'معرّف المستخدم غير صالح.'
      return null

    case 'toggleGame':
      if (!gameKeys.has(action.gameKey)) return 'لعبة غير معروفة.'
      return null

    case 'setGameImage':
      if (!gameKeys.has(action.gameKey)) return 'لعبة غير معروفة.'
      if (action.imageUrl === null) return null
      return badImageUrl(action.imageUrl)

    case 'setGameSetting':
      if (!gameKeys.has(action.gameKey)) return 'لعبة غير معروفة.'
      if (!FIELD_RE.test(action.field)) return 'اسم الإعداد غير صالح.'
      if (action.value.length > MAX_SETTING_VALUE) {
        return `قيمة الإعداد أطول من ${MAX_SETTING_VALUE} حرفًا.`
      }
      return null

    case 'awardPoints':
      if (!isSnowflake(action.userId)) return 'معرّف المستخدم غير صالح.'
      if (!isWallet(action.wallet)) return 'محفظة نقاط غير معروفة.'
      if (!Number.isInteger(action.amount)) return 'النقاط لا بد أن تكون عددًا صحيحًا.'
      if (action.amount === 0) return 'لا معنى لمنح صفر نقطة.'
      if (Math.abs(action.amount) > MAX_POINTS) {
        return `النقاط بين ${-MAX_POINTS} و ${MAX_POINTS}.`
      }
      return null
  }
}

// ————————————————————— قراءة النموذج —————————————————————

function bool(form: URLSearchParams, name: string): boolean {
  const raw = form.get(name)
  // خانة اختيار غير مؤشَّرة لا تُرسل أصلًا — الغياب يعني «مطفأة»
  return raw === 'on' || raw === '1' || raw === 'true'
}

function orNull(form: URLSearchParams, name: string): string | null {
  const raw = form.get(name)?.trim()
  return raw ? raw : null
}

function str(form: URLSearchParams, name: string): string {
  return form.get(name)?.trim() ?? ''
}

/**
 * يحوّل جسم POST إلى `DashAction`.
 *
 * التحويل لا يتحقّق من شيء سوى الشكل — التحقّق كله في `validateAction` بمكان
 * واحد، فلا يتفرّق بين مُحوِّلٍ ومعالج وينسى أحدهما شرطًا.
 */
export function parseAction(form: URLSearchParams): DashAction | null {
  const kind = str(form, 'action')

  switch (kind) {
    case 'setPrefix':
      return { kind, prefix: form.get('prefix') ?? '' }
    case 'togglePrefix':
      return { kind, enabled: bool(form, 'enabled') }
    case 'setGamesChannel':
      return { kind, channelId: orNull(form, 'channelId') }
    case 'setNickname':
      return { kind, nickname: orNull(form, 'nickname') }
    case 'addRole':
    case 'removeRole':
      return { kind, role: str(form, 'role') as RoleKind, roleId: str(form, 'roleId') }
    case 'addAuthorized':
    case 'removeAuthorized':
    case 'resetPlayer':
      return { kind, userId: str(form, 'userId') }
    case 'toggleGame':
      return { kind, gameKey: str(form, 'gameKey'), enabled: bool(form, 'enabled') }
    case 'setGameImage':
      return { kind, gameKey: str(form, 'gameKey'), imageUrl: orNull(form, 'imageUrl') }
    case 'setGameSetting':
      return {
        kind,
        gameKey: str(form, 'gameKey'),
        field: str(form, 'field'),
        value: form.get('value') ?? '',
      }
    case 'awardPoints':
      return {
        kind,
        userId: str(form, 'userId'),
        wallet: str(form, 'wallet') as Wallet,
        // `Number('')` صفر و`Number('x')` NaN — كلاهما يسقط في `validateAction`
        amount: Number(str(form, 'amount') || 'x'),
      }
    default:
      return null
  }
}

// ————————————————————— الكتابة —————————————————————

function jsonObject(value: unknown): Prisma.InputJsonObject {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return {}
  try {
    const copy: unknown = JSON.parse(JSON.stringify(value))
    if (typeof copy !== 'object' || copy === null || Array.isArray(copy)) return {}
    return copy as Prisma.InputJsonObject
  } catch {
    return {}
  }
}

/** `"12"` عددًا و`"true"` منطقيًا: الإعدادات تُقرأ في الألعاب بأنواعها لا كنصوص. */
function coerce(value: string): string | number | boolean {
  if (value === 'true') return true
  if (value === 'false') return false
  if (/^-?\d{1,9}$/.test(value)) return Number(value)
  return value
}

async function apply(guildId: string, action: DashAction): Promise<string> {
  // يُنشئ صف `Guild` إن لم يوجد — كل الجداول أدناه ترتبط به بمفتاح أجنبي
  const saved = await guildConfig(guildId)

  switch (action.kind) {
    case 'setPrefix':
      await prisma.guild.update({ where: { id: guildId }, data: { prefix: action.prefix } })
      return `صار البريفكس «${action.prefix}».`

    case 'togglePrefix':
      await prisma.guild.update({
        where: { id: guildId },
        data: { prefixEnabled: action.enabled },
      })
      return action.enabled ? 'فُعِّل تشغيل الألعاب بالبريفكس.' : 'عُطِّل البريفكس — تبقى أوامر السلاش.'

    case 'setGamesChannel':
      await prisma.guild.update({
        where: { id: guildId },
        data: { gamesChannel: action.channelId },
      })
      return action.channelId ? 'حُدِّدت قناة الألعاب.' : 'رُفع التقييد — الألعاب تعمل في كل القنوات.'

    case 'setNickname': {
      const nickname = action.nickname === null ? null : action.nickname.trim()
      await prisma.guild.update({ where: { id: guildId }, data: { nickname } })
      return nickname ? `صار اسم البوت «${nickname}».` : 'أُعيد اسم البوت الافتراضي.'
    }

    /**
     * الحذف والإضافة في معاملة واحدة.
     *
     * على مرحلتين تبقى نافذة — قصيرة لكنها حقيقية — يكون فيها السيرفر بلا رول
     * إدارة؛ وإن فشلت المرحلة الثانية بقي بلا رول أصلًا. المعاملة تجعل النتيجة
     * إما القديم كاملًا أو الجديد كاملًا، وتجعل العملية عديمة الأثر عند التكرار.
     */
    case 'addRole':
      await prisma.$transaction([
        prisma.guildRole.deleteMany({
          where: { guildId, roleId: action.roleId, kind: action.role },
        }),
        prisma.guildRole.create({
          data: { guildId, roleId: action.roleId, kind: action.role },
        }),
      ])
      return 'أُضيف الرول.'

    case 'removeRole':
      await prisma.guildRole.deleteMany({
        where: { guildId, roleId: action.roleId, kind: action.role },
      })
      return 'أُزيل الرول.'

    case 'addAuthorized':
      await prisma.$transaction([
        prisma.authorizedUser.deleteMany({ where: { guildId, userId: action.userId } }),
        prisma.authorizedUser.create({ data: { guildId, userId: action.userId } }),
      ])
      return 'أُضيف المصرَّح له.'

    case 'removeAuthorized':
      await prisma.authorizedUser.deleteMany({ where: { guildId, userId: action.userId } })
      return 'أُزيل المصرَّح له.'

    case 'toggleGame':
      await prisma.gameConfig.upsert({
        where: { guildId_gameKey: { guildId, gameKey: action.gameKey } },
        create: { guildId, gameKey: action.gameKey, enabled: action.enabled },
        update: { enabled: action.enabled },
      })
      return action.enabled ? 'فُعِّلت اللعبة.' : 'عُطِّلت اللعبة.'

    case 'setGameImage':
      await prisma.gameConfig.upsert({
        where: { guildId_gameKey: { guildId, gameKey: action.gameKey } },
        create: { guildId, gameKey: action.gameKey, imageUrl: action.imageUrl },
        update: { imageUrl: action.imageUrl },
      })
      return action.imageUrl ? 'حُفظت صورة اللعبة.' : 'أُعيدت الصورة الافتراضية.'

    case 'setGameSetting': {
      // دمج لا استبدال: كل حقل يُحفظ وحده في نموذجه، والاستبدال يمحو البقية
      const merged = { ...jsonObject(saved.games.get(action.gameKey)?.settings) }
      merged[action.field] = coerce(action.value)
      await prisma.gameConfig.upsert({
        where: { guildId_gameKey: { guildId, gameKey: action.gameKey } },
        create: { guildId, gameKey: action.gameKey, settings: merged },
        update: { settings: merged },
      })
      return 'حُفظ الإعداد.'
    }

    case 'awardPoints':
      await award(guildId, action.userId, action.wallet, action.amount)
      return action.amount > 0
        ? `أُضيفت ${action.amount} نقطة.`
        : `خُصمت ${Math.abs(action.amount)} نقطة.`

    case 'resetPlayer':
      await prisma.player.deleteMany({ where: { guildId, userId: action.userId } })
      return 'صُفِّرت نقاط اللاعب.'
  }
}

/**
 * المدخل الوحيد لكل كتابة في الداشبورد.
 *
 * لا يرمي استثناءً أبدًا: صفحة خطأ 500 على مشرف يضغط زرًا ليست رسالة، والنص
 * الداخلي قد يحوي استعلامًا أو مسارًا. الخطأ يُسجَّل في الخادم ويخرج للمستخدم
 * سطرٌ عربي واحد يفهمه.
 */
export async function runAction(
  user: WebUser,
  guildId: string,
  action: DashAction,
): Promise<ActionResult> {
  // 1. الصلاحية — تُفحص هنا ولو فحصها المعالج قبل قليل. تكرارها رخيص، ونسيانها ليس كذلك.
  const verdict = await access(user, guildId)
  if (!verdict.allowed) return { ok: false, message: verdict.reason }

  // 2. المدخلات
  const problem = validateAction(action, await gameKeys())
  if (problem) return { ok: false, message: problem }

  // 3. الكتابة
  try {
    const message = await apply(guildId, action)
    // بلا هذا يبقى كاش الإعدادات قديمًا فيرى المستخدم قيمته السابقة ويظن أن الحفظ فشل
    forgetGuild(guildId)
    return { ok: true, message }
  } catch (error) {
    console.error(`الداشبورد: فشل «${action.kind}» في السيرفر ${guildId}:`, error)
    forgetGuild(guildId)
    return { ok: false, message: 'تعذّر حفظ التغيير. حاول مرة أخرى بعد قليل.' }
  }
}
