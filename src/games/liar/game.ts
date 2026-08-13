import { EMOJI } from '../../design/emoji.ts'
import { numberFace } from '../../design/faces.ts'
import type { CardFace, CardsScene, PlayerView } from '../../scenes/scene.ts'
import type { ButtonDef, GameResult, Press, Table } from '../define.ts'
import { defineGame, zeroScores } from '../define.ts'
import { shuffle } from '../phases.ts'

/**
 * «لايرز بار» — تضع ورقًا مقلوبًا وتدّعي أنه المطلوب، ومن بعدك يصدّق أو يتّهم.
 *
 * ————————————————— لماذا العقوبة مسدّس لا نقطة —————————————————
 *
 * لو كانت العقوبة نقطة تُخصم لصار الكذب حسابًا: تكذب حين يكون الربح أكبر من
 * الخسارة المتوقّعة. والمسدّس يكسر هذا الحساب لأن العقوبة عشوائية القدر ثابتة
 * التراكم: من أُدين مرّتين صار في خطر حقيقي، ومن نجا مرّتين صار جريئًا. وهذا
 * ما يجعل الطاولة تتغيّر مع الجولات بدل أن تكون جولات متشابهة.
 *
 * ————————————————— لماذا اليد رسالة مخفية —————————————————
 *
 * أوراق اللاعب سرّه، ولا مكان لها في القناة. والخاص كان الحلّ القديم في هذا
 * المشروع (مافيا) وله عيبان هنا: يحتاج خاصًّا مفتوحًا، ويجبر اللاعب على ترك
 * القناة في كل دور. والرسالة المخفية تضع يده تحت الطاولة العامة مباشرة.
 *
 * ————————————————— لماذا الاتهام على الأخير وحده —————————————————
 *
 * لا يُتَّهم إلا آخر من وضع. ولولا ذلك لصارت اللعبة تصويتًا جماعيًا على كل
 * لاعب، وضاع ما يميّزها: أنك تراهن على شخص بعينه قرأت وجهه لا على الطاولة.
 */

const DECK: readonly CardFace[] = [
  ...Array.from({ length: 6 }, () => 'ace' as CardFace),
  ...Array.from({ length: 6 }, () => 'king' as CardFace),
  ...Array.from({ length: 6 }, () => 'queen' as CardFace),
  ...Array.from({ length: 2 }, () => 'joker' as CardFace),
]

const DEMANDS: readonly CardFace[] = ['ace', 'king', 'queen']
const HAND = 5
const CHAMBERS = 6
const TURN_MS = 60_000
const CALL_MS = 25_000
const BREATH_MS = 2_000

/** كما تُقال على الطاولة لا كما تُترجم — انظر `scenes/cards.ts`. */
const NAME: Record<CardFace, string> = {
  ace: 'الأص',
  king: 'الشايب',
  queen: 'البنت',
  joker: 'الجوكر',
}

type Seat = {
  player: PlayerView
  hand: CardFace[]
  chambers: number
  alive: boolean
}

function deal(players: PlayerView[]): Seat[] {
  const deck = shuffle(DECK)
  return players.map((player, i) => ({
    player,
    hand: deck.slice(i * HAND, i * HAND + HAND),
    chambers: CHAMBERS,
    alive: true,
  }))
}

function scene(
  table: Table,
  seats: Seat[],
  demand: CardFace,
  turnOf: PlayerView | null,
  extra?: Partial<Pick<CardsScene, 'claim' | 'reveal' | 'hand' | 'note'>>,
): CardsScene {
  return {
    kind: 'cards',
    game: table.brief,
    demand,
    seats: seats.map((seat) => ({
      player: seat.player,
      cards: seat.hand.length,
      alive: seat.alive,
      // الخانات تظهر بعد أول عقوبة: قبلها كلهم سواء والعرض ضجيج
      ...(seat.chambers < CHAMBERS ? { chambers: seat.chambers } : {}),
      ...(turnOf?.id === seat.player.id ? { turn: true } : {}),
    })),
    ...(extra?.claim !== undefined ? { claim: extra.claim } : {}),
    ...(extra?.reveal !== undefined ? { reveal: extra.reveal } : {}),
    ...(extra?.hand ? { hand: extra.hand } : {}),
    ...(extra?.note ? { note: extra.note } : {}),
  }
}

