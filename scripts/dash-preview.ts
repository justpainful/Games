/**
 * هارنس معاينة الداشبورد — يرندر كل صفحة ببيانات وهمية إلى `out/dash/`
 * كـ HTML قابل للفتح مباشرة، ثم يلتقط PNG لكل حالة.
 *
 * الحالات مختارة لتكسر التخطيط لا لتُجمّله: سيرفر بلا أيقونة، اسم لاتيني وسط
 * نص عربي، اسم لا ينتهي، اسم فيه `<script>`، سبع وعشرون لعبة في صفحة واحدة،
 * قوائم فارغة تمامًا، وعرض جوال 390px. ما ينجو من هذه القائمة ينجو في الخدمة.
 *
 * النصّ يُفحص أيضًا آليًا: أي هروب فاشل أو لون hex أو `left:`/`right:` صريح
 * يوقف السكربت — الفحص البصري وحده لا يرى ثغرة حقن.
 *
 *   npx tsx scripts/dash-preview.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { stylesheet } from '../src/dashboard/layout.ts'
import { generalPage } from '../src/dashboard/pages/general.ts'
import { gamesPage } from '../src/dashboard/pages/games.ts'
import { guildsPage } from '../src/dashboard/pages/guilds.ts'
import { loginPage } from '../src/dashboard/pages/login.ts'
import { pointsPage } from '../src/dashboard/pages/points.ts'
import { rolesPage } from '../src/dashboard/pages/roles.ts'
import type {
  GameSettingView,
  GuildSettingsView,
  LeaderView,
  ManagedGuild,
  WebUser,
} from '../src/dashboard/types.ts'
import { shoot, startRenderer, stopRenderer } from '../src/images/browser.ts'

const OUT = path.join(process.cwd(), 'out', 'dash')

/* ————————————————— بيانات وهمية ————————————————— */

const LONG = 'اسم طويل جدا جدا لا يتوقف عند حدود العمود ويستمر بلا رحمة ولا يقبل القسمة'
const LATIN = 'xX_Sniper_Xx'
const DOTTED = '.zja6'
/** يجب ألا يُنفَّذ ولا يظهر كوسم — يُفحص آليًا تحت. */
const XSS = '<script>alert(1)</script>'

const USER: WebUser = {
  id: '100000000000000001',
  username: 'kuroi',
  displayName: DOTTED,
  avatarHash: 'a1',
}

const GUILDS: ManagedGuild[] = [
  { id: '200000000000000001', name: 'سيرفر الألعاب والتسليه', iconHash: 'ic1', botPresent: true },
  { id: '200000000000000002', name: LATIN, iconHash: null, botPresent: true },
  { id: '200000000000000003', name: DOTTED, iconHash: 'ic3', botPresent: false },
  { id: '200000000000000004', name: LONG, iconHash: null, botPresent: true },
  { id: '200000000000000005', name: XSS, iconHash: null, botPresent: false },
  { id: '200000000000000006', name: 'قيمز', iconHash: 'ic6', botPresent: true },
]

const GUILD = GUILDS[0]!

const CHANNELS = [
  { id: '300000000000000001', name: 'الالعاب-والتسليه-الجماعيه' },
  { id: '300000000000000002', name: 'general' },
  { id: '300000000000000003', name: DOTTED },
  { id: '300000000000000004', name: LONG },
  { id: '300000000000000005', name: XSS },
  { id: '300000000000000006', name: 'شات-الفويس' },
]

const ROLES = [
  { id: '400000000000000001', name: 'المشرفين', color: 0xe0_3a_2f },
  { id: '400000000000000002', name: 'Moderator', color: 0x3b_a5_5d },
  { id: '400000000000000003', name: DOTTED, color: 0 },
  { id: '400000000000000004', name: LONG, color: 0x55_44_cc },
  { id: '400000000000000005', name: XSS, color: 0xfb_bf_1e },
  { id: '400000000000000006', name: 'العضو', color: 0 },
  { id: '400000000000000007', name: 'موزع النقاط', color: 0x88_22_99 },
]

