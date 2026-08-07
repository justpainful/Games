/**
 * فحص طبقة المصادقة والصلاحيات في الداشبورد — بلا شبكة ولا قاعدة بيانات.
 *
 *   npx tsx scripts/dash-check.ts
 *
 * كل ما يُفحص هنا هو ما لا يمسكه `tsc`: توقيع الكوكي والتحقّق منه، رفض المزوّر
 * والمنتهي، رفض CSRF خاطئ، رفض من لا يملك `MANAGE_GUILD`، وتحقّق المدخلات لكل
 * فعل من أفعال `DashAction`.
 *
 * الأسرار هنا وهمية وتُضبط قبل تحميل أي وحدة. `dotenv` لا يستبدل متغيّرًا
 * موجودًا، فالفحص لا يلمس `.env` الحقيقي ولا يعتمد عليه.
 */

process.env['API_JWT_SECRET'] ??= 'dash-check-only-not-a-real-secret-0123456789'
process.env['DISCORD_APP_ID'] ??= '100000000000000001'
process.env['DISCORD_CLIENT_ID'] ??= '100000000000000001'
process.env['DISCORD_CLIENT_SECRET'] ??= 'dash-check-client-secret'
process.env['DISCORD_TOKEN'] ??= 'dash-check-bot-token'
process.env['DATABASE_URL'] ??= 'postgresql://check:check@localhost:5432/check'
// نطاق https حتى نتأكّد أن الكوكي يخرج بـ Secure في الإنتاج
process.env['DASH_PUBLIC_URL'] ??= 'https://dash.example.com'

const { hmac } = await import('../src/api/jwt.ts')
const { signToken } = await import('../src/api/jwt.ts')
const auth = await import('../src/dashboard/auth.ts')
const csrf = await import('../src/dashboard/csrf.ts')
const guard = await import('../src/dashboard/guard.ts')
const actions = await import('../src/dashboard/actions.ts')

import type { IncomingMessage } from 'node:http'
import type { DashAction, WebUser } from '../src/dashboard/types.ts'
import type { GuildGrant } from '../src/dashboard/guard.ts'

// ————————————————————— أدوات —————————————————————

let failed = 0
let passed = 0
let section = ''

function group(name: string): void {
  section = name
  console.log(`\n— ${name}`)
}

function ok(condition: boolean, label: string): void {
  if (condition) {
    passed++
    console.log(`  ✓ ${label}`)
  } else {
    failed++
    console.error(`  ✗ ${section}: ${label}`)
  }
}

const USER: WebUser = {
  id: '200000000000000001',
  username: 'kuroi',
  displayName: 'كوروي',
  avatarHash: 'abc123',
}

/** طلب وهمي بكوكي — لا خادم ولا مقبس. */
function fakeReq(cookie?: string): IncomingMessage {
  return { headers: cookie === undefined ? {} : { cookie } } as IncomingMessage
}

/** نفس اشتقاق سرّ الجلسة داخل `auth.ts` — يتيح تزوير رموز بمفتاح صحيح. */
const SESSION_SECRET = hmac('dashboard:session:v1', process.env['API_JWT_SECRET'] ?? '')

function forge(header: object, claims: object, secret = SESSION_SECRET): string {
  const head = Buffer.from(JSON.stringify(header)).toString('base64url')
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url')
  return `${head}.${payload}.${hmac(`${head}.${payload}`, secret)}`
}

const future = Math.floor(Date.now() / 1000) + 3600
const goodClaims = {
  t: 'dash',
  sub: USER.id,
  sid: 'sid-1',
  u: USER.username,
  d: USER.displayName,
  a: USER.avatarHash,
  iat: Math.floor(Date.now() / 1000),
  exp: future,
}

// ————————————————————— 1. كوكي الجلسة —————————————————————

group('توقيع الجلسة والتحقّق منها')

const sid = auth.newSessionId()
const token = auth.signSession(USER, sid)
const claims = auth.verifySession(token)

