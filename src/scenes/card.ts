import { blob, html, raw, type Html } from './html.ts'
import type { CardScene } from './scene.ts'

/**
 * بطاقة اللاعب.
 *
 * البنية مستعارة من بطاقة Codex التي طُلبت مرجعًا: هوية أعلى، خريطة نشاط
 * تملأ الوسط، وأربعة أرقام أسفلها بفواصل. المستعار هو **الترتيب** وحده.
 *
 * وما لم يُستعر، وهو الأهم: تلك بطاقة داكنة بمربّعات زرقاء متدرّجة الشفافية
 * وبلا حدود. هذه لوحة DESIGN.md §3: ورق رملي، وحبر أسود سميك حول كل قصاصة،
 * وظل صلب بلا blur. والتدرّج ممنوع نصًّا في §7، فشدّة اليوم لا تُقال بالشفافية
 * بل بأربعة ألوان مسطّحة من الجدول نفسه.
 *
 * الخريطة تُقرأ من اليمين إلى اليسار كبقية الواجهة: اليوم الأقدم في أقصى
 * اليمين. عكسها يعني خريطة إنجليزية في مشهد عربي.
 */
export function cardScene(s: CardScene): string {
  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 520px">
        <div class="bar">
          <span>البطاقة</span>
          <span class="bar__count">${String(Math.ceil(s.days.length / 7))} أسبوعًا</span>
        </div>

        <div class="card grow stack" style="padding: var(--space-lg); gap: var(--space-lg); flex-direction: column">
          ${identity(s)} ${heatmap(s.days)} ${stats(s.stats)}
        </div>
      </div>
    </div>
  `.toString()
}

/** أفتار واسم. لا مقبض `@` هنا: ديسكورد ألغى المميّزات ولم يعد للاسم ثانٍ. */
function identity(s: CardScene): Html {
  return html`
    <div class="row" style="gap: var(--space-base); align-items: center">
      ${avatar(s.player.avatar)}
      <!--
        bdi: أسماء ديسكورد لاتينية غالبًا وتبدأ أو تنتهي بمحارف محايدة،
        فتنتقل داخل RTL إلى الطرف الخطأ بلا عزل ثنائي الاتجاه.
      -->
      <bdi class="title" style="font-size: 46px; line-height: 1.2; min-width: 0">
        ${s.player.name}
      </bdi>
    </div>
  `
}

function avatar(url: string | null): Html {
  const box = `
    width: 96px; height: 96px; flex: none; border-radius: var(--radius-base);
    border: var(--stroke-base) solid var(--color-ink);
    box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 var(--color-ink);
    background: var(--color-cream); overflow: hidden;
  `
  return url
    ? html`<img src="${url}" alt="" style="${raw(box)} object-fit: cover" />`
    : html`<div style="${raw(box)}"></div>`
}

/**
 * أربع درجات مسطّحة لا تدرّج واحد.
 *
 * المرجع يقول الشدّة بشفافية اللون الأزرق، وهذا ممنوع هنا (§7: لا تدرّجات).
 * البديل سلّم من أربع خطوات مأخوذة من الجدول: ورق، ثم رمل أعمق، ثم أصفر،
 * ثم أحمر. القفزة بين الدرجات مقروءة من بعيد، والتدرّج الناعم ليس كذلك.
 */
function shade(games: number): string {
  if (games <= 0) return 'var(--color-paper-tint)'
  if (games === 1) return 'var(--color-cream)'
  if (games <= 3) return 'var(--color-yellow)'
  return 'var(--color-red)'
}

function heatmap(days: CardScene['days']): Html {
  // سبعة صفوف: أسبوع لكل عمود، فتُقرأ الخريطة أعمدةً كتقويم لا شريطًا طويلًا
  const weeks = Math.ceil(days.length / 7)
  const cells = days.map(
    (day) => html`
      <div
        title="${day.date}"
        style="
          aspect-ratio: 1; border-radius: 8px;
          background: ${raw(shade(day.games))};
          border: var(--stroke-thin) solid var(--color-ink);
        "
      ></div>
    `,
  )

  // أعمدة بـ1fr لا بمقاس ثابت: الشبكة الثابتة تنكمش في ركن وتترك اللوحة
  // فارغة، وهي أبرز عنصر في البطاقة فيجب أن تأخذ عرضها كاملًا.
  return html`
    <div
      class="grow"
      style="
        display: grid; grid-auto-flow: column;
        grid-template-columns: repeat(${String(weeks)}, 1fr);
        grid-template-rows: repeat(7, auto);
        gap: 8px; direction: rtl;
      "
    >
      ${cells}
    </div>
  `
}

/**
 * أربعة أرقام بفواصل بينها.
 *
 * الرقم أكبر من تسميته بمرتين ونصف: هو ما يُقرأ أولًا، والتسمية تُقرأ عند
 * الحاجة وحدها. تساويهما يجعل العين تتردّد بينهما.
 */
function stats(items: CardScene['stats']): Html {
  const cells = items.map(
    (item, index) => html`
      ${index > 0
        ? html`<div style="width: var(--stroke-thin); background: var(--color-ink); opacity: .25"></div>`
        : html``}
      <div class="stack grow" style="gap: 4px; align-items: center; text-align: center">
        <span style="font-family: var(--font-display); font-size: 44px; font-weight: 800">
          ${item.value}
        </span>
        <span style="font-size: var(--size-meta); opacity: .7">${item.label}</span>
      </div>
    `,
  )
  return html`<div class="row" style="gap: var(--space-base); align-items: stretch">${cells}</div>`
}

function background(): Html {
  return html`
    ${blob({ width: 560, variant: 1, fill: 'var(--color-surface)', top: -180, end: -140 })}
    ${blob({ width: 420, variant: 2, fill: 'var(--color-surface)', bottom: -160, start: -130 })}
  `
}
