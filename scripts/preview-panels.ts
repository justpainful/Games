/**
 * هارنس معاينة اللوحات — يرندر قوالب `panel` و `notice` و `profile` و `leaders`
 * إلى out/ بلا ديسكورد ولا قاعدة بيانات.
 *
 * الحالات مختارة لتكسر التخطيط لا لتُجمّله: لوحة باثني عشر بندًا، ملف لاعب
 * بأصفار وبسبعة أرقام، صدارة بعشرة صفوف وبصف واحد وفارغة، وأسماء طويلة
 * ولاتينية ومخلوطة. ما ينجو من هذه القائمة ينجو في السيرفر.
 *
 *   npx tsx scripts/preview-panels.ts
 */
import fs from 'node:fs/promises'
import path from 'node:path'
import { startRenderer, stopRenderer } from '../src/images/browser.ts'
import { renderScene } from '../src/images/render.ts'
import type { PlayerView, Scene } from '../src/scenes/scene.ts'

const OUT = path.join(process.cwd(), 'out')

/** أفتار رمادي بسيط — يكفي لفحص التخطيط بلا شبكة. */
const stub = (hue: number): string =>
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" width="120" height="120">
       <rect width="120" height="120" fill="hsl(${hue} 45% 62%)"/>
       <circle cx="60" cy="46" r="22" fill="rgba(255,255,255,.85)"/>
       <ellipse cx="60" cy="108" rx="38" ry="30" fill="rgba(255,255,255,.85)"/>
     </svg>`,
  )

const player = (id: string, name: string, hue: number): PlayerView => ({
  id,
  name,
  avatar: stub(hue),
})

const LONG = 'اسم طويل جدا جدا لا يتوقف عند حدود العمود ويستمر بلا رحمة'
const LATIN = 'xX_Sniper_Xx'

const TEN = [
  player('1', 'عبدالرحمن', 10),
  player('2', LATIN, 200),
  player('3', '.zja6', 320),
  player('4', LONG, 90),
  player('5', 'سارة', 140),
  player('6', 'Mohammed_2010', 260),
  player('7', 'فهد', 30),
  player('8', 'نورة', 300),
  player('9', 'Abu-3ali', 60),
  player('10', 'خالد', 180),
]

const cases: { name: string; scene: Scene }[] = [
  // ————— اللوحات —————
  {
    name: 'panel-bot',
    scene: {
      kind: 'panel',
      title: 'اعدادات البوت الاساسيه',
      subtitle: 'سيرفر الألعاب',
      items: [
        { label: 'البريفكس', value: '!' },
        { label: 'أوامر البريفكس', value: 'مفعّلة', on: true },
        { label: 'الاسم المستعار', value: 'بوت الألعاب' },
        { label: 'المصرح لهم', value: '3 أشخاص' },
      ],
      footer: 'اختر من القائمة تحت الصورة لتعديل أي إعداد',
    },
  },
  {
    name: 'panel-12',
    scene: {
      kind: 'panel',
      title: 'اعدادات الالعاب',
      subtitle: '12 لعبة',
      items: [
        { label: 'أكس أو', value: 'مفعّلة', on: true },
        { label: 'من الأعلى', value: 'معطّلة', on: false },
        { label: 'العواصم', value: 'مفعّلة', on: true },
        { label: 'فكّك', value: 'مفعّلة', on: true },
        { label: 'جمع', value: 'معطّلة', on: false },
        { label: 'خمّن', value: 'مفعّلة', on: true },
        { label: 'معرفة', value: 'مفعّلة', on: true },
        { label: 'مفرد', value: 'مفعّلة', on: true },
        { label: 'قرا', value: 'معطّلة', on: false },
        { label: 'شات الألعاب', value: '#الالعاب-والتسليه-الجماعيه' },
        { label: 'صورة اللعبة', value: 'https://cdn.example.com/games/xo-cover-image.png' },
        { label: 'اسم إعداد طويل جدا لا ينتهي أبدا ويتجاوز العمود', value: 'قيمة طويلة كذلك' },
      ],
      footer: 'اختر لعبة من القائمة لضبط إعداداتها',
    },
  },
  {
    name: 'panel-empty',
    scene: { kind: 'panel', title: 'اعدادات الادارة', items: [] },
  },
  {
    // السقف الحقيقي: شات الألعاب + كل ألعاب المشروع في لوحة واحدة
    name: 'panel-full',
    scene: {
      kind: 'panel',
      title: 'اعدادات الالعاب',
      subtitle: '21 من 29 مفعّلة',
      items: [
        { label: 'شات الألعاب', value: '#الالعاب', on: true },
        ...Array.from({ length: 29 }, (_, i) => ({
          label: `لعبة رقم ${i + 1}`,
          value: i % 4 === 3 ? 'معطّلة' : 'مفعّلة',
          on: i % 4 !== 3,
        })),
      ].slice(0, 30),
      footer: 'اختر لعبة من القائمة لضبط حالتها وصورتها وإعداداتها',
    },
  },

  // ————— الإشعارات —————
  {
    name: 'notice-ok',
    scene: { kind: 'notice', tone: 'ok', title: 'تم الحفظ', body: 'صار البريفكس «؟» في هذا السيرفر.' },
  },
  {
    name: 'notice-warn',
    scene: {
      kind: 'notice',
      tone: 'warn',
      title: 'ما قدرت أغيّر الاسم',
      body: 'ديسكورد يسمح بتغيير اسم البوت مرتين في الساعة فقط. جرّب بعد ساعة.',
    },
  },
  {
    name: 'notice-info',
    scene: {
      kind: 'notice',
      tone: 'info',
      title: 'صيغة الأمر',
      body: 'اكتب: اعطاء @لاعب 5 — ويمكن إضافة نوع المحفظة: روليت أو جماعية أو فردية.',
    },
  },

  // ————— ملف اللاعب —————
  {
    name: 'profile-zero',
    scene: {
      kind: 'profile',
      player: player('1', 'لاعب جديد', 210),
      roulette: 0,
      team: 0,
      solo: 0,
      total: 0,
      gamesPlayed: 0,
      wins: 0,
      rank: null,
    },
  },
  {
    name: 'profile-big',
    scene: {
      kind: 'profile',
      player: player('2', LATIN, 200),
      roulette: 482930,
      team: 1204775,
      solo: 998210,
      total: 2685915,
      gamesPlayed: 12480,
      wins: 3902,
      rank: 1,
    },
  },
  {
    name: 'profile-long-name',
    scene: {
      kind: 'profile',
      player: player('3', LONG, 90),
      roulette: 12,
      team: 340,
      solo: 87,
      total: 439,
      gamesPlayed: 61,
      wins: 9,
      rank: 27,
    },
  },
  {
    name: 'profile-no-avatar',
    scene: {
      kind: 'profile',
      player: { id: '4', name: '.zja6', avatar: null },
      roulette: 5,
      team: 0,
      solo: 120,
      total: 125,
      gamesPlayed: 8,
      wins: 2,
      rank: 4,
    },
  },

  // ————— الصدارة —————
  {
    name: 'leaders-10',
    scene: {
      kind: 'leaders',
      title: 'الصدارة — مجموع النقاط',
      rows: TEN.map((p, i) => ({ player: p, points: (10 - i) * 1337 })),
    },
  },
  {
    name: 'leaders-one',
    scene: {
      kind: 'leaders',
      title: 'الصدارة — نقاط الروليت',
      rows: [{ player: player('1', 'عبدالرحمن', 10), points: 7 }],
    },
  },
  {
    name: 'leaders-empty',
    scene: { kind: 'leaders', title: 'الصدارة — نقاط فردية', rows: [] },
  },
]

async function main(): Promise<void> {
  await fs.mkdir(OUT, { recursive: true })
  await startRenderer()

  for (const c of cases) {
    const started = Date.now()
    const png = await renderScene(c.scene)
    await fs.writeFile(path.join(OUT, `${c.name}.png`), png)
    console.log(`${c.name}.png  ${(png.length / 1024).toFixed(0)}KB  ${Date.now() - started}ms`)
  }

  await stopRenderer()
  console.log(`\nتمّ. الصور في ${OUT}`)
}

main().catch(async (err) => {
  console.error(err)
  await stopRenderer()
  process.exit(1)
})
