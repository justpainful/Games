import { EMOJI } from '../../design/emoji.ts'
import { numberFace } from '../../design/faces.ts'
import type { PlayerView, PollScene } from '../../scenes/scene.ts'
import { defineGame, zeroScores, type ButtonDef, type GameResult, type Table } from '../define.ts'

/**
 * تصويت — سؤال يكتبه القائد وخيارات يصوّت عليها الباقون.
 *
 * السؤال والخيارات يُكتبان في الشات لا بالأزرار: لا يمكن لزر أن يستقبل نصًا
 * حرًا، والقيمة كلها في أن يسأل القائد ما يريد لا ما نعرضه عليه.
 *
 * التعادل لا يُكسر بقرعة — يُعلن كما هو. تصويت يخترع فائزًا عند التساوي
 * يفقد معناه أصلًا.
 */

const ASK_MS = 90_000
const VOTE_MS = 45_000

const MIN_OPTIONS = 2
const MAX_OPTIONS = 10
const MAX_LABEL = 60

export default defineGame({
  key: 'tasweet',
  mode: 'event',
  name: 'تصويت',
  aliases: ['التصويت', 'استفتاء'],
  tagline: 'سؤال واحد وخيارات، والأغلبية تحكم',
  howTo:
    'يكتب القائد السؤال في الشات، ثم يكتب الخيارات في رسالة واحدة كل خيار في سطر ' +
    '(أو مفصولة بعلامة |). بعدها تفتح الأزرار للتصويت، ومن صوّت للخيار الفائز يأخذ نقطة.',
  players: { min: 2, max: 25 },
  wallet: 'solo',
  play,
})

async function play(table: Table): Promise<GameResult> {
  const roster = [...table.players]
  const scores = zeroScores(roster)

  const question = await askQuestion(table)
  if (table.aborted || !question) return { winnerId: null, scores }

  const options = await askOptions(table)
  if (table.aborted || !options) return { winnerId: null, scores }

  return await runPoll(table, roster, scores, question, options)
}

/* ————— كتابة السؤال والخيارات ————— */

async function askQuestion(table: Table): Promise<string | null> {
  await table.show(
    poll(table, 'بانتظار سؤال القائد', [], 0, 'اكتب السؤال في الشات'),
    {
      text:
        `**تصويت** — <@${table.host.id}> اكتب السؤال في الشات الآن. ` +
        `${Math.round(ASK_MS / 1000)} ثانية.`,
    },
  )

  const input = await table.waitChat(
    ASK_MS,
    (chat) => chat.userId === table.host.id && chat.text.trim().length > 0,
  )
  if (!input) {
    await cancel(table, 'ما كتب القائد سؤالًا.')
    return null
  }
  return input.text.trim().slice(0, 160)
}

async function askOptions(table: Table): Promise<string[] | null> {
  await table.say(
    `<@${table.host.id}> اكتب الخيارات الآن في رسالة واحدة — كل خيار في سطر، ` +
      `أو افصلها بعلامة |. من ${MIN_OPTIONS} إلى ${MAX_OPTIONS} خيارات.`,
  )

  // محاولتان: أول رسالة قد تكون تعليقًا من القائد لا قائمة خيارات
  for (let attempt = 0; attempt < 2 && !table.aborted; attempt++) {
    const input = await table.waitChat(
      ASK_MS,
      (chat) => chat.userId === table.host.id && chat.text.trim().length > 0,
    )
    if (!input) break

    const options = parseOptions(input.text)
    if (options.length >= MIN_OPTIONS) return options

    await table.say(`محتاج ${MIN_OPTIONS} خيارات على الأقل، كل خيار في سطر. جرّب مرة ثانية.`)
  }

  if (!table.aborted) await cancel(table, 'ما وصلت خيارات صالحة.')
  return null
}

/**
 * الفواصل بالترتيب: السطر أولًا لأنه ما نطلبه صراحة، ثم `|`، ثم الفاصلة العربية.
 * الفاصلة آخر خيار عمدًا — كثير من الأسئلة تحوي فاصلة داخل الخيار نفسه.
 */
