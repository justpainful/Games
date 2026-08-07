import { loadGames } from '../games/all.ts'
import { activeIn } from '../games/running.ts'
import { register, type Command } from './commands.ts'
import { startGame } from './host.ts'
import { adminPanelCommands } from './panels/admin.ts'
import { botPanelCommands } from './panels/bot.ts'
import { gamesPanelCommands } from './panels/games.ts'
import { ownerPanelCommands } from './panels/owner.ts'
import { profileCommands } from './profile.ts'

/**
 * يحوّل كل لعبة مكتشفة إلى أمر، ويضيف أوامر التحكّم العامة.
 * اسم الأمر هو اسم اللعبة العربي نفسه — لا ترجمة ولا خرائط أسماء.
 */
export async function registerAllCommands(): Promise<number> {
  const games = await loadGames()

  const gameCommands: Command[] = games.map((game) => ({
    name: game.name,
    ...(game.aliases ? { aliases: game.aliases } : {}),
    description: game.tagline,
    needs: 'startGame' as const,
    run: (ctx) =>
      startGame({
        game,
        channel: ctx.channel,
        starter: ctx.member,
        config: ctx.config,
        guildId: ctx.guildId,
      }),
  }))

  register(
    ...gameCommands,
    stopCommand,
    ...botPanelCommands,
    ...adminPanelCommands,
    ...gamesPanelCommands,
    ...ownerPanelCommands,
    ...profileCommands,
  )

  console.log(`سُجّلت ${games.length} لعبة: ${games.map((g) => g.name).join('، ')}`)
  return games.length
}

const stopCommand: Command = {
  name: 'ايقاف',
  aliases: ['إيقاف'],
  description: 'إيقاف اللعبة الشغّالة في هذه القناة',
  needs: 'stopGame',
  async run(ctx) {
    const session = activeIn(ctx.channelId)
    if (!session) {
      await ctx.say('ما فيه لعبة شغّالة هنا.')
      return
    }
    session.abort()
    await ctx.say(`أُوقفت لعبة **${session.game.name}**.`)
  },
}
