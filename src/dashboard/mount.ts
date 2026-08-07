import fs from 'node:fs/promises'
import type { IncomingMessage, ServerResponse } from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseAction, runAction } from './actions.ts'
import { dashCallback, dashLogin, dashLogout, readSession } from './auth.ts'
import { csrfTokenFor, verifyCsrfForm } from './csrf.ts'
import { guildSettings, leaders } from './data.ts'
import { access, managedGuilds } from './guard.ts'
import { html, readForm, redirect, routeOf, text } from './http.ts'
import { stylesheet } from './layout.ts'
import {
  gamesPage,
  generalPage,
  guildsPage,
  loginPage,
  pointsPage,
  rolesPage,
} from './pages/index.ts'

/**
 * موجّه الداشبورد — يوصل المصادقة والصلاحيات والصفحات والأفعال.
 *
 * ترتيب كل طلب POST ثابت ولا يُختصر:
 *   جلسة → CSRF → تحليل الفعل → تنفيذ (وهو يعيد فحص الصلاحية بنفسه)
 * الفحص المزدوج للصلاحية مقصود: الموجّه يحميه من عرض صفحة، و`runAction`
 * يحميه من تنفيذ فعل. سقوط أحدهما لا يكفي لاختراق.
 */

const here = path.dirname(fileURLToPath(import.meta.url))
const FONTS: Record<string, string> = {
  cairo: path.join(here, '..', 'design', 'fonts', 'Cairo.ttf'),
  baloo: path.join(here, '..', 'design', 'fonts', 'BalooBhaijaan2.ttf'),
}

/** الرسالة تُمرَّر في المسار بعد إعادة التوجيه — لا حالة على الخادم. */
function flashOf(url: URL): { ok: boolean; message: string } | null {
  const message = url.searchParams.get('m')
  if (!message) return null
  return { ok: url.searchParams.get('ok') === '1', message: message.slice(0, 200) }
}

function back(res: ServerResponse, guildId: string, page: string, ok: boolean, message: string): void {
  const q = `?ok=${ok ? '1' : '0'}&m=${encodeURIComponent(message)}`
  redirect(res, `/dash/g/${guildId}/${page}${q}`)
}

/** `true` إن كان الطلب للداشبورد وعُولج هنا. */
export async function handleDashboard(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
): Promise<boolean> {
  const route = routeOf(url.pathname)
  if (route.kind === 'unknown') return false

  switch (route.kind) {
    case 'style':
      res.writeHead(200, {
        'Content-Type': 'text/css; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
      })
      res.end(stylesheet())
      return true

    case 'font': {
      const file = FONTS[route.name]
      if (!file) {
        text(res, 'خط غير معروف', 404)
        return true
      }
      const buf = await fs.readFile(file).catch(() => null)
      if (!buf) {
        text(res, 'تعذّر تحميل الخط', 404)
        return true
      }
      res.writeHead(200, {
        'Content-Type': 'font/ttf',
        // الخط لا يتغيّر — سنة كاملة تمنع إعادة تحميله مع كل صفحة
        'Cache-Control': 'public, max-age=31536000, immutable',
      })
      res.end(buf)
      return true
    }

    case 'login':
      dashLogin(req, res)
      return true

    case 'callback':
      await dashCallback(req, res)
      return true

    case 'logout':
      dashLogout(req, res)
      return true

    case 'home': {
      const user = readSession(req)
      if (!user) {
        html(res, loginPage())
        return true
      }
      const guilds = await managedGuilds(user)
      html(res, guildsPage(user, guilds, flashOf(url) ?? undefined))
      return true
    }

    case 'invite': {
      // دعوة البوت لسيرفر بعينه. الصلاحيات هي ما يحتاجه فعلًا لا أكثر:
      // قراءة الرسائل وإرسالها والصور والأزرار — بلا Administrator.
      const clientId = process.env['DISCORD_CLIENT_ID'] ?? process.env['DISCORD_APP_ID'] ?? ''
      if (!clientId) {
        text(res, 'معرّف التطبيق غير مضبوط على الخادم.', 500)
        return true
      }
      const q = new URLSearchParams({
        client_id: clientId,
        scope: 'bot applications.commands',
        permissions: '277025508352',
        guild_id: route.guildId,
        disable_guild_select: 'true',
      })
      redirect(res, `https://discord.com/oauth2/authorize?${q.toString()}`)
      return true
    }

    case 'guild':
      await handleGuild(req, res, url, route.guildId, route.page)
      return true
  }
}

async function handleGuild(
  req: IncomingMessage,
  res: ServerResponse,
  url: URL,
  guildId: string,
  pageName: string,
): Promise<void> {
  const user = readSession(req)
  if (!user) {
    // بعد الدخول يعود لنفس الصفحة بدل أن يبدأ من الأول
    redirect(res, `/dash/login?next=${encodeURIComponent(url.pathname)}`)
    return
  }

  const granted = await access(user, guildId)
  if (!granted.allowed) {
    html(res, loginPage(), 403)
    return
  }
  const guild = granted.guild

  if (req.method === 'POST') {
    let form: URLSearchParams
    try {
      form = new URLSearchParams(Object.entries(await readForm(req)))
    } catch {
      back(res, guildId, pageName, false, 'الطلب أكبر من المسموح.')
      return
    }

    if (!verifyCsrfForm(req, form)) {
      // غالبًا جلسة انتهت في تبويب قديم لا هجوم — الرسالة تقول ماذا يفعل
      back(res, guildId, pageName, false, 'انتهت الجلسة. حدّث الصفحة وأعد المحاولة.')
      return
    }

    const action = parseAction(form)
    if (!action) {
      back(res, guildId, pageName, false, 'طلب غير مفهوم.')
      return
    }

    const result = await runAction(user, guildId, action)
    back(res, guildId, pageName, result.ok, result.message)
    return
  }

  const csrf = csrfTokenFor(req)
  const flash = flashOf(url) ?? undefined

  switch (pageName) {
    case 'general':
      html(res, generalPage(await guildSettings(guild), csrf, flash))
      return
    case 'roles':
      html(res, rolesPage(await guildSettings(guild), csrf, flash))
      return
    case 'games':
      html(res, gamesPage(await guildSettings(guild), csrf, flash))
      return
    case 'points':
      html(res, pointsPage(await leaders(guildId), csrf, guildId, guild, flash))
      return
    default:
      redirect(res, `/dash/g/${guildId}/general`)
  }
}
