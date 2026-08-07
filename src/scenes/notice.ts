import { icon, type IconName } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { NoticeScene } from './scene.ts'

/**
 * بطاقة إشعار — نجاح، تحذير، معلومة.
 *
 * المشهد هنا **أضيق من 1500px عمدًا**: إشعار من سطرين داخل لوحة بعرض المشهد
 * الكامل يصير مستطيلًا مليئًا بالفراغ، وهذا ما يمنعه DESIGN §7.
 * القصاصة تأخذ حجم ما تقوله، لا حجم القناة.
 *
 * النبرة تُقرأ من **الشارة** لا من لون خلفية جديد: اللوحة لونان فقط،
 * وإضافة أخضر للنجاح وبرتقالي للتحذير تكسر §3 كاملًا.
 */

const TONE: Record<NoticeScene['tone'], { icon: IconName; badge: string; shadow: string }> = {
  // الأصفر بظل أحمر — اندماج لوني الهوية، ويُحجز للحالة السارّة وحدها
  ok: {
    icon: 'check',
    badge: 'background: var(--color-yellow); color: var(--on-yellow)',
    shadow: 'var(--color-red-deep)',
  },
  warn: {
    icon: 'cross',
    badge: 'background: var(--color-red); color: var(--on-red)',
    shadow: 'var(--color-ink)',
  },
  info: {
    icon: 'question',
    badge: 'background: var(--color-cream); color: var(--color-ink)',
    shadow: 'var(--color-ink)',
  },
}

export function noticeScene(s: NoticeScene): string {
  const tone = TONE[s.tone]

  const badge = [
    'display: grid',
    'place-items: center',
    'flex: none',
    'width: 132px',
    'height: 132px',
    'border-radius: var(--radius-pill)',
    'border: var(--stroke-thick) solid var(--color-ink)',
    `box-shadow: calc(var(--lift-sm) * -1) var(--lift-sm) 0 ${tone.shadow}`,
    tone.badge,
  ].join('; ')

  return html`
    <div class="scene" style="width: 980px; min-height: 0; padding: var(--space-lg)">
      ${background()}

      <div class="scene__body" style="flex-direction: column">
        <div
          class="card row"
          style="--shadow: ${raw(tone.shadow)}; gap: var(--space-lg);
                 align-items: center; padding: var(--space-lg)"
        >
          <span style="${raw(badge)}">${raw(icon(tone.icon, { size: 78, stroke: 2.2 }))}</span>

          <div class="stack grow" style="gap: 4px; min-width: 0">
            <!-- 54px لا 82: عنوان الإشعار جملة، واسم اللعبة كلمة -->
            <h1 class="display" style="font-size: 54px">${s.title}</h1>
            ${s.body ? html`<p class="text">${s.body}</p>` : ''}
          </div>
        </div>
      </div>
    </div>
  `.toString()
}

/** كتلتان فقط — المشهد ضيّق، وثلاث كتل فيه تزدحم خلف البطاقة الواحدة. */
function background(): Html {
  return html`
    ${blob({ width: 420, variant: 0, fill: 'var(--color-surface)', top: -150, end: -120 })}
    ${blob({ width: 340, variant: 2, fill: 'var(--color-paper-tint)', bottom: -140, start: -110 })}
  `
}