ok(claims !== null, 'رمز سليم يُقبل')
ok(claims?.sub === USER.id, 'المعرّف يعود كما هو')
ok(claims?.sid === sid, 'معرّف الجلسة يعود كما هو')
ok(claims?.d === USER.displayName, 'الاسم الظاهر محفوظ داخل الرمز')
ok(auth.newSessionId() !== sid, 'كل جلسة تحصل على معرّف جديد')

const parts = token.split('.')
const flipped = `${parts[0]}.${parts[1]}.${(parts[2] ?? '').slice(0, -2)}xy`
ok(auth.verifySession(flipped) === null, 'بصمة مزوّرة تُرفض')

const swappedPayload = `${parts[0]}.${Buffer.from(
  JSON.stringify({ ...goodClaims, sub: '999999999999999999' }),
).toString('base64url')}.${parts[2]}`
ok(auth.verifySession(swappedPayload) === null, 'تبديل الحمولة مع إبقاء البصمة يُرفض')

ok(auth.verifySession(auth.signSession(USER, sid, -10)) === null, 'رمز منتهٍ يُرفض')
ok(auth.verifySession('') === null, 'رمز فارغ يُرفض')
ok(auth.verifySession('a.b') === null, 'رمز بجزأين يُرفض')
ok(auth.verifySession(`${'x'.repeat(5000)}.y.z`) === null, 'رمز ضخم يُرفض قبل حساب البصمة')

ok(
  auth.verifySession(forge({ alg: 'HS256', typ: 'JWT' }, goodClaims, 'another-secret')) === null,
  'رمز موقّع بسرّ آخر يُرفض',
)
ok(
  auth.verifySession(forge({ alg: 'none', typ: 'JWT' }, goodClaims)) === null,
  'ترويسة alg=none تُرفض ولو صحّت البصمة',
)
ok(
  auth.verifySession(forge({ alg: 'HS256', typ: 'JWT' }, { ...goodClaims, t: 'api' })) === null,
  'رمز من نوع آخر (غير dash) يُرفض',
)
ok(
  auth.verifySession(forge({ alg: 'HS256', typ: 'JWT' }, { ...goodClaims, sid: '' })) === null,
  'رمز بلا معرّف جلسة يُرفض',
)
ok(
  auth.verifySession(signToken(USER.id, process.env['API_JWT_SECRET'] ?? '', 3600)) === null,
  'رمز جلسة تطبيق الجوال لا يصلح ككوكي داشبورد',
)

group('قراءة الكوكي')

ok(auth.readSession(fakeReq()) === null, 'طلب بلا كوكي = لا جلسة')
ok(auth.readSession(fakeReq('other=1')) === null, 'كوكي بلا اسم الجلسة = لا جلسة')
ok(auth.readSession(fakeReq(`${auth.COOKIE_NAME}=garbage`)) === null, 'كوكي عشوائي يُرفض')
ok(
  auth.readSession(fakeReq(`a=1; ${auth.COOKIE_NAME}=${token}; b=2`))?.id === USER.id,
  'الجلسة تُقرأ من بين كوكيز أخرى',
)
ok(auth.readSessionId(fakeReq(`${auth.COOKIE_NAME}=${token}`)) === sid, 'معرّف الجلسة يُقرأ')

const cookie = auth.buildSessionCookie(token, 3600)
ok(cookie.includes('HttpOnly'), 'الكوكي HttpOnly')
ok(cookie.includes('SameSite=Lax'), 'الكوكي SameSite=Lax')
ok(cookie.includes('Path=/dash'), 'الكوكي محصور بـ Path=/dash')
ok(cookie.includes('Secure'), 'الكوكي Secure على نطاق https')
ok(cookie.includes('Max-Age=3600'), 'الكوكي بعمر محدّد')
ok(auth.buildSessionCookie('', 0).includes('Max-Age=0'), 'الخروج يُصدر كوكي بعمر صفر')

group('وجهة العودة والحالة الموقّعة')

