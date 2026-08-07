import { cssVariables } from '../design/tokens.ts'
import { esc, html, raw, type Html } from '../scenes/html.ts'
import type { ManagedGuild, WebUser } from './types.ts'

/**
 * قشرة صفحات الداشبورد.
 *
 * HTML مُخدَّم من الخادم بلا إطار ولا خطوة بناء: الداشبورد نماذج وأزرار، وإضافة
 * SPA كاملة له تعني bundler وحالة عميل ومسار نشر ثانٍ مقابل لا شيء. النماذج
 * تعمل حتى بلا جافاسكربت، وهذا يجعل كل فعل كتابة قابلًا للاختبار بـ `curl`.
 *
 * الألوان تأتي من `design/tokens.ts` — نفس مصدر البوت والتطبيق، فلا تتفرّق
 * الهوية بين الأسطح الثلاثة.
 */

export const NAV = [
  { id: 'general', label: 'الإعدادات العامة', icon: 'gear' },
  { id: 'roles', label: 'الصلاحيات', icon: 'users' },
  { id: 'games', label: 'الألعاب', icon: 'play' },
  { id: 'points', label: 'النقاط', icon: 'star' },
] as const

export type NavId = (typeof NAV)[number]['id']

export function stylesheet(): string {
  return `${cssVariables()}
${DASH_CSS}`
}

export function page(opts: {
  title: string
  user?: WebUser | null
  guild?: ManagedGuild | null
  active?: NavId
  body: Html
  flash?: { ok: boolean; message: string } | null
}): string {
  const { title, user, guild, active, body, flash } = opts

  return `<!doctype html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<link rel="stylesheet" href="/dash/style.css">
</head>
<body>
${
  guild
    ? html`
        <header class="bar">
          <div class="bar__in">
            <span class="brand">Arcade</span>
            <span class="pill">${guild.name}</span>
            <span class="grow"></span>
            ${user ? html`<span class="who"><bdi>${user.displayName ?? user.username}</bdi></span>` : ''}
            <a class="btn btn--ghost" href="/dash">تبديل السيرفر</a>
            <a class="btn btn--ghost" href="/dash/logout">خروج</a>
          </div>
        </header>
        <nav class="tabs">
          <div class="tabs__in">
            ${NAV.map(
              (n) => html`<a
                class="tab ${raw(active === n.id ? 'tab--on' : '')}"
                href="/dash/g/${guild.id}/${n.id}"
                >${n.label}</a
              >`,
            )}
          </div>
        </nav>
      `
    : ''
}
<main class="wrap">
${
  flash
    ? html`<div class="flash ${raw(flash.ok ? 'flash--ok' : 'flash--bad')}">${flash.message}</div>`
    : ''
}
${body}
</main>
</body>
</html>`
}

/**
 * أنماط الداشبورد.
 *
 * القياسات هنا للويب لا للكانفاس: `tokens.size.*` محسوبة لمشهد عرضه 1500px،
 * واستعمالها كما هي يعطي عناوين بحجم 82px في صفحة. اللون والشكل من التوكنات،
 * والمقاس قرار مستقل لوسيط مختلف — نفس منطق `Type` في تطبيق SwiftUI.
 */
