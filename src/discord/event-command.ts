import { EMOJI } from '../design/emoji.ts'
import { loadGames } from '../games/all.ts'
import type { GameDef } from '../games/define.ts'
import { runEvent, STOP_REASON, type EventPlan } from '../games/event-run.ts'
import { activeIn, close, open, type Session } from '../games/running.ts'
import { fanout } from '../games/surface.ts'
import { settleMatch } from '../players/settle.ts'
import { openMatch } from '../players/settle.ts'
import type { LeadersScene } from '../scenes/scene.ts'
import type { Command } from './commands.ts'
import { makeDiscordSurface } from './table.ts'
import { playerView } from './players.ts'
import { runSetup } from './event-setup.ts'

/**
 * أمر «فعالية» — يشغّل ألعابًا مفتوحة جولةً بعد جولة بفائز واحد في آخرها.
 *
 *   فعالية اسرع اعلام كت 10          عشر جولات تتناوب الثلاث
 *   فعالية معرفه 15د                  خمس عشرة دقيقة من لعبة واحدة
 *   فعالية                            خمس جولات من كل ألعاب المعرفة
 *
 * ————————————————— لماذا الألعاب المفتوحة وحدها —————————————————
 *
 * الفعالية تشغّل جولات متتابعة بلا لوبي بينها. ولعبة تحتاج لوبيًا — مافيا،
 * كودنيمز، لايرز بار — لا تُشغَّل هكذا: أدوارها تحتاج أصحابًا معروفين، وجمعهم
 * بين كل جولتين يُبطل معنى السلسلة. فمن طلبها في فعالية يُرَدّ ويُقال له لماذا.
 */

// الافتراضي صار في اللوحة: هي التي تعرض الطول وتعدّله، فمرجعه عندها
const MAX_ROUNDS = 40
const MAX_MINUTES = 180

/** `10` جولات، و`15د` أو `15m` دقائق. */
function readLimit(token: string): { rounds?: number; minutes?: number } | null {
  const digits = token.replace(/[^\d]/g, '')
  if (!digits) return null
  const n = Number(digits)
  if (!Number.isFinite(n) || n <= 0) return null
  if (/[ددقmh]/i.test(token.replace(/\d/g, ''))) {
    return { minutes: Math.min(n, MAX_MINUTES) }
  }
  return { rounds: Math.min(n, MAX_ROUNDS) }
}

function findGame(games: GameDef[], token: string): GameDef | undefined {
  const flat = token.trim().toLowerCase()
  return games.find(
    (g) => g.key === flat || g.name.toLowerCase() === flat || (g.aliases ?? []).some((a) => a.toLowerCase() === flat),
  )
}

export const eventCommand: Command = {
  name: 'فعالية',
  aliases: ['فعاليه', 'الفعالية', 'event-run'],
  description: 'يشغّل ألعابًا مفتوحة جولة بعد جولة بفائز واحد في النهاية',
  async run(ctx) {
    if (activeIn(ctx.channelId)) {
      await ctx.say('فيه شيء شغّال في هذه القناة بالفعل.')
      return
    }

    const all = await loadGames()
    const openGames = all.filter((g) => g.mode === 'game')

    const picked: GameDef[] = []
    let limit: { rounds?: number; minutes?: number } = {}
    const rejected: string[] = []

    for (const token of ctx.args) {
      const asLimit = readLimit(token)
      if (asLimit) {
        limit = asLimit
        continue
      }
      const game = findGame(all, token)
      if (!game) continue
      if (game.mode !== 'game') {
        rejected.push(game.name)
        continue
      }
      if (!picked.includes(game)) picked.push(game)
    }

    if (rejected.length > 0) {
      await ctx.say(
        `${EMOJI.hot_cross} ${rejected.join(' و')} تحتاج لوبي وأدوارًا معروفة، فما تنفع في فعالية. ` +
          'شغّلها وحدها.',
      )
      return
    }

    if (openGames.length === 0) {
      await ctx.say('ما فيه ألعاب مفتوحة مسجّلة.')
      return
    }

    /**
     * اللوحة تُفتح دائمًا، ووسائط الأمر تملؤها سلفًا.
     *
     * فمن كتب `فعالية اسرع اعلام 10` يجد اختياره جاهزًا ويضغط «ابدأ»، ومن كتب
     * `فعالية` وحدها يختار من القائمة. ولا يُحرم أحدهما مما اعتاده.
     */
    const setup = await runSetup({
      channel: ctx.channel,
      hostId: ctx.member.id,
      games: openGames,
      preset: picked,
      ...(limit.rounds !== undefined ? { rounds: limit.rounds } : {}),
      ...(limit.minutes !== undefined ? { minutes: limit.minutes } : {}),
    })
    if (!setup.started) {
      await ctx.say('أُلغي إعداد الفعالية.')
      return
    }

    // اللوحة هي المرجع بعد فتحها: ما جاء من الوسائط دخل فيها ثم عُدّل أو بقي
    const { games, rounds, minutes, target } = setup.settings

    await start(ctx, games, {
      ...(rounds !== null ? { rounds } : {}),
      ...(minutes !== null ? { minutes } : {}),
      ...(target !== null ? { target } : {}),
    })
  },
}

