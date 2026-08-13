import { EMOJI } from '../../design/emoji.ts'
import type { PlayerView, RolesScene } from '../../scenes/scene.ts'
import { defineGame, zeroScores, type GameResult, type Table } from '../define.ts'
import { candidateButtons, collectVotes, shuffle } from '../phases.ts'

/**
 * مافيا.
 *
 * القواعد المعتمدة (مكتوبة هنا لأن كل خلاف في لعبة مافيا ينشأ من قاعدة ضمنية):
 *
 * 1. الأدوار: مافيا بعدد `floor(n/4)` وبحد أدنى واحد، طبيب واحد، محقق واحد،
 *    والبقية مواطنون. عند خمسة لاعبين: مافيا + طبيب + محقق + مواطنان.
 * 2. الليل: المافيا يتّفقون على ضحية بالتصويت بينهم. **تعادلهم لا يُكسر** —
 *    اختلافهم يعني ليلة بلا قتل، وهذا أعدل من قرعة تقتل بريئًا.
 * 3. الطبيب ينقذ لاعبًا واحدًا، ولا يكرّر إنقاذ نفس الشخص ليلتين متتاليتين.
 * 4. المحقق يتحرّى عن لاعب، وتصله النتيجة في الخاص وحده: «مافيا» أو «ليس مافيا».
 * 5. النهار: يُعلن القتيل **ودوره** — كشف دور الميت تقليد اللعبة وهو ما يجعل
 *    النقاش ممكنًا. أمّا دور الحيّ فلا يُذكر في القناة إطلاقًا.
 * 6. الإعدام بأغلبية أصوات الأحياء. التعادل يُعلن ويُعاد التصويت مرة واحدة،
 *    فإن تكرّر فلا إعدام في هذا اليوم.
 * 7. النهاية: المواطنون يفوزون بزوال آخر مافيا، والمافيا تفوز حين يتساوى
 *    عددهم مع بقية الأحياء (عندها لا يستطيع التصويت إخراجهم).
 */

type Role = 'mafia' | 'doctor' | 'detective' | 'citizen'

const ROLE_NAME: Record<Role, string> = {
  mafia: 'مافيا',
  doctor: 'طبيب',
  detective: 'محقق',
  citizen: 'مواطن',
}

const MIN_PLAYERS = 5

/** مهلة كل طور. الليل أقصر من النهار لأن فيه قرارًا واحدًا لا نقاشًا. */
const MAFIA_MS = 30_000
const DOCTOR_MS = 25_000
const DETECTIVE_MS = 25_000
const TALK_MS = 50_000
const VOTE_MS = 40_000
const BREATH_MS = 3_000

/** سقف يمنع لعبة لا يموت فيها أحد من الدوران بلا نهاية. */
const MAX_ROUNDS = 15

const DM_PROBE =
  'لعبة **مافيا** على وشك البدء. هذه رسالة تجربة للتأكد أن خاصك يستقبل رسائل البوت — ' +
  'دورك يوصلك هنا بعد ثوانٍ. لا ترد على هذه الرسالة.'

export default defineGame({
  key: 'mafia',
  mode: 'event',
  name: 'مافيا',
  aliases: ['المافيا'],
  tagline: 'ليل يقتل ونهار يحاكم — من تصدّق ومن تعدم؟',
  howTo:
    'توزّع الأدوار في الخاص: مافيا وطبيب ومحقق ومواطنون. في الليل تختار المافيا ضحية، ' +
    'ويحاول الطبيب إنقاذ أحدهم، ويتحرّى المحقق عن لاعب. في النهار تناقشون وتصوّتون على إعدام ' +
    'واحد. يفوز المواطنون بإخراج كل المافيا، وتفوز المافيا إذا صار عددها مساويًا لعدد الباقين.',
  players: { min: MIN_PLAYERS, max: 15 },
  wallet: 'team',
  play,
})