/**
 * أزرار الدور: ورقة لكل بطاقة في اليد، ثم «العب» و«شوف يدي».
 *
 * الاختيار بالضغط المتكرّر لا بقائمة: قائمة ديسكورد تُغلق بعد اختيار واحد،
 * واللاعب يضع حتى ثلاث أوراق فيحتاج أن يرى ما اختاره وهو يختار.
 */
function turnButtons(hand: CardFace[], chosen: Set<number>): ButtonDef[] {
  return [
    ...hand.map((face, i) => ({
      id: `c:${i}`,
      label: `${i + 1}`,
      style: chosen.has(i) ? ('start' as const) : ('plain' as const),
      row: 0,
      ...(numberFace(i + 1) ? { emoji: numberFace(i + 1) } : {}),
      // الوجه لا يظهر على الزر: الأزرار يراها الجميع في القناة
      ...(face ? {} : {}),
    })),
    { id: 'play', label: `العب ${chosen.size || ''}`.trim(), style: 'start', emoji: EMOJI.act_start, row: 1 },
    { id: 'peek', label: 'شوف يدي', style: 'plain', emoji: EMOJI.st_eye, row: 1 },
  ]
}

function cardIndex(pressId: string): number | null {
  const match = /^c:(\d+)$/.exec(pressId)
  return match?.[1] ? Number(match[1]) : null
}

const living = (seats: Seat[]): Seat[] => seats.filter((seat) => seat.alive)

function nextSeat(seats: Seat[], from: PlayerView): Seat | undefined {
  const alive = living(seats)
  if (alive.length === 0) return undefined
  const at = alive.findIndex((seat) => seat.player.id === from.id)
  return alive[(at + 1) % alive.length]
}

async function play(table: Table): Promise<GameResult> {
  const seats = deal(shuffle(table.players))
  let demand = DEMANDS[Math.floor(Math.random() * DEMANDS.length)] ?? 'queen'
  let turnAt = 0

  await table.show(scene(table, seats, demand, seats[0]?.player ?? null, {
    note: 'كل واحد يضغط «شوف يدي» ليرى أوراقه',
  }), {
    text:
      `${EMOJI.st_mask} **لايرز بار** · المطلوب هذه الجولة **${NAME[demand]}**\n` +
      'ضع ورقك مقلوبًا وادّعِ أنه المطلوب. ومن بعدك يصدّق أو يصرخ «كذّاب».',
    buttons: [{ id: 'peek', label: 'شوف يدي', style: 'start', emoji: EMOJI.st_eye }],
  })
  await servePeeks(table, seats, demand, null, 15_000)

  while (!table.aborted && living(seats).length > 1) {
    const alive = living(seats)
    const seat = alive[turnAt % alive.length]
    if (!seat) break

    // يد فرغت: يُعاد التوزيع ويتغيّر المطلوب، وإلا وقفت اللعبة بلا ورق
    if (alive.every((s) => s.hand.length === 0)) {
      demand = DEMANDS[Math.floor(Math.random() * DEMANDS.length)] ?? 'queen'
      const fresh = shuffle(DECK)
      alive.forEach((s, i) => {
        s.hand = fresh.slice(i * HAND, i * HAND + HAND)
      })
      await table.say(`${EMOJI.st_shuffle} وُزّع الورق من جديد · المطلوب **${NAME[demand]}**`)
    }

    if (seat.hand.length === 0) {
      turnAt += 1
      continue
    }

    const played = await takeTurn(table, seats, demand, seat)
    if (table.aborted) break
    if (!played) {
      // لم يضع شيئًا في وقته: يُعدّ ادعاءً كاذبًا بورقة واحدة عشوائية
      const forced = seat.hand.splice(0, 1)
      await table.say(`${EMOJI.time_low} <@${seat.player.id}> تأخّر، فوُضعت عنه ورقة.`)
      await settle(table, seats, demand, seat, forced, null)
      turnAt += 1
      continue
    }

    const accuser = await askCall(table, seats, demand, seat, played.length)
    if (table.aborted) break

    if (!accuser) {
      await table.say(`${EMOJI.st_check} مرّ ادعاء <@${seat.player.id}> بلا اتهام.`)
      await table.sleep(BREATH_MS)
      turnAt += 1
      continue
    }

    await settle(table, seats, demand, seat, played, accuser)
    turnAt += 1
  }

  return await finish(table, seats)
}

