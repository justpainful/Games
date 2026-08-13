import { icon } from '../design/icons.ts'
import { avatar, blob, html, raw, type Html } from './html.ts'
import type { LobbyScene, PlayerView } from './scene.ts'

/**
 * مشهد اللوبي — الشاشة المرجعية التي اشتُقّ منها نظام التصميم كله.
 * ترتيب DOM يتبع RTL: أول عنصر يظهر يمينًا.
 *
 * لا شعار ولا watermark في المشهد: الهوية تُحمل باللون والظل والشكل،
 * لا باسم مطبوع. هذا يبقي التصميم صالحًا مهما كان الاسم لاحقًا.
 */
export function lobbyScene(s: LobbyScene): string {
  const slots = fillSlots(s.players, s.min)

  return html`
    <div class="scene">
      ${background()}

      <div class="scene__body">
        <!-- عمود اللاعبين — يمينًا -->
        <aside class="stack" style="width: 400px">
          <div class="bar">
            <span>اللاعبين</span>
            <span class="bar__count">${s.players.length}/${s.max}</span>
          </div>

          <div class="card grow stack stack--lg">
            ${slots.map((p, i) => playerRow(p, i === 0 && s.host !== null))}
            <!-- يملأ فراغ العمود في الألعاب الثنائية بمعلومة بدل أن يتركه خاويًا -->
            <div class="grow"></div>
            ${waitNote(s.players.length, s.min, s.max)}
          </div>
        </aside>

        <!-- العمود الرئيسي — يسارًا -->
        <main class="stack stack--lg grow">
          <div class="card card--hero row">
            <div class="stack grow" style="gap: 2px">
              <h1 class="display">${s.game.name}</h1>
              <p class="text text--muted">${s.game.tagline}</p>
            </div>
            ${marks()}
          </div>

          <div class="card grow stack stack--lg">
            <div class="row" style="align-items: stretch">
              ${column(
                'قائد اللعبة',
                'إذا جهز جميع اللاعبين، ابدأ اللعبة',
                'btn--start',
                'بدء اللعبة',
              )}
              <div class="rule--v"></div>
              ${column(
                'دخول إلى اللعبة',
                'ادخل اللعبة وانتظر القائد حتى يبدأ',
                'btn--join',
                'الدخول للعبة',
              )}
            </div>

            <hr class="rule" />

            <div class="stack" style="gap: 6px">
              <h2 class="title">شرح اللعبة:</h2>
              <p class="text">${s.game.howTo}</p>
            </div>
          </div>
        </main>
      </div>
    </div>
  `.toString()
}

/**
 * عمق الخلفية: كتلتان ناعمتان بلا حد، وملصقان ملوّنان يطلّان من الحواف.
 * الملصقات هي ما يحمل لوني الهوية خارج البطاقات.
 */
function background(): Html {
  return html`
    ${blob({ width: 620, variant: 1, fill: 'var(--color-surface)', top: -170, end: -150 })}
    ${blob({ width: 520, variant: 2, fill: 'var(--color-surface)', bottom: -190, start: -160 })}
    ${blob({ width: 300, variant: 0, fill: 'var(--color-paper-tint)', top: 210, start: 120 })}
  `
}

/**
 * حالة اللوبي بلغة اللاعب.
 *
 * ثلاث حالات لا اثنتان. كان النص يقول «اكتمل العدد» بمجرد بلوغ الحدّ الأدنى،
 * وذلك خبر خاطئ في لعبة يتّسع لخمسة وعشرين: اثنان من خمسة وعشرين ليس اكتمالًا،
 * وقارئه يظنّ الباب أُغلق دونه فلا يضغط دخول. والفرق بين «يكفي للبدء» و«امتلأ»
 * فرق في المعنى لا في الصياغة، فصار لكلٍّ نصّه.
 */
function waitNote(count: number, min: number, max: number): Html {
  const missing = min - count
  if (missing > 0) {
    return html`<div class="note">
      ${raw(icon('hourglass', { size: 22 }))} ينقص ${missing}
      ${missing === 1 ? 'لاعب' : 'لاعبين'} للبدء
    </div>`
  }

  const room = max - count
  return room > 0
    ? html`<div class="note note--ready">
        ${raw(icon('check', { size: 22 }))} جاهزة للبدء · يتّسع لـ ${room} بعد
      </div>`
    : html`<div class="note note--ready">
        ${raw(icon('check', { size: 22 }))} اكتمل العدد · بانتظار القائد
      </div>`
}

function column(title: string, hint: string, btnClass: string, btnText: string): Html {
  return html`
    <div class="stack stack--lg center grow" style="padding: 0 var(--space-base)">
      <h2 class="title title--quoted">${title}</h2>
      <p class="text grow">${hint}</p>
      <span class="btn ${raw(btnClass)}">${btnText}</span>
    </div>
  `
}

function playerRow(p: PlayerView | null, isHost: boolean): Html {
  return html`
    <div class="player ${raw(isHost ? 'player--host' : '')}">
      <div class="player__slot">
        ${avatar(p?.avatar ?? null)}${isHost && p
          ? raw(`<span class="player__crown">${icon('crown', { size: 24, stroke: 2.6 })}</span>`)
          : ''}
      </div>
      <!--
        bdi وليس span: أسماء ديسكورد لاتينية غالبًا وتبدأ أو تنتهي بمحارف محايدة
        (. _ ~ أرقام). داخل تخطيط RTL تنتقل تلك المحارف للطرف الخطأ فيصير
        ".zja6" معروضًا "zja6." — العزل ثنائي الاتجاه هو ما يمنع ذلك.
      -->
      <bdi class="player__name ${raw(p ? '' : 'text--muted')}">
        ${p ? p.name : 'بانتظار لاعب...'}
      </bdi>
    </div>
  `
}

/**
 * علامتا X و O بلوني الهوية، جالستان داخل كتلة عضوية.
 * الكتلة هنا ليست زينة: هي الإطار الذي يميّز أيقونة كل لعبة عن غيرها،
 * وهي نفس مبدأ صور Drb7h حيث يجلس المحتوى داخل شكل لا داخل مربع.
 */
function marks(): Html {
  return raw(`
    <div style="position:relative; flex:none; width:196px; height:196px">
      <!-- إطار مربّع بلا preserveAspectRatio=none، وإلا انسحقت الكتلة إلى بيضة -->
      <svg width="196" height="196" viewBox="-6 -6 214 214" fill="none"
           style="position:absolute; inset:0">
        <path d="M181 60c13 33 5 76-17 101c-22 25-58 32-90 25c-32-7-60-28-69-58c-9-30 1-69 24-92C71 13 108 6 138 15c30 9 30 12 43 45z"
              fill="var(--color-paper)" stroke="var(--color-ink)" stroke-width="7"
              stroke-linejoin="round"/>
      </svg>
      <svg width="148" height="85" viewBox="0 0 168 96" fill="none"
           style="position:absolute; inset-inline-start:24px; top:56px">
        <path d="M16 16 L64 80 M64 16 L16 80" stroke="var(--color-red)"
              stroke-width="17" stroke-linecap="round"/>
        <circle cx="124" cy="48" r="29" stroke="var(--color-yellow)" stroke-width="17"/>
      </svg>
    </div>`)
}

/** يملأ الخانات الفارغة حتى الحد الأدنى فيبقى الشكل ثابتًا قبل اكتمال اللاعبين. */
function fillSlots(players: PlayerView[], min: number): (PlayerView | null)[] {
  const slots: (PlayerView | null)[] = [...players]
  while (slots.length < min) slots.push(null)
  return slots
}