async function play(table: Table): Promise<GameResult> {
  const roster = [...table.players]
  const scores = zeroScores(roster)

  // الخاص يُفحص **قبل** توزيع الأدوار: لو وزّعنا أولًا لاضطررنا إمّا إلى إخراج
  // لاعب يعرف دوره (فيسرّبه) أو إلى ترك لاعب يلعب دورًا لا يعرفه.
  const reachable = await probePrivates(table, roster)
  if (table.aborted) return { winnerId: null, scores }

  if (reachable.length < MIN_PLAYERS) {
    await table.show(
      {
        kind: 'notice',
        tone: 'warn',
        title: 'أُلغيت اللعبة',
        body: `ما بقي إلا ${reachable.length} لاعبين خاصّهم مفتوح، ومافيا تحتاج ${MIN_PLAYERS} على الأقل.`,
      },
      { text: 'افتحوا الرسائل الخاصة من إعدادات السيرفر ثم أعيدوا اللعبة.' },
    )
    return { winnerId: null, scores }
  }

  const roles = assignRoles(reachable)
  if (!(await sendRoles(table, reachable, roles))) return { winnerId: null, scores }

  const state: State = { alive: [...reachable], dead: [] }
  let lastSaved: string | null = null
  let winner: Side | null = null
  /** جولات مرّت بلا قتيل ولا معدوم — طاولة هُجرت ولا داعي لإكمال خمس عشرة جولة. */
  let stalled = 0

  for (let round = 1; round <= MAX_ROUNDS && !table.aborted; round++) {
    /* ————— الليل ————— */
    const victimId = await mafiaChoice(table, state, roles, round)
    if (table.aborted) break

    const savedId = await doctorChoice(table, state, roles, lastSaved)
    if (savedId) lastSaved = savedId
    if (table.aborted) break

    await detectiveChoice(table, state, roles)
    if (table.aborted) break

    const killed = victimId && victimId !== savedId ? find(state.alive, victimId) : null
    if (killed) eliminate(table, state, killed)

    await dawn(table, state, roles, killed, savedId !== null && victimId === savedId)

    winner = outcome(state, roles)
    if (winner) break
    if (table.aborted) break

    /* ————— النهار ————— */
    await table.sleep(BREATH_MS)
    const executed = await dayVote(table, state, round)
    if (table.aborted) break
    if (executed) eliminate(table, state, executed)

    winner = outcome(state, roles)
    if (winner) break

    stalled = killed || executed ? 0 : stalled + 1
    if (stalled >= 3) {
      await table.say('ثلاث جولات بلا قتيل ولا إعدام — يبدو أن الطاولة هُجرت. أوقفت اللعبة.')
      break
    }
  }

  if (table.aborted) return { winnerId: null, scores }

  return await finish(table, state, roles, winner, roster, scores)
}

/* ————— التمهيد ————— */

type State = { alive: PlayerView[]; dead: PlayerView[] }
type Side = 'mafia' | 'town'

/**
 * يجرّب الخاص على كل لاعب ويخرج من لم تصله الرسالة.
 * الإعلان في القناة يذكر الاسم ولا يذكر دورًا — لأنه لا دور بعد.
 */
async function probePrivates(table: Table, roster: PlayerView[]): Promise<PlayerView[]> {
  const ok: PlayerView[] = []
  const blocked: PlayerView[] = []

  await table.say('**مافيا** — أتأكد أولًا أن خاص كل لاعب مفتوح لاستقبال دوره...')

  for (const p of roster) {
    if (table.aborted) return ok
    if (await table.whisper(p.id, DM_PROBE)) ok.push(p)
    else blocked.push(p)
  }

  if (blocked.length > 0) {
    const names = blocked.map((p) => `<@${p.id}>`).join('، ')
    await table.say(
      `ما وصلت رسالة الخاص إلى ${names} — خاصّهم مقفل، فخرجوا من هذه الجولة. ` +
        'لتلعبوا معنا: إعدادات السيرفر ← الخصوصية ← السماح برسائل الأعضاء.',
    )
    for (const p of blocked) table.drop(p.id)
  }

  return ok
}

function assignRoles(players: PlayerView[]): Map<string, Role> {
  const order = shuffle(players)
  const mafiaCount = Math.max(1, Math.floor(players.length / 4))
  const roles = new Map<string, Role>()

  order.forEach((p, i) => {
    if (i < mafiaCount) roles.set(p.id, 'mafia')
    else if (i === mafiaCount) roles.set(p.id, 'doctor')
    else if (i === mafiaCount + 1) roles.set(p.id, 'detective')
    else roles.set(p.id, 'citizen')
  })

  return roles
}