const GAME_NAMES = [
  'أكس أو',
  'من الأعلى',
  'العواصم',
  'فكّك',
  'جمع',
  'خمّن',
  'معرفة',
  'مفرد',
  'قرا',
  'صراحة',
  'لو خيروك',
  'اسرع واحد',
  'كت تويت',
  'تحدي',
  'الكلمة الناقصة',
  'رتب الحروف',
  'مافيا',
  'روليت',
  'سباق',
  'ذاكرة',
  'الغاز',
  'اعلام',
  'اغاني',
  'افلام',
  'حزازير',
  LATIN,
  LONG,
]

function game(i: number, name: string): GameSettingView {
  const settings: Record<string, unknown>[] = [
    {},
    { roundSeconds: 60, hardMode: false },
    { roundSeconds: 45, hardMode: true, wordList: 'عام', maxPlayers: 12 },
  ]
  return {
    key: `game-${i + 1}`,
    name,
    tagline: i % 3 === 2 ? LONG : 'جولة قصيرة بين أعضاء السيرفر',
    enabled: i % 4 !== 3,
    imageUrl: i % 5 === 0 ? `https://cdn.example.com/games/cover-${i + 1}.png` : null,
    settings: settings[i % 3]!,
  }
}

const GAMES_27 = GAME_NAMES.map((n, i) => game(i, n))

const SETTINGS: GuildSettingsView = {
  guild: GUILD,
  prefix: '!',
  prefixEnabled: true,
  gamesChannel: CHANNELS[0]!.id,
  nickname: 'بوت الألعاب',
  roles: {
    ADMIN: [ROLES[0]!.id, ROLES[1]!.id],
    GAMES: [ROLES[2]!.id, ROLES[3]!.id, '499999999999999999'],
    POINTS: [ROLES[6]!.id],
  },
  authorized: ['100000000000000001', '100000000000000002', '100000000000000003'],
  games: GAMES_27,
  allRoles: ROLES,
  allChannels: CHANNELS,
}

/** الطرف الآخر: سيرفر جديد بلا شيء، والبوت لا يقرأ قنواته ولا رولاته. */
const EMPTY: GuildSettingsView = {
  guild: { id: '200000000000000009', name: XSS, iconHash: null, botPresent: true },
  prefix: '?',
  prefixEnabled: false,
  gamesChannel: '399999999999999999',
  nickname: null,
  roles: { ADMIN: [], GAMES: [], POINTS: [] },
  authorized: [],
  games: [],
  allRoles: [],
  allChannels: [],
}

const FEW: GuildSettingsView = { ...SETTINGS, games: GAMES_27.slice(0, 3) }

type Seed = {
  name: string
  hash: string | null
  roulette: number
  team: number
  solo: number
  played: number
  wins: number
}

const SEEDS: Seed[] = [
  { name: 'عبدالرحمن', hash: 'a', roulette: 482_930, team: 1_204_775, solo: 998_210, played: 12_480, wins: 3902 },
  { name: LATIN, hash: 'b', roulette: 120, team: 340, solo: 87, played: 61, wins: 9 },
  { name: DOTTED, hash: null, roulette: 5, team: 0, solo: 120, played: 8, wins: 2 },
  { name: LONG, hash: 'd', roulette: 0, team: 0, solo: 0, played: 0, wins: 0 },
  { name: XSS, hash: null, roulette: 7, team: 7, solo: 7, played: 3, wins: 1 },
  { name: 'سارة', hash: 'f', roulette: 900, team: 120, solo: 45, played: 40, wins: 12 },
  { name: 'Mohammed_2010', hash: 'g', roulette: 33, team: 0, solo: 9, played: 5, wins: 1 },
  { name: 'فهد', hash: null, roulette: 1, team: 2, solo: 3, played: 2, wins: 0 },
  { name: 'نورة', hash: 'i', roulette: 640, team: 88, solo: 12, played: 30, wins: 7 },
  { name: 'خالد', hash: 'j', roulette: 12, team: 12, solo: 12, played: 9, wins: 3 },
]