const DASH_CSS = `
@font-face { font-family:'Cairo'; src:url('/dash/font/cairo.ttf') format('truetype-variations');
  font-weight:200 1000; font-display:swap; }
@font-face { font-family:'Baloo'; src:url('/dash/font/baloo.ttf') format('truetype-variations');
  font-weight:400 800; font-display:swap; }

*{margin:0;padding:0;box-sizing:border-box}
body{
  background:var(--color-paper); color:var(--color-ink);
  font-family:'Cairo',system-ui,sans-serif;
  /* العربية: ممنوع تباعد الحروف، وسطر لا يقل عن 1.7 */
  letter-spacing:0; line-height:1.8; padding-bottom:64px;
}
a{color:inherit}
.grow{flex:1}
bdi{unicode-bidi:isolate}

.wrap{max-width:960px;margin:0 auto;padding:24px 16px}

/* ————— الرأس ————— */
.bar{background:var(--color-red);color:var(--color-cream);border-bottom:5px solid var(--color-ink)}
.bar__in{max-width:960px;margin:0 auto;padding:14px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.brand{font-family:'Baloo',sans-serif;font-weight:800;font-size:22px}
.who{font-size:14px;opacity:.9}

.tabs{background:var(--color-paper-tint);border-bottom:3px solid var(--color-ink)}
.tabs__in{max-width:960px;margin:0 auto;padding:0 16px;display:flex;gap:8px;overflow-x:auto}
.tab{
  padding:12px 16px;font-weight:700;font-size:15px;text-decoration:none;white-space:nowrap;
  border-bottom:4px solid transparent;
}
.tab--on{color:var(--color-red);border-bottom-color:var(--color-red)}

/* ————— القصاصة: حد أسود وظل صلب، توقيع المشروع ————— */
.card{
  background:var(--color-surface);
  border:4px solid var(--color-ink); border-radius:18px;
  box-shadow:-7px 7px 0 var(--color-ink);
  padding:18px; margin-bottom:22px;
}
.card--hero{box-shadow:-7px 7px 0 var(--color-red-deep)}
.card h2{font-family:'Baloo',sans-serif;font-size:22px;color:var(--color-red);margin-bottom:6px}
.card h2::before{content:'«'}
.card h2::after{content:'»'}
.hint{font-size:14px;opacity:.65;margin-bottom:14px}

.row{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.row+.row{margin-top:12px}
.split{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.split+.split{margin-top:10px;padding-top:10px;border-top:2px dashed color-mix(in srgb,var(--color-ink) 25%,transparent)}

/* ————— الحقول ————— */
input[type=text],input[type=number],input[type=url],select{
  font-family:inherit;font-size:15px;padding:9px 12px;
  background:var(--color-cream);color:var(--color-ink);
  border:3px solid var(--color-ink);border-radius:10px;min-width:0;
}
input:focus-visible,select:focus-visible,.btn:focus-visible{
  outline:3px solid var(--color-red);outline-offset:2px;
}
label{font-size:14px;font-weight:700}

.btn{
  display:inline-flex;align-items:center;gap:6px;
  font-family:'Baloo',sans-serif;font-weight:700;font-size:15px;
  padding:9px 18px;border:3px solid var(--color-ink);border-radius:10px;
  background:var(--color-surface);color:var(--color-ink);
  box-shadow:-4px 4px 0 var(--color-ink);cursor:pointer;text-decoration:none;
}
.btn:active{transform:translate(-2px,2px);box-shadow:-2px 2px 0 var(--color-ink)}
/* أصفر بظل أحمر = اندماج لوني الهوية (DESIGN.md §5) */
.btn--go{background:var(--color-yellow);box-shadow:-4px 4px 0 var(--color-red-deep)}
.btn--danger{background:var(--color-red);color:var(--color-cream)}
.btn--ghost{background:transparent;color:inherit;border-color:currentColor;box-shadow:none;padding:6px 12px;font-size:14px}

.pill{
  display:inline-block;padding:3px 12px;border-radius:999px;
  background:var(--color-yellow);color:var(--color-ink);
  border:2px solid var(--color-ink);font-size:13px;font-weight:700;
}
.pill--off{background:transparent;opacity:.6}

.flash{
  border:3px solid var(--color-ink);border-radius:12px;padding:12px 16px;margin-bottom:20px;
  font-weight:700;box-shadow:-5px 5px 0 var(--color-ink);
}
.flash--ok{background:var(--color-yellow)}
.flash--bad{background:var(--color-red);color:var(--color-cream)}

.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(260px,1fr));gap:14px}

table{width:100%;border-collapse:collapse;font-size:15px}
th,td{padding:10px;text-align:start;border-bottom:2px solid color-mix(in srgb,var(--color-ink) 18%,transparent)}
th{font-family:'Baloo',sans-serif}

.avatar{width:34px;height:34px;border-radius:999px;border:2px solid var(--color-ink);vertical-align:middle}

.empty{text-align:center;padding:36px 12px;opacity:.7}

@media (max-width:560px){
  .card{padding:14px}
  .split{align-items:stretch}
}
`
