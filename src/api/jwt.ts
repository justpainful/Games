import { createHmac, timingSafeEqual } from 'node:crypto'

/**
 * JWT بـ HS256 مكتوب بـ `node:crypto` وحده.
 *
 * إضافة مكتبة كاملة لأجل توقيع HMAC وقراءة base64url ثلاث مرات هي اعتمادية
 * بلا مقابل: التوقيع سطران، والخطر كله في **التحقق** لا في التوقيع، وهو هنا
 * تحت أعيننا: نتحقق من البصمة أولًا، ثم نقرأ الترويسة، ولا نصدّق `alg`
 * القادم من الرمز نفسه (هجمة alg=none / خلط الخوارزميات).
 */

const HEADER = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')

export function hmac(data: string, secret: string): string {
  return createHmac('sha256', secret).update(data).digest('base64url')
}

/** مقارنة ثابتة الزمن — المقارنة بـ `===` تسرّب البصمة حرفًا حرفًا. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a, 'utf8')
  const right = Buffer.from(b, 'utf8')
  if (left.length !== right.length) return false
  return timingSafeEqual(left, right)
}

export type Claims = {
  /** معرّف مستخدم ديسكورد */
  sub: string
  iat: number
  exp: number
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : null
}

function decodeSegment(segment: string): unknown {
  try {
    return JSON.parse(Buffer.from(segment, 'base64url').toString('utf8'))
  } catch {
    return null
  }
}

export function signToken(sub: string, secret: string, ttlSeconds: number): string {
  const now = Math.floor(Date.now() / 1000)
  const claims: Claims = { sub, iat: now, exp: now + ttlSeconds }
  const body = `${HEADER}.${Buffer.from(JSON.stringify(claims)).toString('base64url')}`
  return `${body}.${hmac(body, secret)}`
}

export function verifyToken(token: string, secret: string): Claims | null {
  const parts = token.split('.')
  if (parts.length !== 3) return null
  const [head, payload, signature] = parts
  if (head === undefined || payload === undefined || signature === undefined) return null

  // البصمة أولًا: لا نفكّ ولا نصدّق أي بايت قبل إثبات أنه صادر عنّا
  if (!safeEqual(hmac(`${head}.${payload}`, secret), signature)) return null

  const header = asRecord(decodeSegment(head))
  if (!header || header['alg'] !== 'HS256') return null

  const claims = asRecord(decodeSegment(payload))
  if (!claims) return null

  const sub = claims['sub']
  const iat = claims['iat']
  const exp = claims['exp']
  if (typeof sub !== 'string' || sub.length === 0) return null
  if (typeof iat !== 'number' || typeof exp !== 'number') return null
  if (exp * 1000 <= Date.now()) return null

  return { sub, iat, exp }
}
