import { icon } from '../design/icons.ts'
import { blob, html, raw, type Html } from './html.ts'
import type { PlayerView, PollScene } from './scene.ts'

/**
 * مشهد التصويت.
 *
 * الشريط هو الرسالة: النسبة مكتوبة أيضًا لكن العين تقرأ الطول قبل الرقم.
 * لذلك عرض الشريط متناسب حرفيًا مع الأصوات — لا سلّم مضخّم ولا حد أدنى
 * يكذب على خيار نال صوتًا واحدًا.
 */

/** الخيار الرابح يُقرأ قبل أن يُحسب، لكن التعادل يُبرز كل المتصدّرين لا واحدًا. */
type Row = {
  label: string
  votes: number
  percent: number
  player: PlayerView | null
  leading: boolean
}

export function pollScene(s: PollScene): string {
  const rows = tally(s)
  const total = totalOf(s)

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body" style="flex-direction: column; min-height: 512px">
        <div class="bar">
          <span>${s.game.name}</span>
          <span class="bar__count">${total} ${votesWord(total)}</span>
        </div>

        <div class="card card--hero row" style="gap: var(--space-base)">
          <span style="color: var(--color-red)">${raw(icon('vote', { size: 58, stroke: 2.2 }))}</span>
          <h1
            class="grow"
            style="font-family: var(--font-display), sans-serif; font-weight: var(--weight-black);
                   font-size: ${questionSize(s.question)}px; line-height: var(--leading-tight);
                   letter-spacing: 0; text-wrap: balance"
          >
            ${s.question}
          </h1>
        </div>

        <div class="card grow stack stack--lg" style="justify-content: center">
          ${rows.length > 0 ? rows.map((r) => optionRow(r, total)) : emptyNote('لا خيارات في هذا التصويت')}
        </div>

        ${s.note ? noteChip(s.note) : total === 0 ? noteChip('لم يصوّت أحد بعد') : ''}
      </div>
    </div>
  `.toString()
}

/**
 * المجموع المعروض لا يقل عن مجموع الخيارات: لو تأخّر `totalVotes` عن التحديث
 * لظهرت نسب تتجاوز المئة، وهذا أسوأ من رقم مجموع غير دقيق.
 */
function totalOf(s: PollScene): number {
  const sum = s.options.reduce((acc, o) => acc + Math.max(0, o.votes), 0)
  return Math.max(sum, Math.max(0, s.totalVotes))
}

function tally(s: PollScene): Row[] {
  const total = totalOf(s)
  const best = s.options.reduce((max, o) => Math.max(max, Math.max(0, o.votes)), 0)

  return s.options.map((o) => {
    const votes = Math.max(0, o.votes)
    return {
      label: o.label,
      votes,
      percent: total > 0 ? Math.round((votes / total) * 100) : 0,
      player: o.player ?? null,
      leading: best > 0 && votes === best,
    }
  })
}

function optionRow(r: Row, total: number): Html {
  return html`
    <div class="stack" style="gap: 8px">
      <div class="row" style="gap: var(--space-sm)">
        ${r.player ? avatarOf(r.player) : ''}
        <!--
          الـ bdi داخل غلاف يتمدد بدل أن يتمدد هو: لو تمدّد بنفسه لتبعت محاذاته
          اتجاهه المُستنتج، فانزاح الخيار اللاتيني إلى يسار السطر بينما يبقى
          العربي يمينه. الغلاف يثبّت المحاذاة، والعزل يبقى داخل الـ bdi.
        -->
        <span class="grow" style="min-width: 0; overflow: hidden">
          <bdi
            style="display: inline-block; max-width: 100%; overflow: hidden;
                   text-overflow: ellipsis; white-space: nowrap; vertical-align: bottom;
                   font-family: var(--font-display), sans-serif; font-weight: var(--weight-bold);
                   font-size: 30px"
          >
            ${r.label}
          </bdi>
        </span>
        <span class="meta" style="flex: none">${r.votes} ${votesWord(r.votes)}</span>
        ${percentChip(r)}
      </div>
      ${bar(r, total)}
    </div>
  `
}

/** مجرى الشريط بحدّ ثابت: يبقى الخيار الصفري مرئيًا كخيار لا كفراغ. */
function bar(r: Row, total: number): Html {
  const track = [
    'position: relative',
    'height: 36px',
    'border-radius: var(--radius-pill)',
    'background: var(--color-paper-tint)',
    'border: var(--stroke-thin) solid var(--color-ink)',
    'overflow: hidden',
  ].join('; ')

  const fill = [
    'height: 100%',
    `width: ${total > 0 ? (r.votes / total) * 100 : 0}%`,
    'border-radius: var(--radius-pill)',
    r.leading ? 'background: var(--color-yellow)' : 'background: var(--color-red)',
  ].join('; ')

  return html`<div style="${raw(track)}">
    <div style="${raw(fill)}"></div>
  </div>`
}

function percentChip(r: Row): Html {
  const style = [
    'flex: none',
    'min-width: 96px',
    'text-align: center',
    'padding: 0 var(--space-sm)',
    'border-radius: var(--radius-pill)',
    'border: var(--stroke-thin) solid var(--color-ink)',
    'font-family: var(--font-display), sans-serif',
    'font-weight: var(--weight-bold)',
    'font-size: var(--size-label)',
    'line-height: 1.8',
    'letter-spacing: 0',
    r.leading
      ? 'background: var(--color-yellow); color: var(--on-yellow); box-shadow: -4px 4px 0 var(--color-red-deep)'
      : 'background: var(--color-cream); color: var(--color-ink)',
  ].join('; ')

  return html`<span style="${raw(style)}">${r.percent}%</span>`
}

/* ————— مشترك ————— */

/**
 * تمييز العدد في العربية ليس جمعًا واحدًا: المفرد والمثنى وجمع القلة والتمييز
 * المنصوب أربع صيغ مختلفة، و«2 أصوات» خطأ يقرأه الجميع.
 */
function votesWord(n: number): string {
  if (n === 2) return 'صوتان'
  if (n >= 3 && n <= 10) return 'أصوات'
  if (n >= 11) return 'صوتًا'
  return 'صوت'
}

function questionSize(question: string): number {
  const n = [...question.trim()].length
  if (n <= 24) return 58
  if (n <= 46) return 46
  if (n <= 80) return 38
  return 32
}

function avatarOf(p: PlayerView): Html {
  const style = [
    'width: 52px',
    'height: 52px',
    'flex: none',
    'border-radius: var(--radius-pill)',
    'border: var(--stroke-thin) solid var(--color-ink)',
    'background: var(--color-cream)',
    'object-fit: cover',
  ].join('; ')

  return p.avatar
    ? html`<img src="${p.avatar}" alt="" style="${raw(style)}" />`
    : html`<div style="${raw(style)}; border-style: dashed; opacity: .5"></div>`
}

const CHIP = 'align-self: center; display: inline-flex; align-items: center; gap: var(--space-xs)'

function noteChip(note: string): Html {
  return html`<div class="note" style="${raw(CHIP)}">
    ${raw(icon('timer', { size: 22 }))} ${note}
  </div>`
}

function emptyNote(text: string): Html {
  return html`<div class="note" style="${raw(CHIP)}">
    ${raw(icon('hourglass', { size: 22 }))} ${text}
  </div>`
}

function background(): Html {
  return html`
    ${blob({ width: 580, variant: 0, fill: 'var(--color-surface)', top: -180, end: -150 })}
    ${blob({ width: 470, variant: 2, fill: 'var(--color-surface)', bottom: -160, start: -140 })}
    ${blob({ width: 250, variant: 1, fill: 'var(--color-paper-tint)', top: 280, start: 80 })}
  `
}