/** يخدم «شوف يدي» مدةً محدودة، فاللاعب يحتاج أوراقه في أي لحظة لا في دوره فقط. */
async function servePeeks(
  table: Table,
  seats: Seat[],
  demand: CardFace,
  turnOf: PlayerView | null,
  ms: number,
): Promise<void> {
  const until = Date.now() + ms
  while (!table.aborted && Date.now() < until) {
    const press = await table.waitPress(Math.max(0, until - Date.now()), (p) => p.id === 'peek')
    if (!press) return
    await answerPeek(table, seats, demand, turnOf, press)
  }
}

async function answerPeek(
  table: Table,
  seats: Seat[],
  demand: CardFace,
  turnOf: PlayerView | null,
  press: Press,
): Promise<void> {
  const seat = seats.find((s) => s.player.id === press.userId)
  if (!seat) return
  await table.reveal(press, scene(table, seats, demand, turnOf, { hand: seat.hand }), {
    text: `يدك · المطلوب **${NAME[demand]}**`,
  })
}

/** دور لاعب: يختار حتى ثلاث أوراق ثم يضغط «العب». */
async function takeTurn(
  table: Table,
  seats: Seat[],
  demand: CardFace,
  seat: Seat,
): Promise<CardFace[] | null> {
  const chosen = new Set<number>()
  const until = Date.now() + TURN_MS

  while (!table.aborted && Date.now() < until) {
    await table.update(scene(table, seats, demand, seat.player), {
      text:
        `${EMOJI.st_hand} <@${seat.player.id}> دورك. المطلوب **${NAME[demand]}**. ` +
        `اختر ورقك ثم اضغط «العب»${chosen.size > 0 ? ` · اخترت ${chosen.size}` : ''}`,
      buttons: turnButtons(seat.hand, chosen),
    })

    const press = await table.waitPress(Math.max(0, until - Date.now()), (p) => {
      if (p.id === 'peek') return true
      if (p.userId !== seat.player.id) return false
      if (p.id === 'play') return chosen.size > 0
      const at = cardIndex(p.id)
      return at !== null && at < seat.hand.length
    })

    if (table.aborted || !press) return null

    if (press.id === 'peek') {
      await answerPeek(table, seats, demand, seat.player, press)
      continue
    }
    if (press.id === 'play') break

    const at = cardIndex(press.id)
    if (at === null) continue
    // الضغط يقلب الاختيار، وثلاث هو السقف الأصلي للّعبة
    if (chosen.has(at)) chosen.delete(at)
    else if (chosen.size < 3) chosen.add(at)
  }

  if (chosen.size === 0) return null
  // الحذف من الأعلى للأسفل حتى لا تزحف الفهارس تحت أيدينا
  const picked = [...chosen].sort((a, b) => b - a)
  const cards: CardFace[] = []
  for (const at of picked) {
    const card = seat.hand.splice(at, 1)[0]
    if (card) cards.push(card)
  }
  return cards
}

/** ينتظر من يصرخ «كذّاب» — التالي في الدور وحده يملك ذلك. */
async function askCall(
  table: Table,
  seats: Seat[],
  demand: CardFace,
  seat: Seat,
  count: number,
): Promise<PlayerView | null> {
  const next = nextSeat(seats, seat.player)
  if (!next) return null

  await table.update(
    scene(table, seats, demand, next.player, { claim: { player: seat.player, count } }),
    {
      text:
        `${EMOJI.st_question} <@${seat.player.id}> وضع **${count}** ويدّعي أنها **${NAME[demand]}**.\n` +
        `<@${next.player.id}> صدّقه أو اتهمه.`,
      buttons: [
        { id: 'trust', label: 'أصدّقه', style: 'plain', emoji: EMOJI.st_check },
        { id: 'liar', label: 'كذّاب', style: 'stop', emoji: EMOJI.hot_cross },
        { id: 'peek', label: 'شوف يدي', style: 'plain', emoji: EMOJI.st_eye },
      ],
    },
  )

  const until = Date.now() + CALL_MS
  while (!table.aborted && Date.now() < until) {
    const press = await table.waitPress(Math.max(0, until - Date.now()), (p) => {
      if (p.id === 'peek') return true
      return p.userId === next.player.id && (p.id === 'trust' || p.id === 'liar')
    })
    if (!press) return null
    if (press.id === 'peek') {
      await answerPeek(table, seats, demand, next.player, press)
      continue
    }
    return press.id === 'liar' ? next.player : null
  }
  return null
}