ok(auth.isSafeReturn('/dash') && auth.isSafeReturn('/dash/g/1/games'), 'مسارات الداشبورد مقبولة')
ok(!auth.isSafeReturn('https://evil.example'), 'عنوان خارجي مرفوض')
ok(!auth.isSafeReturn('//evil.example'), 'مسار بروتوكول-نسبي مرفوض')
ok(!auth.isSafeReturn('/dash//evil.example'), 'حيلة /dash// مرفوضة')
ok(!auth.isSafeReturn('/dashboard-evil'), 'بادئة مشابهة مرفوضة')
ok(auth.readState('garbage') === null, 'حالة عشوائية تُرفض')
ok(auth.readState('a.b.c') === null, 'حالة بثلاثة أجزاء تُرفض')

// ————————————————————— 2. CSRF —————————————————————

group('رمز CSRF')

const csrfToken = csrf.tokenFor(sid)
ok(csrf.matches(sid, csrfToken), 'الرمز الصحيح يُقبل')
ok(!csrf.matches(sid, `${csrfToken}x`), 'رمز بطول مختلف يُرفض')
ok(!csrf.matches(sid, csrf.tokenFor('sid-other')), 'رمز جلسة أخرى يُرفض')
ok(!csrf.matches(sid, ''), 'رمز فارغ يُرفض')
ok(!csrf.matches(sid, undefined), 'رمز مفقود يُرفض')
ok(!csrf.matches(sid, ['a', 'b']), 'حقل مكرّر (مصفوفة) يُرفض')
ok(!csrf.matches('', csrfToken), 'بلا جلسة لا يُقبل أي رمز')
ok(csrf.tokenFor(sid) === csrfToken, 'الرمز ثابت لنفس الجلسة')

const authed = fakeReq(`${auth.COOKIE_NAME}=${token}`)
ok(csrf.verifyCsrf(authed, csrfToken), 'التحقّق من الطلب المسجَّل يمرّ')
ok(!csrf.verifyCsrf(fakeReq(), csrfToken), 'طلب بلا جلسة يُرفض ولو حمل رمزًا صحيحًا')
ok(
  csrf.verifyCsrfForm(authed, new URLSearchParams({ [csrf.CSRF_FIELD]: csrfToken })),
  'قراءة الرمز من جسم النموذج',
)
ok(
  !csrf.verifyCsrfForm(authed, new URLSearchParams({ action: 'setPrefix' })),
  'نموذج بلا حقل csrf يُرفض',
)
ok(csrf.csrfField(authed).value.includes(csrfToken), 'الحقل المخفي يحمل الرمز')
ok(csrf.csrfTokenFor(fakeReq()) === '', 'لا رمز لمن لا جلسة له')

// ————————————————————— 3. الصلاحيات —————————————————————

group('MANAGE_GUILD')

const GUILD = '300000000000000001'
const OTHER = '300000000000000002'
const NO_BOT = '300000000000000003'

function grant(id: string, permissions: bigint, owner = false): GuildGrant {
  return { id, name: `سيرفر ${id.slice(-1)}`, iconHash: null, permissions, owner }
}

const MANAGE = 0x20n
const CHAT_ONLY = 0x800n // SEND_MESSAGES وحده
const ALL_BUT_MANAGE = 0x7fffffffffffn & ~MANAGE

const grants: GuildGrant[] = [
  grant(GUILD, MANAGE | CHAT_ONLY),
  grant(OTHER, CHAT_ONLY),
  grant(NO_BOT, MANAGE),
]
const botGuilds = new Set([GUILD, OTHER])

ok(guard.canManage(grant(GUILD, MANAGE)), 'من يملك MANAGE_GUILD يمرّ')
ok(guard.canManage(grant(GUILD, 0n, true)), 'مالك السيرفر يمرّ ولو بأذونات صفر')
ok(!guard.canManage(grant(GUILD, CHAT_ONLY)), 'من يملك الدردشة فقط لا يمرّ')
ok(!guard.canManage(grant(GUILD, ALL_BUT_MANAGE)), 'كل الأذونات عدا MANAGE_GUILD لا تمرّ')

