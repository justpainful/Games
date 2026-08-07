import { fileURLToPath, pathToFileURL } from 'node:url'
import path from 'node:path'
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright'
import { cssVariables, scene } from '../design/tokens.ts'

const here = path.dirname(fileURLToPath(import.meta.url))
const SHELL = pathToFileURL(path.join(here, '..', 'design', 'shell.html')).href

const POOL_SIZE = Number(process.env.RENDER_POOL_SIZE ?? 4)
const TIMEOUT_MS = Number(process.env.RENDER_TIMEOUT_MS ?? 8000)

/**
 * تجمّع صفحات دائم.
 *
 * إنشاء الصفحة وتحميل الخطوط هو الجزء الغالي، لا الرندر نفسه. لذلك
 * تُجهّز الصفحات مرة واحدة، وكل رندر بعدها يبدّل محتوى #root فقط.
 */
let browser: Browser | null = null
let context: BrowserContext | null = null

const idle: Page[] = []
const waiting: ((page: Page) => void)[] = []
let created = 0

async function makePage(): Promise<Page> {
  if (!context) throw new Error('لم تُشغَّل نافذة المتصفح بعد — استدعِ startRenderer() أولًا')
  const page = await context.newPage()
  await page.goto(SHELL, { waitUntil: 'load' })
  // التوكنات تُحقن من tokens.ts فلا تتفرّق القيم بين TS و CSS
  await page.evaluate((css) => {
    document.getElementById('tokens')!.textContent = css
  }, cssVariables())
  // الخطوط تُنتظر مرة واحدة هنا، لا مع كل صورة
  await page.evaluate(() => document.fonts.ready.then(() => undefined))
  return page
}

export async function startRenderer(): Promise<void> {
  if (browser) return
  browser = await chromium.launch({ args: ['--font-render-hinting=none'] })
  context = await browser.newContext({
    deviceScaleFactor: 2,
    // المنفذ يتبع عرض المشهد فلا يحدث تمرير أفقي أثناء اللقطة
    viewport: { width: scene.width, height: scene.minHeight },
  })
  const pages = await Promise.all(Array.from({ length: POOL_SIZE }, () => makePage()))
  idle.push(...pages)
  created = pages.length
}

export async function stopRenderer(): Promise<void> {
  await context?.close()
  await browser?.close()
  browser = null
  context = null
  idle.length = 0
  waiting.length = 0
  created = 0
}

async function acquire(): Promise<Page> {
  const free = idle.pop()
  if (free) return free
  if (created < POOL_SIZE) {
    created++
    try {
      return await makePage()
    } catch (err) {
      created--
      throw err
    }
  }
  return new Promise<Page>((resolve) => waiting.push(resolve))
}

function release(page: Page): void {
  const next = waiting.shift()
  if (next) next(page)
  else idle.push(page)
}

/** يستبدل صفحة تعطّلت بأخرى نظيفة بدل أن يُنقص التجمّع بصمت. */
async function replace(dead: Page): Promise<void> {
  await dead.close().catch(() => {})
  try {
    release(await makePage())
  } catch {
    created--
  }
}

/**
 * يرسم HTML مشهد كامل ويعيد PNG.
 * اللقطة تُؤخذ لعنصر `.scene` وحده، فيتمدد الارتفاع مع المحتوى تلقائيًا.
 */
export async function shoot(sceneHtml: string): Promise<Buffer> {
  const page = await acquire()
  try {
    await page.evaluate((h) => {
      document.getElementById('root')!.innerHTML = h
    }, sceneHtml)

    // الأفتارات تُفكّ قبل اللقطة وإلا خرجت الصورة بمربعات فارغة
    await page.evaluate(() =>
      Promise.all(Array.from(document.images).map((img) => img.decode().catch(() => undefined))).then(
        () => undefined,
      ),
    )

    const target = page.locator('.scene')
    const png = await target.screenshot({ type: 'png', timeout: TIMEOUT_MS })
    release(page)
    return png
  } catch (err) {
    await replace(page)
    throw err
  }
}
