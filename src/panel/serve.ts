import { createServer, type Server } from 'node:http'
import { advertise } from './discovery.ts'
import { handleControl } from './mount.ts'
import { printPanelUrls } from './net.ts'
import { currentCode } from './session.ts'

/**
 * خادم التحكّم المحلي — منفذ خاص داخل عمليّة البوت.
 *
 * ————————————————— لماذا منفذ مستقل عن الـ API —————————————————
 *
 * خادم الـ API يرمي عند الإقلاع بلا `API_JWT_SECRET` و`DISCORD_CLIENT_SECRET`،
 * وهو محقّ: تطبيق موزَّع على أجهزة الناس بلا توقيع جلسات لا يُشغَّل. لكن ربط
 * لوحة التحكّم بذلك يعني أن من لم يملأ أسرار تطبيق الجوال لا يملك لوحة أصلًا.
 *
 * ولهذا يقلع وحده وبلا إعداد: يولّد سرّه، ويطبع رمزه، ويستمع، ويعلن نفسه على
 * الشبكة. وهذا هو معنى «محلي بالكامل» عمليًّا — لا ملف بيئة يُملأ ولا نفق
 * يُفتح ولا خادم يُستأجر.
 */

const DEFAULT_PORT = 4590

export function panelPort(): number {
  const asked = Number(process.env['PANEL_PORT'] ?? DEFAULT_PORT)
  return Number.isInteger(asked) && asked > 0 && asked < 65_536 ? asked : DEFAULT_PORT
}

export function buildControlServer(): Server {
  return createServer((req, res) => {
    let url: URL
    try {
      url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`)
    } catch {
      res.writeHead(400).end()
      return
    }

    /**
     * سطر لكل طلب.
     *
     * الجهاز الذي لا يصل والجهاز الذي يصل ويُرفض عطلان مختلفان تمامًا، ومن
     * غير هذا السطر يظهران في التطبيق برسالة واحدة: «تعذّر الاتصال».
     */
    const started = Date.now()
    const from = req.socket.remoteAddress?.replace('::ffff:', '') ?? '?'
    res.on('finish', () => {
      console.log(
        `[مقود] ${req.method} ${url.pathname} -> ${res.statusCode} · ${from} · ${Date.now() - started}ms`,
      )
    })

    if (!url.pathname.startsWith('/ctl')) {
      res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' })
      res.end('مِقود — خادم التحكّم المحلي لبوت Games. افتح التطبيق على جوالك.\n')
      return
    }

    handleControl(req, res, url)
      .then((handled) => {
        if (!handled && !res.headersSent) {
          res.writeHead(404, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'مسار غير معروف' }))
        }
      })
      .catch((error: unknown) => {
        console.error('[مقود] خطأ غير متوقّع:', error)
        if (!res.headersSent) {
          res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' })
          res.end(JSON.stringify({ error: 'خطأ في الخادم' }))
        }
      })
  })
}

export function startPanel(port = panelPort()): Promise<Server> {
  const server = buildControlServer()

  return new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, () => {
      printPanelUrls(port)
      console.log(`   رمز الاقتران: ${currentCode()}`)
      advertise(port, null)
      resolve(server)
    })
  })
}