ok(guard.accessFrom(grants, botGuilds, GUILD).allowed, 'سيرفر يديره والبوت فيه: مسموح')
ok(!guard.accessFrom(grants, botGuilds, OTHER).allowed, 'عضو بلا صلاحية: ممنوع')
ok(!guard.accessFrom(grants, botGuilds, NO_BOT).allowed, 'صلاحية بلا بوت: ممنوع')
ok(
  !guard.accessFrom(grants, botGuilds, '300000000000000009').allowed,
  'سيرفر ليس فيه أصلًا: ممنوع',
)
ok(!guard.accessFrom([], botGuilds, GUILD).allowed, 'بلا أي سيرفرات: ممنوع')
ok(!guard.accessFrom(grants, botGuilds, '12').allowed, 'معرّف غير صالح: ممنوع')
ok(
  !guard.accessFrom(grants, botGuilds, `${GUILD} `).allowed,
  'معرّف بمسافة زائدة لا يطابق: ممنوع',
)

const verdictOther = guard.accessFrom(grants, botGuilds, OTHER)
const verdictUnknown = guard.accessFrom(grants, botGuilds, '300000000000000009')
ok(
  !verdictOther.allowed &&
    !verdictUnknown.allowed &&
    verdictOther.reason === verdictUnknown.reason,
  'رسالة واحدة لغير العضو ولغير المخوَّل — لا تسريب لوجود السيرفر',
)

const listed = guard.manageable(grants, botGuilds)
ok(listed.length === 2, 'القائمة تضمّ ما يديره فقط')
ok(listed.every((row) => row.id !== OTHER), 'السيرفر بلا صلاحية غير مدرج')
ok(listed.find((row) => row.id === NO_BOT)?.botPresent === false, 'السيرفر بلا بوت مدرج بعلامته')
ok(listed[0]?.id === GUILD, 'ما فيه البوت يتصدّر القائمة')

ok(guard.isSnowflake('123456789012345678'), 'معرّف من 18 خانة صالح')
ok(!guard.isSnowflake('1234567890123456'), 'معرّف من 16 خانة مرفوض')
ok(!guard.isSnowflake('123456789012345678901'), 'معرّف من 21 خانة مرفوض')
ok(!guard.isSnowflake('12345678901234567a'), 'معرّف بحرف مرفوض')
ok(guard.asGrant({ id: GUILD, name: 'x', permissions: '32' })?.permissions === 32n, 'أذونات نصية')
ok(guard.asGrant({ id: 'nope', name: 'x' }) === null, 'صفّ بمعرّف فاسد يُهمَل')

// ————————————————————— 4. تحقّق المدخلات —————————————————————

group('تحقّق مدخلات الأفعال')

const KEYS = new Set(['xo', 'roulette', 'mafia'])
const USER_ID = '200000000000000002'
const ROLE_ID = '400000000000000001'
const CHANNEL_ID = '500000000000000001'

const seen = new Set<string>()

function accept(action: DashAction, label: string): void {
  seen.add(action.kind)
  const problem = actions.validateAction(action, KEYS)
  ok(problem === null, `${label} — يُقبل${problem ? ` (رُفض: ${problem})` : ''}`)
}

function reject(action: DashAction, label: string): void {
  seen.add(action.kind)
  ok(actions.validateAction(action, KEYS) !== null, `${label} — يُرفض`)
}

accept({ kind: 'setPrefix', prefix: '!' }, 'بريفكس من حرف')
accept({ kind: 'setPrefix', prefix: '؟؟' }, 'بريفكس عربي')
reject({ kind: 'setPrefix', prefix: '' }, 'بريفكس فارغ')
reject({ kind: 'setPrefix', prefix: '!!!!!!' }, 'بريفكس من ستة أحرف')
reject({ kind: 'setPrefix', prefix: 'a'.repeat(500) }, 'بريفكس طويل جدًا')
reject({ kind: 'setPrefix', prefix: '! ' }, 'بريفكس بمسافة')

