import { createServer } from 'node:http'
import { disconnectDb } from '../db/prisma.ts'
import { abortAll } from '../games/running.ts'
import { config } from './env.ts'
import { fail, json, makeRouter, text, type Ctx } from './http.ts'
import { authCallback, authStart } from './oauth.ts'
import { mount } from './routes.ts'
import { attachWs } from './ws.ts'

/**
 * خادم الـ API لتطبيق iOS.
 *
 * عملية مستقلة عن البوت (`src/app.ts`) تتشارك معه قاعدة البيانات ومنطق الألعاب
 * ولا تتشارك اتصال الجيتواي. تشغيلهما معًا أو منفصلين سواء.
 */

const router = makeRouter()
router.get('/auth/start', authStart)
router.get('/auth/callback', authCallback)
router.get('/health', (ctx) => {
  json(ctx.res, 200, { ok: true })
  return Promise.resolve()
})
mount(router)

const server = createServer((req, res) => {
  const host = req.headers.host ?? `localhost:${config.port}`
  let url: URL
  try {
    url = new URL(req.url ?? '/', `http://${host}`)
  } catch {
    text(res, 400, 'طلب غير صالح')
    return
  }

  if (req.method === 'OPTIONS') {
    text(res, 204, '')
    return
  }

  const found = router.find(req.method ?? 'GET', url.pathname)
  if (!found) {
    json(res, 404, { error: 'المسار غير موجود' })
    return
  }

  const ctx: Ctx = { req, res, url, params: found.params }
  // كل خطأ ينتهي هنا: مسار غير ملتقط يترك الوصلة معلّقة حتى تنتهي مهلة العميل
  found.handler(ctx).catch((error: unknown) => fail(res, error))
})

attachWs(server)

server.listen(config.port, () => {
  console.log(`API يستمع على ${config.publicUrl} (منفذ ${config.port})`)
  console.log(`redirect_uri المسجّل يجب أن يكون: ${config.callbackUrl}`)
  if (!config.discord.botToken) {
    console.warn('DISCORD_TOKEN غير مضبوط — الأسماء والأفتارات في الصدارة ستكون معرّفات فقط')
  }
})

async function shutdown(signal: string): Promise<void> {
  console.log(`${signal} — إطفاء الـ API`)
  // اللاعبون المنتظرون داخل حلقة لعبة يخرجون بدل أن يعلقوا حتى انتهاء المهلة
  abortAll()
  server.close()
  await disconnectDb()
  process.exit(0)
}

process.on('SIGINT', () => void shutdown('SIGINT'))
process.on('SIGTERM', () => void shutdown('SIGTERM'))
