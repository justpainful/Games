import { randomBytes, randomInt } from 'node:crypto'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import type { IncomingMessage } from 'node:http'
import path from 'node:path'
import { signToken, verifyToken } from '../api/jwt.ts'

/**
 * جلسة مِقود.
 *
 * ————————————————— لماذا سرّ خاص به —————————————————
 *
 * الـ API يفشل إقلاعه بلا `API_JWT_SECRET` و`DISCORD_CLIENT_SECRET`، وذلك
 * صحيح له لأنه يخدم تطبيقًا موزَّعًا على أجهزة الناس. ومِقود يخدم صاحب البوت
 * على شبكته، فاشتراط ملء ملف بيئة قبل أن يفتح يعني أنه لا يفتح. لذلك يولّد
 * سرّه بنفسه أول مرة ويحفظه، ويعمل من أول `npm start` بلا إعداد.
 *
 * ————————————————— لماذا رمز اقتران —————————————————
 *
 * ديسكورد لا يقبل عنوان عودة غير مسجَّل حرفيًا في بوابة المطوّرين، وعنوان
 * الجهاز داخل الشبكة يتغيّر. فلو كان الدخول بديسكورد وحده لسقط التحكّم كلّه
 * لأن الراوتر أعطى الجهاز رقمًا آخر. الرمز يُطبع في الطرفية: من يقرأه يجلس
 * أمام الحاسب، وهو تعريف المالك هنا.
 */

const FILE = path.join(process.cwd(), 'data', 'panel.json')
const TTL_SECONDS = 30 * 24 * 60 * 60

type Stored = { secret: string }

let cache: Stored | null = null

function state(): Stored {
  if (cache) return cache
  try {
    const parsed: unknown = JSON.parse(readFileSync(FILE, 'utf8'))
    const row = parsed as Partial<Stored>
    if (typeof row.secret === 'string' && row.secret.length >= 32) {
      cache = { secret: row.secret }
      return cache
    }
  } catch {
    // ملف مفقود أو تالف: نولّد سرًّا جديدًا. أسوأ ما يحدث خروج الأجهزة المقترنة
  }
  cache = { secret: randomBytes(48).toString('base64url') }
  write(cache)
  return cache
}

/** سرّ التوقيع — يستعمله دخول ديسكورد لتوقيع `state` بنفس مفتاح الجلسة. */
export function panelSecret(): string {
  return state().secret
}

function write(next: Stored): void {
  mkdirSync(path.dirname(FILE), { recursive: true })
  const tmp = `${FILE}.tmp`
  writeFileSync(tmp, JSON.stringify(next, null, 2), 'utf8')
  renameSync(tmp, FILE)
  cache = next
}

// ————————————————————— رمز الاقتران —————————————————————

/**
 * في الذاكرة لا على القرص: رمز يبقى بعد الإطفاء هو كلمة مرور دائمة مكتوبة في
 * ملف نصّي. وإعادة التشغيل تطبع غيره، وهذا ما نريده.
 */
let code = ''

export function currentCode(): string {
  if (!code) code = String(randomInt(100_000, 1_000_000))
  return code
}

/** يُستدعى بعد اقتران ناجح: رمز استُعمل مرّة لا يُستعمل ثانية. */
export function rotateCode(): string {
  code = String(randomInt(100_000, 1_000_000))
  return code
}

/**
 * حدّ المحاولات.
 *
 * ستة أرقام تعني مليون احتمال، وطلبًا في المللي ثانية يُستنفد الفضاء في وقت
 * معقول. عشر محاولات لكل عنوان في الدقيقة تجعل ذلك مستحيلًا عمليًّا بلا أن
 * تزعج من أخطأ في الكتابة.
 */
const tries = new Map<string, { count: number; until: number }>()
const WINDOW_MS = 60_000
const MAX_TRIES = 10

export function tooManyTries(from: string): boolean {
  const row = tries.get(from)
  if (!row) return false
  if (Date.now() > row.until) {
    tries.delete(from)
    return false
  }
  return row.count >= MAX_TRIES
}

export function noteTry(from: string): void {
  const row = tries.get(from)
  if (!row || Date.now() > row.until) {
    tries.set(from, { count: 1, until: Date.now() + WINDOW_MS })
    return
  }
  row.count += 1
}

export function clearTries(from: string): void {
  tries.delete(from)
}

// ————————————————————— رمز الجلسة —————————————————————

export type PanelUser = {
  /** معرّف ديسكورد، أو `owner` لمن دخل برمز الاقتران */
  id: string
  via: 'code' | 'discord'
  name: string
}

/**
 * الجلسة داخل الرمز نفسه لا في جدول على الخادم.
 *
 * ————————————————— لماذا رمز لا كوكي —————————————————
 *
 * السطح تطبيق أصلي يحفظ الرمز في الـKeychain ويرسله في رأس `Authorization`.
 * والكوكي يُرسل تلقائيًا مع كل طلب، وذلك مصدر CSRF على الويب ولا معنى له هنا
 * أصلًا: لا متصفّح في الصورة يرسل شيئًا نيابة عن أحد.
 *
 * والاسم والباب يُحقنان في `sub` مفصولين بـ `|`، فيبقى `signToken` كما هو ولا
 * تحتاج اللوحة نسخة ثانية من التوقيع. والتحقّق يفكّهما بعد إثبات البصمة، فلا
 * يُقرأ منهما بايت قبل ذلك.
 */
export function issue(user: PanelUser): string {
  return signToken(`${user.via}|${user.id}|${user.name}`, state().secret, TTL_SECONDS)
}

export function readUser(req: IncomingMessage): PanelUser | null {
  const header = req.headers.authorization ?? ''
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) return null

  const claims = verifyToken(token, state().secret)
  if (!claims) return null

  const [via, id, ...rest] = claims.sub.split('|')
  if (id === undefined || (via !== 'code' && via !== 'discord')) return null
  return { id, via, name: rest.join('|') || id }
}

export function clientIp(req: IncomingMessage): string {
  return req.socket.remoteAddress?.replace('::ffff:', '') ?? '?'
}
