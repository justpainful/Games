import type { IncomingMessage, ServerResponse } from 'node:http'

/**
 * أدوات HTTP للداشبورد.
 *
 * الداشبورد متصفح لا تطبيق: يرسل نماذج `application/x-www-form-urlencoded`
 * ويحمل كوكيز، بينما `src/api/` يتكلّم JSON ويحمل `Authorization`. لذلك
 * الأدوات هنا مستقلة عنه بدل حشر الحالتين في مسار واحد.
 */

export function readCookies(req: IncomingMessage): Record<string, string> {
  const raw = req.headers.cookie
  if (!raw) return {}
  const out: Record<string, string> = {}
  for (const part of raw.split(';')) {
    const eq = part.indexOf('=')
    if (eq < 1) continue
    const key = part.slice(0, eq).trim()
    const value = part.slice(eq + 1).trim()
    if (key) out[key] = decodeURIComponent(value)
  }
  return out
}

export function setCookie(
  res: ServerResponse,
  name: string,
  value: string,
  opts: { maxAge?: number; secure?: boolean } = {},
): void {
  const bits = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/dash',
    'HttpOnly',
    // Lax لا Strict: العودة من ديسكورد بعد OAuth تنقّل عبر موقع آخر،
    // و Strict يمنع إرسال الكوكي فيبدو الدخول كأنه فشل.
    'SameSite=Lax',
  ]
  if (opts.secure) bits.push('Secure')
  bits.push(`Max-Age=${opts.maxAge ?? 0}`)
  const prev = res.getHeader('Set-Cookie')
  const list = Array.isArray(prev) ? prev : prev ? [String(prev)] : []
  res.setHeader('Set-Cookie', [...list, bits.join('; ')])
}

/** حد أقصى لجسم النموذج — بلا سقف يستطيع طلب واحد استنزاف الذاكرة. */
const MAX_BODY = 64 * 1024

export async function readForm(req: IncomingMessage): Promise<Record<string, string>> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buf = chunk as Buffer
    size += buf.length
    if (size > MAX_BODY) throw new Error('جسم الطلب أكبر من المسموح')
    chunks.push(buf)
  }
  const params = new URLSearchParams(Buffer.concat(chunks).toString('utf8'))
  const out: Record<string, string> = {}
  for (const [k, v] of params) out[k] = v
  return out
}

export function html(res: ServerResponse, body: string, status = 200): void {
  res.writeHead(status, {
    'Content-Type': 'text/html; charset=utf-8',
    // الداشبورد يعرض أسماء يكتبها مستخدمون — سياسة صارمة تقلّل أثر أي تهريب فائت
    'Content-Security-Policy':
      "default-src 'none'; img-src https: data:; style-src 'self' 'unsafe-inline'; font-src 'self'; form-action 'self'",
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'same-origin',
  })
  res.end(body)
}

export function redirect(res: ServerResponse, to: string): void {
  res.writeHead(302, { Location: to })
  res.end()
}

export function text(res: ServerResponse, body: string, status = 200): void {
  res.writeHead(status, { 'Content-Type': 'text/plain; charset=utf-8' })
  res.end(body)
}

/**
 * يفكّ مسار الداشبورد.
 * `/dash/g/:guildId/:page` هو الشكل الوحيد الذي يحمل سيرفرًا.
 */
export type DashRoute =
  | { kind: 'home' }
  | { kind: 'login' }
  | { kind: 'callback' }
  | { kind: 'logout' }
  | { kind: 'style' }
  | { kind: 'font'; name: string }
  | { kind: 'guild'; guildId: string; page: string }
  | { kind: 'unknown' }

export function routeOf(pathname: string): DashRoute {
  if (pathname === '/dash' || pathname === '/dash/') return { kind: 'home' }
  if (pathname === '/dash/login') return { kind: 'login' }
  if (pathname === '/dash/callback') return { kind: 'callback' }
  if (pathname === '/dash/logout') return { kind: 'logout' }
  if (pathname === '/dash/style.css') return { kind: 'style' }

  const font = /^\/dash\/font\/([a-z0-9-]+)\.ttf$/.exec(pathname)
  if (font?.[1]) return { kind: 'font', name: font[1] }

  // معرّفات ديسكورد أرقام فقط — الحصر هنا يمنع مسارات ملفّقة من الوصول للمعالج
  const guild = /^\/dash\/g\/(\d{5,25})\/([a-z]+)\/?$/.exec(pathname)
  if (guild?.[1] && guild[2]) return { kind: 'guild', guildId: guild[1], page: guild[2] }

  return { kind: 'unknown' }
}