async function start(
  ctx: Parameters<Command['run']>[0],
  games: GameDef[],
  limit: { rounds?: number; minutes?: number; target?: number },
): Promise<void> {
  const first = games[0]
  if (!first) return

  let aborted = false
  const session: Session = {
    game: first,
    guildId: ctx.guildId,
    channelId: ctx.channelId,
    hostId: ctx.member.id,
    startedAt: Date.now(),
    abort() {
      aborted = true
    },
    get aborted() {
      return aborted
    },
    attempts: 0,
    chatListeners: new Set(),
    pressListeners: new Set(),
    liveMessageId: null,
    join: null,
  }
  open(session)

  const host = await playerView(ctx.member)
  const surface = makeDiscordSurface({ channel: ctx.channel, session })
  const table = fanout([surface], {
    brief: { key: 'event', name: 'فعالية', tagline: '', howTo: '' },
    players: [host],
    host,
    session,
    // الفعالية مفتوحة كألعابها: من في القناة يشارك بلا انضمام
    open: true,
  })

  const plan: EventPlan = {
    games,
    ...(limit.rounds !== undefined ? { rounds: limit.rounds } : {}),
    ...(limit.minutes !== undefined ? { minutes: limit.minutes } : {}),
    ...(limit.target !== undefined ? { target: limit.target } : {}),
  }

  await table.say(
    `${EMOJI.win_trophy} **بدأت فعالية** · ${games.map((g) => g.name).join(' ثم ')}\n` +
      (plan.rounds ? `${plan.rounds} جولة` : `${plan.minutes ?? 0} دقيقة`) +
      (plan.target ? ` · أول من يبلغ ${plan.target} نقطة يفوز` : '') +
      `\nاكتب إجابتك في الشات، ولا تحتاج تدخل شيئًا.`,
  )

  try {
    const outcome = await runEvent(table, plan, async (game) => {
      // كل جولة تُشغَّل كلعبة مفتوحة قائمة بذاتها، فتُصرف نقاطها كما لو لُعبت وحدها
      session.game = game
      const result = await game.play(table)
      const matchId = await openMatch(ctx.guildId, game.key, Math.max(1, result.scores?.size ?? 1))
      await settleMatch({
        guildId: ctx.guildId,
        wallet: game.wallet,
        players: [...(result.scores?.keys() ?? [])],
        result,
        matchId,
      })
      return result
    })

    const scene: LeadersScene = {
      kind: 'leaders',
      title: 'نتيجة الفعالية',
      rows: outcome.standings.slice(0, 10).map((row) => ({ player: row.player, points: row.points })),
    }

    await table.show(scene, {
      text:
        (outcome.winner
          ? `${EMOJI.win_trophy} **بطل الفعالية** <@${outcome.winner.id}>`
          : `${EMOJI.st_users} انتهت الفعالية بلا بطل واضح`) +
        `\n${outcome.played} جولة · ${STOP_REASON[outcome.stoppedBecause]}`,
    })
  } catch (error) {
    console.error('فعالية تعطّلت:', error)
    await ctx.say('صار خطأ وأُوقفت الفعالية.')
  } finally {
    close(ctx.channelId)
  }
}