accept({ kind: 'togglePrefix', enabled: false }, 'تعطيل البريفكس')

accept({ kind: 'setGamesChannel', channelId: CHANNEL_ID }, 'قناة بمعرّف صالح')
accept({ kind: 'setGamesChannel', channelId: null }, 'رفع تقييد القناة')
reject({ kind: 'setGamesChannel', channelId: '12' }, 'قناة بمعرّف قصير')
reject({ kind: 'setGamesChannel', channelId: '<#12345678901234567>' }, 'قناة بصيغة منشن')

accept({ kind: 'setNickname', nickname: 'ألعابنا' }, 'اسم مستعار عادي')
accept({ kind: 'setNickname', nickname: null }, 'إزالة الاسم المستعار')
reject({ kind: 'setNickname', nickname: '   ' }, 'اسم مستعار من مسافات')
reject({ kind: 'setNickname', nickname: 'ن'.repeat(33) }, 'اسم مستعار أطول من 32')

accept({ kind: 'addRole', role: 'ADMIN', roleId: ROLE_ID }, 'إضافة رول إدارة')
accept({ kind: 'removeRole', role: 'POINTS', roleId: ROLE_ID }, 'إزالة رول نقاط')
reject(
  { kind: 'addRole', role: 'OWNER' as 'ADMIN', roleId: ROLE_ID },
  'نوع صلاحية مخترع',
)
reject({ kind: 'addRole', role: 'GAMES', roleId: 'everyone' }, 'رول بمعرّف نصي')

accept({ kind: 'addAuthorized', userId: USER_ID }, 'إضافة مصرَّح له')
accept({ kind: 'removeAuthorized', userId: USER_ID }, 'إزالة مصرَّح له')
reject({ kind: 'addAuthorized', userId: '<@200000000000000002>' }, 'مصرَّح له بصيغة منشن')

accept({ kind: 'toggleGame', gameKey: 'xo', enabled: false }, 'تعطيل لعبة موجودة')
reject({ kind: 'toggleGame', gameKey: 'not-a-game', enabled: true }, 'لعبة مخترعة')
reject({ kind: 'toggleGame', gameKey: '', enabled: true }, 'مفتاح لعبة فارغ')

accept({ kind: 'setGameImage', gameKey: 'xo', imageUrl: 'https://cdn.x.com/a.png' }, 'صورة https')
accept({ kind: 'setGameImage', gameKey: 'xo', imageUrl: null }, 'إعادة الصورة الافتراضية')
reject({ kind: 'setGameImage', gameKey: 'xo', imageUrl: 'http://cdn.x.com/a.png' }, 'صورة http')
reject(
  { kind: 'setGameImage', gameKey: 'xo', imageUrl: 'javascript:alert(1)' },
  'رابط javascript:',
)
reject({ kind: 'setGameImage', gameKey: 'xo', imageUrl: 'data:image/png;base64,AA' }, 'رابط data:')
reject({ kind: 'setGameImage', gameKey: 'xo', imageUrl: 'ليس رابطًا' }, 'رابط غير صالح')
reject(
  { kind: 'setGameImage', gameKey: 'xo', imageUrl: `https://x.com/${'a'.repeat(600)}.png` },
  'رابط صورة طويل جدًا',
)
reject({ kind: 'setGameImage', gameKey: 'nope', imageUrl: null }, 'صورة للعبة مخترعة')

accept({ kind: 'setGameSetting', gameKey: 'xo', field: 'rounds', value: '5' }, 'إعداد لعبة')
reject({ kind: 'setGameSetting', gameKey: 'xo', field: '__proto__', value: '5' }, 'حقل __proto__')
reject({ kind: 'setGameSetting', gameKey: 'xo', field: '1bad', value: '5' }, 'حقل يبدأ برقم')
reject(
  { kind: 'setGameSetting', gameKey: 'xo', field: 'rounds', value: 'v'.repeat(500) },
  'قيمة إعداد ضخمة',
)

