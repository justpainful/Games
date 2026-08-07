import { createServer, type Server } from 'node:http'
import { pathToFileURL } from 'node:url'
import { disconnectDb } from '../db/prisma.ts'
import { handleDashboard } from '../dashboard/mount.ts'
import { abortAll } from '../games/running.ts'
import { config } from './env.ts'
import { fail, json, makeRouter, text, type Ctx } from './http.ts'
import { authCallback, authStart } from './oauth.ts'
import { mount } from './routes.ts'
import { attachWs } from './ws.ts'

/**
 * خادم الـ API لتطبيق iOS.
 *
 * وضعان:
 *  - `npm run api` — عملية مستقلة تتشارك مع البوت قاعدة البيانات فقط. يصلح
 *    لكل شيء **عدا** الانضمام لألعاب ديسكورد الجارية، لأن سجلّ الجلسات في
 *    الذاكرة ولا يعبر حدود العمليات.
 *  - داخل عملية البوت (`API_IN_PROCESS=1` مع `npm start`) — عندها يرى الخادم
 *    نفس سجلّ `games/running.ts` الذي يكتب فيه مضيف ديسكورد، **وهذا شرط
 *    الجسر**: لاعب الجوال ينضم للعبة القناة لأن الجلسة كائن واحد بينهما.
 */

export function buildServer(): Server {
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

    // الداشبورد قبل الموجّه: متصفح يرسل نماذج ويحمل كوكيز، بينما هذا الموجّه
    // يتكلّم JSON ويحمل Authorization. خلطهما في جدول واحد يخلط نوعي الردّ.
    if (url.pathname === '/dash' || url.pathname.startsWith('/dash/')) {
      handleDashboard(req, res, url)
        .then((handled) => {
          if (!handled) text(res, 404, 'الصفحة غير موجودة')
        })
        .catch((error: unknown) => fail(res, error))
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
  return server
}

/** يشغّل الخادم ويعيده — يُستدعى من `main` أدناه أو من عملية البوت. */
export function startApiServer(port = config.port): Promise<Server> {
  const server = buildServer()
  return new Promise((resolve) => {
    server.listen(port, () => {
      console.log(`API يستمع على ${config.publicUrl} (منفذ ${port})`)
      console.log(`redirect_uri المسجّل يجب أن يكون: ${config.callbackUrl}`)
      if (!config.discord.botToken) {
        console.warn('DISCORD_TOKEN غير مضبوط — الأسماء والأفتارات في الصدارة ستكون معرّفات فقط')
      }
      resolve(server)
    })
  })
}

/**
 * `npm run api` وحده يشغّل خادمًا هنا. الاستيراد من عملية البوت لا يشغّل شيئًا،
 * وإلا لاستمع منفذان على نفس الرقم عند تفعيل `API_IN_PROCESS`.
 */
const entry = process.argv[1]
const isEntry = entry !== undefined && import.meta.url === pathToFileURL(entry).href

if (isEntry) {
  const server = await startApiServer()

  const shutdown = async (signal: string): Promise<void> => {
    console.log(`${signal} — إطفاء الـ API`)
    // اللاعبون المنتظرون داخل حلقة لعبة يخرجون بدل أن يعلقوا حتى انتهاء المهلة
    abortAll()
    server.close()
    await disconnectDb()
    process.exit(0)
  }

  process.on('SIGINT', () => void shutdown('SIGINT'))
  process.on('SIGTERM', () => void shutdown('SIGTERM'))
}
