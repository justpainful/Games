import type { IncomingMessage, ServerResponse } from 'node:http'
import { config } from './env.ts'
import { verifyToken } from './jwt.ts'

/**
 * طبقة HTTP رفيعة فوق `node:http`.
 *
 * الخادم يخدم ستة مسارات ولا يرفع ملفات ولا يقرأ قوالب. إضافة إطار كامل هنا
 * تضيف اعتمادية وسطح هجوم بلا مقابل — الموجّه كله ثلاثون سطرًا.
 */

export class HttpError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'HttpError'
    this.status = status
  }
}

export type Ctx = {
  req: IncomingMessage
  res: ServerResponse
  url: URL
  params: Readonly<Record<string, string>>
}

export type Handler = (ctx: Ctx) => Promise<void>

type Route = { method: string; parts: string[]; handler: Handler }

function split(path: string): string[] {
  return path.split('/').filter((part) => part.length > 0)
}

export type Router = {
  get(path: string, handler: Handler): void
  find(method: string, pathname: string): { handler: Handler; params: Record<string, string> } | null
}

export function makeRouter(): Router {
  const routes: Route[] = []

  return {
    get(path, handler) {
      routes.push({ method: 'GET', parts: split(path), handler })
    },

    find(method, pathname) {
      const parts = split(pathname)
      for (const route of routes) {
        if (route.method !== method) continue
        if (route.parts.length !== parts.length) continue

        const params: Record<string, string> = {}
        let matched = true
        for (let i = 0; i < route.parts.length; i++) {
          const expected = route.parts[i]
          const actual = parts[i]
          if (expected === undefined || actual === undefined) {
            matched = false
            break
          }
          if (expected.startsWith(':')) {
            params[expected.slice(1)] = decodeURIComponent(actual)
            continue
          }
          if (expected !== actual) {
            matched = false
            break
          }
        }
        if (matched) return { handler: route.handler, params }
      }
      return null
    },
  }
}

/**
 * قيمة من الـ query بحدّ أعلى للطول.
 *
 * كل ما يصل من العميل يُقاس قبل أن يُستعمل: `state` بطول ميغابايت يُدخل عملية
 * التحقق في حساب HMAC عبثي، وهو رفض خدمة بسطر واحد من الطرف الآخر.
 */
export function safeQuery(url: URL, name: string, max = 2048): string | undefined {
  const raw = url.searchParams.get(name)?.trim()
  if (!raw || raw.length > max) return undefined
  return raw
}

// ————————————————————— الردود —————————————————————

/**
 * التطبيق الأصلي لا يخضع لـ CORS، لكن أدوات التصحيح في المتصفح تخضع.
 * السماح مفتوح آمن هنا لأن المصادقة برأس `Authorization` لا بكوكي: لا متصفح
 * يرسل الرمز تلقائيًا نيابة عن المستخدم، فلا CSRF.
 */
const COMMON = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': 'authorization, content-type',
  'access-control-allow-methods': 'GET, POST, OPTIONS',
  'cache-control': 'no-store',
}

export function json(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    ...COMMON,
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(payload),
  })
  res.end(payload)
}

export function text(res: ServerResponse, status: number, body: string): void {
  res.writeHead(status, {
    ...COMMON,
    'content-type': 'text/plain; charset=utf-8',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

export function redirect(res: ServerResponse, location: string): void {
  res.writeHead(302, { ...COMMON, location })
  res.end()
}

export function fail(res: ServerResponse, error: unknown): void {
  if (error instanceof HttpError) {
    json(res, error.status, { error: error.message })
    return
  }
  console.error('خطأ غير متوقّع في الـ API:', error)
  // الرسالة الداخلية لا تخرج للعميل — قد تحوي مسارات أو استعلامات
  json(res, 500, { error: 'خطأ في الخادم' })
}

// ————————————————————— المصادقة —————————————————————

/**
 * يقرأ `Authorization: Bearer` ويعيد معرّف المستخدم، أو يرمي 401.
 * التطبيق يعرف 401 ويمسح الرمز من الـ Keychain ويعيد المستخدم لشاشة الدخول.
 */
export function requireUser(ctx: Ctx): string {
  const header = ctx.req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7).trim() : ''
  if (!token) throw new HttpError(401, 'رمز الجلسة مفقود')

  const claims = verifyToken(token, config.jwt.secret)
  if (!claims) throw new HttpError(401, 'رمز الجلسة غير صالح أو منتهٍ')
  return claims.sub
}