accept({ kind: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: 10 }, 'منح عشر نقاط')
accept({ kind: 'awardPoints', userId: USER_ID, wallet: 'team', amount: -5 }, 'خصم خمس نقاط')
reject(
  { kind: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: 9_999_999_999 },
  'نقاط ضخمة',
)
reject(
  { kind: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: Number.MAX_SAFE_INTEGER },
  'نقاط بأقصى عدد صحيح',
)
reject({ kind: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: 1.5 }, 'نقاط كسرية')
reject({ kind: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: Number.NaN }, 'نقاط NaN')
reject({ kind: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: Infinity }, 'نقاط لانهائية')
reject({ kind: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: 0 }, 'صفر نقطة')
reject(
  { kind: 'awardPoints', userId: USER_ID, wallet: 'bank' as 'solo', amount: 5 },
  'محفظة مخترعة',
)
reject({ kind: 'awardPoints', userId: 'abc', wallet: 'solo', amount: 5 }, 'نقاط لمعرّف فاسد')

accept({ kind: 'resetPlayer', userId: USER_ID }, 'تصفير لاعب')
reject({ kind: 'resetPlayer', userId: '' }, 'تصفير بمعرّف فارغ')

const ALL_KINDS = [
  'setPrefix',
  'togglePrefix',
  'setGamesChannel',
  'setNickname',
  'addRole',
  'removeRole',
  'addAuthorized',
  'removeAuthorized',
  'toggleGame',
  'setGameImage',
  'setGameSetting',
  'awardPoints',
  'resetPlayer',
]
const missing = ALL_KINDS.filter((kind) => !seen.has(kind))
ok(missing.length === 0, `كل أفعال DashAction مفحوصة${missing.length ? ` — ناقص: ${missing}` : ''}`)

// ————————————————————— 5. قراءة النموذج —————————————————————

group('قراءة نموذج POST')

function form(pairs: Record<string, string>): URLSearchParams {
  return new URLSearchParams(pairs)
}

const parsedPrefix = actions.parseAction(form({ action: 'setPrefix', prefix: '؟' }))
ok(parsedPrefix?.kind === 'setPrefix', 'setPrefix يُقرأ')

const parsedToggle = actions.parseAction(form({ action: 'togglePrefix' }))
ok(
  parsedToggle?.kind === 'togglePrefix' && parsedToggle.enabled === false,
  'خانة اختيار غائبة تعني مطفأة',
)

const parsedAward = actions.parseAction(
  form({ action: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: '7' }),
)
ok(parsedAward?.kind === 'awardPoints' && parsedAward.amount === 7, 'النقاط تُقرأ عددًا')

const parsedEmptyAmount = actions.parseAction(
  form({ action: 'awardPoints', userId: USER_ID, wallet: 'solo', amount: '' }),
)
ok(
  parsedEmptyAmount !== null && actions.validateAction(parsedEmptyAmount, KEYS) !== null,
  'حقل نقاط فارغ يسقط في التحقّق لا يصير صفرًا صامتًا',
)

const parsedChannel = actions.parseAction(form({ action: 'setGamesChannel', channelId: '' }))
ok(
  parsedChannel?.kind === 'setGamesChannel' && parsedChannel.channelId === null,
  'حقل قناة فارغ يعني إزالة التقييد',
)

ok(actions.parseAction(form({ action: 'dropDatabase' })) === null, 'فعل مخترع يُرفض')
ok(actions.parseAction(form({})) === null, 'نموذج بلا فعل يُرفض')

const parsedLong = actions.parseAction(form({ action: 'setPrefix', prefix: 'x'.repeat(300) }))
ok(
  parsedLong !== null && actions.validateAction(parsedLong, KEYS) !== null,
  'بريفكس طويل من نموذج حقيقي يُرفض',
)

// ————————————————————— الخلاصة —————————————————————

console.log(`\n${passed} فحصًا ناجحًا، ${failed} فاشلًا.`)
if (failed > 0) process.exit(1)
console.log('طبقة المصادقة والصلاحيات سليمة.')