const LEADERS: LeaderView[] = SEEDS.map((s, i) => ({
  userId: `10000000000000000${i}`,
  displayName: s.name,
  avatarHash: s.hash,
  roulette: s.roulette,
  team: s.team,
  solo: s.solo,
  total: s.roulette + s.team + s.solo,
  gamesPlayed: s.played,
  wins: s.wins,
}))

const CSRF = 'csrf-token-preview'

/* ————————————————— الحالات ————————————————— */

type Case = { name: string; html: string; width?: number; open?: boolean }

const CASES: Case[] = [
  { name: 'login', html: loginPage() },
  { name: 'guilds', html: guildsPage(USER, GUILDS) },
  {
    name: 'guilds-empty',
    html: guildsPage(USER, [], { ok: false, message: 'ما قدرنا نقرأ سيرفراتك من ديسكورد.' }),
  },
  {
    name: 'general',
    html: generalPage(SETTINGS, CSRF, { ok: true, message: 'صار البريفكس «!» في هذا السيرفر.' }),
  },
  { name: 'general-empty', html: generalPage(EMPTY, CSRF) },
  { name: 'roles', html: rolesPage(SETTINGS, CSRF) },
  { name: 'roles-empty', html: rolesPage(EMPTY, CSRF) },
  { name: 'games-few', html: gamesPage(FEW, CSRF) },
  { name: 'games-27', html: gamesPage(SETTINGS, CSRF) },
  { name: 'games-empty', html: gamesPage(EMPTY, CSRF) },
  { name: 'points', html: pointsPage(LEADERS, CSRF, GUILD.id, GUILD) },
  { name: 'points-confirm', html: pointsPage(LEADERS.slice(0, 3), CSRF, GUILD.id, GUILD), open: true },
  { name: 'points-empty', html: pointsPage([], CSRF, GUILD.id) },

  // ————— جوال ضيّق —————
  { name: 'm-guilds', html: guildsPage(USER, GUILDS), width: 390 },
  { name: 'm-general', html: generalPage(SETTINGS, CSRF), width: 390 },
  { name: 'm-roles', html: rolesPage(SETTINGS, CSRF), width: 390 },
  { name: 'm-games', html: gamesPage(FEW, CSRF), width: 390 },
  { name: 'm-points', html: pointsPage(LEADERS.slice(0, 4), CSRF, GUILD.id, GUILD), width: 390 },
]

/* ————————————————— الفحص الآلي ————————————————— */

/** ما لا تراه العين: حقن ناجح، لون خارج التوكنات، أو اتجاه فيزيائي في RTL. */
function audit(name: string, doc: string): string[] {
  const bad: string[] = []
  const body = doc.slice(doc.indexOf('<body>'))

  if (body.includes('<script>alert(1)</script>')) bad.push('حقن: وسم script مرّ خامًا')
  if (/<bdi>[^<]*<script/i.test(body)) bad.push('حقن: وسم داخل bdi')
  if (/style="[^"]*#[0-9a-fA-F]{3,8}\b/.test(body)) bad.push('لون hex في style سطري')
  if (/style="[^"]*(?:^|[;\s])(?:left|right):/.test(body)) bad.push('اتجاه فيزيائي left/right')
  if (/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(body)) bad.push('إيموجي في الواجهة')

  // كل نموذج كتابة يحمل csrf و action
  const forms = body.match(/<form[\s\S]*?<\/form>/g) ?? []
  for (const f of forms) {
    if (!f.includes('name="csrf"')) bad.push('نموذج بلا csrf')
    if (!f.includes('name="action"')) bad.push('نموذج بلا action')
    if (!/method="post"/.test(f)) bad.push('نموذج ليس POST')
  }
  if (name.startsWith('general') && forms.length === 0) bad.push('لا نماذج في صفحة إعدادات')

  return [...new Set(bad)]
}

/* ————————————————— الإخراج ————————————————— */

/** بديل صور ديسكورد — الشبكة مقطوعة أثناء المعاينة والمربع الفارغ يخفي الخلل. */
function stub(seed: number): string {
  const hue = (seed * 47) % 360
  return (
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">` +
        `<rect width="120" height="120" fill="hsl(${hue} 45% 62%)"/>` +
        `<circle cx="60" cy="46" r="22" fill="rgba(255,255,255,.85)"/>` +
        `<ellipse cx="60" cy="108" rx="38" ry="30" fill="rgba(255,255,255,.85)"/>` +
        `</svg>`,
    )
  )
}

