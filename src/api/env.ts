import 'dotenv/config'

/**
 * إعدادات خادم الـ API.
 *
 * منفصلة عن `src/settings.ts` عمدًا: ذاك يفشل بلا `DISCORD_TOKEN` لأن البوت
 * بلا توكن لا معنى له، أما الـ API فقد يُشغَّل في عملية مستقلة لا تتصل بجيتواي
 * ديسكورد أصلًا. الاشتراك الوحيد بينهما هو قاعدة البيانات.
 *
 * **لا سرّ واحد مكتوب هنا.** كلها من البيئة، والأسماء موثّقة في `.env.example`.
 */

function value(name: string): string | undefined {
  const raw = process.env[name]?.trim()
  return raw ? raw : undefined
}

/** يفشل التشغيل فورًا بدل أن يسقط الخادم لاحقًا برسالة غامضة. */
function required(...names: string[]): string {
  for (const name of names) {
    const found = value(name)
    if (found) return found
  }
  throw new Error(`المتغيّر ${names.join(' أو ')} مفقود — انسخ .env.example إلى .env واملأه`)
}

const port = Number(value('PORT') ?? 8080)

/**
 * عنوان الخادم كما تراه ديسكورد. لا بد أن يطابق حرفيًا أحد الـ Redirects
 * المسجّلة في بوابة المطوّرين، وإلا رفض ديسكورد تبادل الرمز.
 */
const publicUrl = (value('API_PUBLIC_URL') ?? `http://localhost:${port}`).replace(/\/+$/, '')

/**
 * قائمة بيضاء لوجهات العودة. بدونها يصبح `/auth/start?redirect=…` جسر
 * open redirect: يُرسل ضحيةٌ إلى نطاقنا الموثوق فتعود برمز جلستها إلى مهاجم.
 */
const DEFAULT_REDIRECTS = ['gamesapp://auth']

const extraRedirects = (value('API_REDIRECT_ALLOWLIST') ?? '')
  .split(',')
  .map((entry) => entry.trim())
  .filter((entry) => entry.length > 0)

const jwtSecret = required('API_JWT_SECRET')
if (jwtSecret.length < 32) {
  console.warn('API_JWT_SECRET أقصر من 32 حرفًا — ولّد واحدًا بـ: openssl rand -base64 48')
}

export const config = {
  port,
  publicUrl,
  callbackUrl: `${publicUrl}/auth/callback`,

  jwt: {
    secret: jwtSecret,
    /** ثلاثون يومًا — بعدها يعيد التطبيق تسجيل الدخول */
    ttlSeconds: 30 * 24 * 60 * 60,
  },

  discord: {
    /** معرّف التطبيق نفسه؛ ديسكورد يسمّيه client_id في OAuth و application_id في الأوامر */
    clientId: required('DISCORD_CLIENT_ID', 'DISCORD_APP_ID'),
    /** لا يغادر الخادم أبدًا — التطبيق لا يراه ولا يحتاجه */
    clientSecret: required('DISCORD_CLIENT_SECRET'),
    /** توكن البوت — يُستخدم لجلب الأسماء والأفتارات في لوحة الصدارة */
    botToken: value('DISCORD_TOKEN') ?? '',
  },

  redirects: [...new Set([...DEFAULT_REDIRECTS, ...extraRedirects])],
} as const

export function isAllowedRedirect(redirect: string): boolean {
  return config.redirects.includes(redirect)
}