/**
 * يوزّع الأدوار في الخاص. الفشل هنا بعد نجاح رسالة التجربة نادر لكنه قاتل:
 * لاعب لا يعرف دوره يفسد الجولة، وإخراجه بعد التوزيع يكشف أن دوره كان مميزًا.
 * لذلك تُلغى الجولة كلها بلا ذكر أي دور.
 */
async function sendRoles(
  table: Table,
  players: PlayerView[],
  roles: Map<string, Role>,
): Promise<boolean> {
  const mafia = players.filter((p) => roles.get(p.id) === 'mafia')
  const failed: PlayerView[] = []

  for (const p of players) {
    if (table.aborted) return false
    const role = roles.get(p.id) ?? 'citizen'
    if (!(await table.whisper(p.id, roleBrief(role, p, mafia)))) failed.push(p)
  }

  if (failed.length > 0) {
    const names = failed.map((p) => `<@${p.id}>`).join('، ')
    await table.show(
      {
        kind: 'notice',
        tone: 'warn',
        title: 'أُلغيت اللعبة',
        body: 'ما وصل الدور إلى كل اللاعبين في الخاص.',
      },
      {
        text:
          `تعذّر إيصال الدور إلى ${names} بعد أن كان خاصّهم مفتوحًا. ` +
          'أُلغيت الجولة كاملة — لا نكمل بلاعب لا يعرف دوره، ولا نعلن دور أحد في القناة.',
      },
    )
    return false
  }

  await table.say('وصلت الأدوار في الخاص. من لم تصله رسالة فليقل الآن قبل أن يبدأ الليل.')
  return true
}

function roleBrief(role: Role, self: PlayerView, mafia: PlayerView[]): string {
  const head = `دورك في هذه الجولة: **${ROLE_NAME[role]}**`
  if (role === 'mafia') {
    const mates = mafia.filter((m) => m.id !== self.id)
    const line =
      mates.length > 0
        ? `شركاؤك: ${mates.map((m) => m.name).join('، ')}.`
        : 'أنت المافيا الوحيد في هذه الجولة.'
    return `${head}\n${line}\nفي كل ليلة تختارون ضحية بالأزرار. لا تكشف نفسك في القناة.`
  }
  if (role === 'doctor') {
    return `${head}\nكل ليلة تنقذ لاعبًا واحدًا من القتل، ولا تنقذ نفس الشخص ليلتين متتاليتين.`
  }
  if (role === 'detective') {
    return `${head}\nكل ليلة تتحرّى عن لاعب، وتصلك هنا نتيجة واحدة: مافيا أو ليس مافيا.`
  }
  return `${head}\nلا قدرة ليلية لديك. سلاحك النقاش والتصويت في النهار.`
}

/* ————— الليل ————— */

async function mafiaChoice(
  table: Table,
  state: State,
  roles: Map<string, Role>,
  round: number,
): Promise<string | null> {
  const mafia = state.alive.filter((p) => roles.get(p.id) === 'mafia')
  const targets = state.alive.filter((p) => roles.get(p.id) !== 'mafia')
  if (mafia.length === 0 || targets.length === 0) return null

  await table.show(
    scene(
      table,
      state,
      'night',
      'نام أهل القرية، واستيقظت المافيا',
      'المافيا تختار ضحيتها الآن. أزرار الاختيار لا تعمل إلا معهم.',
    ),
    {
      text: `**الليلة ${round}** — المافيا تختار ضحية. ${deadline(MAFIA_MS)}`,
      buttons: candidateButtons(targets),
    },
  )

  const tally = await collectVotes(table, targets, MAFIA_MS, {
    eligible: new Set(mafia.map((p) => p.id)),
  })

  // اختلاف المافيا لا يُحسم بقرعة — ليلة بلا قتل أعدل من قتل باختيار عشوائي
  if (tally.tied || !tally.winnerId) return null
  return tally.winnerId
}