/** يكشف الورق ويوقع العقوبة على من أخطأ. */
async function settle(
  table: Table,
  seats: Seat[],
  demand: CardFace,
  seat: Seat,
  cards: CardFace[],
  accuser: PlayerView | null,
): Promise<void> {
  const truthful = cards.every((card) => card === demand || card === 'joker')
  const blamed = accuser === null || !truthful ? seat : seats.find((s) => s.player.id === accuser.id)
  const target = truthful && accuser ? seats.find((s) => s.player.id === accuser.id) : seat
  if (!target || !blamed) return

  await table.show(
    scene(table, seats, demand, null, {
      reveal: { cards, truthful, accuser: accuser ?? seat.player },
    }),
    {
      text: truthful
        ? `${EMOJI.win_check} <@${seat.player.id}> كان **صادقًا**، والعقوبة على المتّهم.`
        : `${EMOJI.hot_cross} <@${seat.player.id}> كان **يكذب**.`,
    },
  )
  await table.sleep(BREATH_MS)
  await pullTrigger(table, seats, demand, target)
}

/**
 * سحبة زناد واحدة. الاحتمال يتصاعد مع كل نجاة، وهو أصل التوتّر في اللعبة:
 * من نجا خمس مرّات لا يملك إلا خانة واحدة، فالسادسة يقين لا مخاطرة.
 */
async function pullTrigger(
  table: Table,
  seats: Seat[],
  demand: CardFace,
  seat: Seat,
): Promise<void> {
  const hit = Math.floor(Math.random() * seat.chambers) === 0
  seat.chambers = Math.max(1, seat.chambers - 1)

  if (!hit) {
    await table.show(scene(table, seats, demand, null, { note: `نجا ${seat.player.name}` }), {
      text: `${EMOJI.st_timer} <@${seat.player.id}> سحب الزناد و**نجا**.`,
    })
    await table.sleep(BREATH_MS)
    return
  }

  seat.alive = false
  seat.hand = []
  await table.show(scene(table, seats, demand, null, { note: `خرج ${seat.player.name}` }), {
    text: `${EMOJI.hot_bomb} <@${seat.player.id}> **خرج من اللعبة**.`,
  })
  await table.sleep(BREATH_MS)
}

async function finish(table: Table, seats: Seat[]): Promise<GameResult> {
  const alive = living(seats)
  const winner = alive.length === 1 ? alive[0] : undefined
  const scores = zeroScores(table.players)
  if (winner) scores.set(winner.player.id, 3)

  await table.show(
    scene(table, seats, 'queen', null, {
      note: winner ? `فاز ${winner.player.name}` : 'انتهت بلا فائز',
    }),
    {
      text: winner
        ? `${EMOJI.win_trophy} **الفائز** <@${winner.player.id}> · آخر من بقي على الطاولة.`
        : `${EMOJI.st_users} انتهت اللعبة بلا فائز.`,
    },
  )

  return { winnerId: winner?.player.id ?? null, scores }
}

export default defineGame({
  key: 'liar',
  mode: 'event',
  name: 'لايرز بار',
  // الصيغ التي جرّبها اللاعبون فعلًا قبل أن تعمل: الاسم بكلمتين وبلا فراغ،
  // وباللاتينية بالوجهين. الاسم البديل أرخص من أن يقف اللاعب أمام صمت.
  aliases: ['لايرزبار', 'لايرز', 'كذاب', 'ليرز', 'liars bar', 'liarsbar', 'liars', 'liar'],
  tagline: 'ورق مقلوب وادعاء، ومن يكشفك يربح',
  howTo:
    'كل لاعب يأخذ خمس أوراق سرية، والطاولة تطلب نوعًا واحدًا: آس أو ملك أو ملكة. ' +
    'في دورك تضع حتى ثلاث أوراق مقلوبة وتدّعي أنها المطلوب، صدقت أو كذبت. ' +
    'ومن بعدك يصدّقك أو يصرخ «كذّاب»، فتُكشف أوراقك وحدها. ' +
    'إن كنت صادقًا فالعقوبة على متّهمك، وإن كذبت فعليك أنت. ' +
    'والعقوبة سحبة زناد: ست فرص تنقص واحدة كل مرة، ومن نفدت فرصه خرج. ' +
    'والجوكر يطابق أي مطلب، وآخر من يبقى يفوز.',
  players: { min: 3, max: 4 },
  wallet: 'solo',
  play,
})