let seed = 0
function stubCdn(doc: string): string {
  return doc.replace(/https:\/\/cdn\.discordapp\.com\/[^"']+/g, () => stub(++seed))
}

const FONTS_FOR_FILE = `
@font-face{font-family:'Cairo';src:url('../../src/design/fonts/Cairo.ttf') format('truetype-variations');font-weight:200 1000}
@font-face{font-family:'Baloo';src:url('../../src/design/fonts/BalooBhaijaan2.ttf') format('truetype-variations');font-weight:400 800}
`

const NO_FONT_FACE = /@font-face\s*\{[^}]*\}/g

/** نسخة تُفتح من القرص: الخطوط بمسار نسبي بدل مسار الخدمة. */
function cssForFile(): string {
  return stylesheet().replace(NO_FONT_FACE, '') + FONTS_FOR_FILE
}

/**
 * نسخة تُحقن في قشرة الرندر: `shell.html` حمّل الخطوط أصلًا باسم
 * `Baloo Bhaijaan 2`، فإعادة تعريف `Baloo` بمسار الخدمة تفشل وتسقط للاحتياطي.
 */
function cssForShoot(): string {
  return stylesheet().replace(NO_FONT_FACE, '').replace(/'Baloo'/g, "'Baloo Bhaijaan 2'")
}

/** قواعد @media لا تشتغل داخل حاوية ضيّقة — منفذ الرندر عرضه 1500px دائمًا. */
const NARROW = `
.dash-preview .card{padding:14px}
.dash-preview .split{align-items:stretch}
`

function bodyOf(doc: string): string {
  const from = doc.indexOf('<body>') + '<body>'.length
  return doc.slice(from, doc.lastIndexOf('</body>'))
}

function toFragment(doc: string, width: number, narrow: boolean): string {
  const box = `width:${width}px;background:var(--color-paper);color:var(--color-ink)`
  return (
    `<style>${cssForShoot()}${narrow ? NARROW : ''}</style>` +
    `<div class="dash-preview" style="${box}">${bodyOf(doc)}</div>`
  )
}

function toFile(doc: string): string {
  return doc.replace(
    /<link rel="stylesheet" href="\/dash\/style\.css">/,
    `<style>${cssForFile()}</style>`,
  )
}

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true })

  let problems = 0
  const prepared = CASES.map((c) => {
    const raw = c.open ? c.html.replace(/<details>/g, '<details open>') : c.html
    const found = audit(c.name, raw)
    if (found.length > 0) {
      problems += found.length
      console.error(`  ✗ ${c.name}: ${found.join(' | ')}`)
    }
    return { ...c, doc: stubCdn(raw) }
  })

  for (const c of prepared) {
    await fs.writeFile(path.join(OUT, `${c.name}.html`), toFile(c.doc), 'utf8')
  }

  await startRenderer()
  // إحماء: الخطوط تُحمَّل عند أول استعمال، وأول لقطة بدونها تخرج بخط احتياطي
  await shoot(`<div class="scene" style="font-family:'Cairo'">مرحبا Baloo 123</div>`)

  for (const c of prepared) {
    const width = c.width ?? 1100
    const started = Date.now()
    const png = await shoot(toFragment(c.doc, width, width < 700), {
      selector: '.dash-preview',
    })
    await fs.writeFile(path.join(OUT, `${c.name}.png`), png)
    console.log(`${c.name}.png  ${width}px  ${(png.length / 1024).toFixed(0)}KB  ${Date.now() - started}ms`)
  }

  await stopRenderer()
  console.log(`\nتمّ. الملفات في ${OUT}`)
  if (problems > 0) {
    console.error(`\n${problems} مشكلة في الفحص الآلي.`)
    process.exit(1)
  }
}

main().catch(async (err) => {
  console.error(err)
  await stopRenderer()
  process.exit(1)
})