async function doctorChoice(
  table: Table,
  state: State,
  roles: Map<string, Role>,
  lastSaved: string | null,
): Promise<string | null> {
  const doctor = state.alive.find((p) => roles.get(p.id) === 'doctor')
  if (!doctor) return null

  const targets = state.alive.filter((p) => p.id !== lastSaved)
  if (targets.length === 0) return null

  await table.update(
    scene(
      table,
      state,
      'night',
      'الطبيب يفتح حقيبته',
      'ينقذ لاعبًا واحدًا الليلة، ولا يكرّر إنقاذ من أنقذه أمس.',
    ),
    {
      text: `الطبيب يختار من ينقذ. ${deadline(DOCTOR_MS)}`,
      buttons: candidateButtons(targets),
    },
  )

  const valid = new Set(targets.map((p) => p.id))
  const press = await table.waitPress(
    DOCTOR_MS,
    (p) => p.userId === doctor.id && p.id.startsWith('vote:') && valid.has(p.id.slice(5)),
  )

  return press ? press.id.slice('vote:'.length) : null
}

async function detectiveChoice(
  table: Table,
  state: State,
  roles: Map<string, Role>,
): Promise<void> {
  const detective = state.alive.find((p) => roles.get(p.id) === 'detective')
  if (!detective) return

  const targets = state.alive.filter((p) => p.id !== detective.id)
  if (targets.length === 0) return

  await table.update(
    scene(
      table,
      state,
      'night',
      'المحقق يفتح ملفًا',
      'يتحرّى عن لاعب واحد، والنتيجة تصله في الخاص وحده.',
    ),
    {
      text: `المحقق يختار من يتحرّى عنه. ${deadline(DETECTIVE_MS)}`,
      buttons: candidateButtons(targets),
    },
  )

  const valid = new Set(targets.map((p) => p.id))
  const press = await table.waitPress(
    DETECTIVE_MS,
    (p) => p.userId === detective.id && p.id.startsWith('vote:') && valid.has(p.id.slice(5)),
  )
  if (!press) return

  const suspect = find(state.alive, press.id.slice('vote:'.length))
  if (!suspect) return

  const verdict = roles.get(suspect.id) === 'mafia' ? 'مافيا' : 'ليس مافيا'
  const sent = await table.whisper(detective.id, `نتيجة تحرّيك عن **${suspect.name}**: ${verdict}.`)

  // لا نقول من هو المحقق ولا عمّن تحرّى — فقط أن النتيجة ضاعت
  if (!sent) await table.say('تعذّر إيصال نتيجة التحرّي في الخاص، وضاعت هذه الليلة.')
}

/** الفجر: يُعلن القتيل ودوره — كشف دور الميت هو ما يجعل نقاش النهار ممكنًا. */
async function dawn(
  table: Table,
  state: State,
  roles: Map<string, Role>,
  killed: PlayerView | null,
  saved: boolean,
): Promise<void> {
  const headline = killed
    ? `قُتل ${killed.name} في الليل`
    : saved
      ? 'وصل الطبيب في الوقت المناسب'
      : 'مرّت الليلة بلا قتيل'

  const detail = killed
    ? `كان دوره: ${ROLE_NAME[roles.get(killed.id) ?? 'citizen']}.`
    : saved
      ? 'كان هناك هدف الليلة، لكن الطبيب أنقذه.'
      : 'لم تتفق المافيا على ضحية.'

  await table.update(
    scene(table, state, 'day', headline, detail, killed),
    {
      text: killed
        ? `**طلع النهار** — خرج <@${killed.id}> وكان **${ROLE_NAME[roles.get(killed.id) ?? 'citizen']}**.`
        : '**طلع النهار** — ما خرج أحد الليلة.',
    },
  )
}

/* ————— النهار ————— */

async function dayVote(table: Table, state: State, round: number): Promise<PlayerView | null> {
  await table.show(
    scene(
      table,
      state,
      'day',
      'النقاش مفتوح',
      'تكلّموا واتّهموا، ثم يفتح التصويت. أعلى الأصوات يُعدم، والتعادل يعني إعادة.',
    ),
    { text: `**اليوم ${round}** — نقاش. يفتح التصويت ${deadline(TALK_MS)}` },
  )
  await table.sleep(TALK_MS)
  if (table.aborted) return null

  const first = await runVote(table, state, 'صوّتوا على من يُعدم')
  if (table.aborted) return null
  if (first.kind === 'chosen') return first.player
  if (first.kind === 'none') {
    await table.say(`${EMOJI.st_vote} ما صوّت أحد، فلا إعدام اليوم.`)
    return null
  }

  // التعادل يُعلن ولا يُكسر بقرعة: إعدام بالحظ يفقد اللاعبين الثقة باللعبة
  await table.say(`${EMOJI.st_vote} **تعادل** في الأصوات، فيُعاد التصويت مرة واحدة.`)
  const second = await runVote(table, state, 'تعادل · التصويت الأخير')
  if (table.aborted) return null
  if (second.kind === 'chosen') return second.player

  await table.say(`${EMOJI.hot_vote} تعادل مرة ثانية، فلا إعدام اليوم وتبدأ الليلة.`)
  return null
}