function parseOptions(text: string): string[] {
  const raw = text.trim()
  const parts = raw.includes('\n')
    ? raw.split('\n')
    : raw.includes('|')
      ? raw.split('|')
      : raw.split(/[،,]/)

  const seen = new Set<string>()
  const out: string[] = []
  for (const part of parts) {
    const label = part.trim().replace(/^[-*•\d.)\s]+/, '').trim() || part.trim()
    if (label.length === 0 || seen.has(label)) continue
    seen.add(label)
    out.push(label.slice(0, MAX_LABEL))
    if (out.length === MAX_OPTIONS) break
  }
  return out
}

/* ————— التصويت ————— */

async function runPoll(
  table: Table,
  roster: PlayerView[],
  scores: Map<string, number>,
  question: string,
  options: string[],
): Promise<GameResult> {
  const ids = options.map((_, i) => `opt:${i}`)
  const voters = new Set(roster.map((p) => p.id))

  await table.show(poll(table, question, options.map((label) => ({ label, votes: 0 })), 0, 'التصويت مفتوح'), {
    text: `**${question}**\nصوّتوا من الأزرار. ينتهي <t:${
      Math.floor(Date.now() / 1000) + Math.round(VOTE_MS / 1000)
    }:R>`,
    buttons: buttons(options),
  })

  const presses = await table.collectPresses(
    VOTE_MS,
    (p) => voters.has(p.userId) && ids.includes(p.id),
  )
  if (table.aborted) return { winnerId: null, scores }

  const counts = options.map(() => 0)
  const choice = new Map<string, number>()
  for (const press of presses) {
    const index = Number(press.id.slice('opt:'.length))
    const current = counts[index]
    if (current === undefined) continue
    counts[index] = current + 1
    choice.set(press.userId, index)
  }

  const total = presses.length
  const best = counts.reduce((max, n) => Math.max(max, n), 0)
  const leaders = counts.flatMap((n, i) => (n === best && best > 0 ? [i] : []))
  const tied = leaders.length > 1
  const champion = !tied ? leaders[0] : undefined

  // من صوّت للخيار الفائز يأخذ نقطة — التعادل لا يمنح أحدًا شيئًا
  if (champion !== undefined) {
    for (const [userId, index] of choice) {
      if (index === champion) scores.set(userId, 1)
    }
  }

  const note =
    total === 0
      ? 'ما صوّت أحد'
      : tied
        ? 'تعادل — لا خيار فائز'
        : `فاز: ${options[champion ?? 0] ?? ''}`

  await table.update(
    poll(
      table,
      question,
      options.map((label, i) => ({ label, votes: counts[i] ?? 0 })),
      total,
      note,
    ),
    { text: resultText(question, options, counts, total, tied) },
  )

  return { winnerId: null, scores }
}

function resultText(
  question: string,
  options: string[],
  counts: number[],
  total: number,
  tied: boolean,
): string {
  const lines = options.map(
    (label, i) => `• ${label} — ${counts[i] ?? 0} من ${total}`,
  )
  const head =
    total === 0
      ? `${EMOJI.st_users} ما صوّت أحد.`
      : tied
        ? `${EMOJI.st_users} **تعادل** · لا خيار فائز.`
        : `${EMOJI.win_vote} **انتهى التصويت**`
  return `${head}\n**${question}**\n${lines.join('\n')}`
}

/* ————— أدوات ————— */

function buttons(options: string[]): ButtonDef[] {
  return options.map((label, i) => {
    const face = numberFace(i + 1)
    return {
      id: `opt:${i}`,
      // الرقم ينتقل من النص إلى الوجه حين يوجد وجه، فيتّسع الزر للخيار نفسه.
      // وبدون وجه يبقى الرقم في النص لأن الصورة تحت الأزرار مرقّمة، والمطابقة
      // بالرقم لا بالموضع.
      label: (face ? label : `${i + 1}. ${label}`).slice(0, 60),
      style: 'plain' as const,
      ...(face ? { emoji: face } : {}),
    }
  })
}

function poll(
  table: Table,
  question: string,
  options: { label: string; votes: number }[],
  totalVotes: number,
  note?: string,
): PollScene {
  return {
    kind: 'poll',
    game: table.brief,
    question,
    options: options.map((o, i) => ({ id: `opt:${i}`, label: o.label, votes: o.votes })),
    totalVotes,
    ...(note ? { note } : {}),
  }
}

async function cancel(table: Table, body: string): Promise<void> {
  await table.show(
    { kind: 'notice', tone: 'warn', title: 'أُلغي التصويت', body },
    { text: `أُلغي التصويت: ${body}` },
  )
}