type VoteOutcome =
  | { kind: 'chosen'; player: PlayerView }
  | { kind: 'tied' }
  | { kind: 'none' }

async function runVote(table: Table, state: State, headline: string): Promise<VoteOutcome> {
  await table.update(
    scene(table, state, 'day', headline, 'صوت واحد لكل حيّ، وآخر ضغطة هي المعتمدة.'),
    {
      text: `التصويت مفتوح. ${deadline(VOTE_MS)}`,
      buttons: candidateButtons(state.alive),
    },
  )

  const tally = await collectVotes(table, state.alive, VOTE_MS, {
    eligible: new Set(state.alive.map((p) => p.id)),
  })

  if (tally.voters === 0) return { kind: 'none' }
  if (tally.tied || !tally.winnerId) return { kind: 'tied' }

  const player = find(state.alive, tally.winnerId)
  return player ? { kind: 'chosen', player } : { kind: 'none' }
}

/* ————— النهاية ————— */

function outcome(state: State, roles: Map<string, Role>): Side | null {
  const mafia = state.alive.filter((p) => roles.get(p.id) === 'mafia').length
  const town = state.alive.length - mafia
  if (mafia === 0) return 'town'
  if (mafia >= town) return 'mafia'
  return null
}

async function finish(
  table: Table,
  state: State,
  roles: Map<string, Role>,
  winner: Side | null,
  roster: PlayerView[],
  scores: Map<string, number>,
): Promise<GameResult> {
  const mafia = roster.filter((p) => roles.get(p.id) === 'mafia')
  const winners =
    winner === 'mafia' ? mafia : winner === 'town' ? roster.filter((p) => !mafia.includes(p)) : []

  for (const p of winners) scores.set(p.id, 3)

  const headline =
    winner === 'mafia' ? 'فازت المافيا' : winner === 'town' ? 'فاز أهل القرية' : 'انتهت بلا حسم'
  const detail =
    winner === 'mafia'
      ? 'تساوى عدد المافيا مع بقية الأحياء، ولم يعد التصويت قادرًا على إخراجهم.'
      : winner === 'town'
        ? 'خرجت آخر مافيا من اللعبة.'
        : 'طالت الجولة أكثر من اللازم فأُوقفت.'

  // فوز جماعي لا فائز أوحد — إلا حين ينتهي الأمر بلاعب واحد فعلًا
  const champion = winners.length === 1 ? winners[0] : undefined

  await table.show(
    scene(table, state, 'result', headline, detail, champion),
    {
      text:
        `**${headline}**\nالمافيا كانت: ${mafia.map((p) => `<@${p.id}>`).join('، ')}` +
        (winners.length > 0 ? `\nالفائزون: ${winners.map((p) => `<@${p.id}>`).join('، ')}` : ''),
    },
  )

  return { winnerId: champion ? champion.id : null, scores }
}

/* ————— أدوات ————— */

function scene(
  table: Table,
  state: State,
  phase: RolesScene['phase'],
  headline: string,
  detail: string,
  spotlight?: PlayerView | null,
): RolesScene {
  return {
    kind: 'roles',
    game: table.brief,
    phase,
    headline,
    detail,
    alive: state.alive,
    dead: state.dead,
    ...(spotlight ? { spotlight } : {}),
  }
}

function eliminate(table: Table, state: State, player: PlayerView): void {
  state.alive = state.alive.filter((p) => p.id !== player.id)
  state.dead = [...state.dead, player]
  table.drop(player.id)
}

function find(players: PlayerView[], id: string): PlayerView | null {
  return players.find((p) => p.id === id) ?? null
}

/** الوقت المتبقي في نص الرسالة: عميل ديسكورد يحدّثه مجانًا بلا إعادة رندر. */
function deadline(ms: number): string {
  return `ينتهي <t:${Math.floor(Date.now() / 1000) + Math.round(ms / 1000)}:R>`
}
