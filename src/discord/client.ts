import { Client, Events, GatewayIntentBits, Partials } from 'discord.js'
import { deliverChat, deliverPress } from '../games/running.ts'
import { settings } from '../settings.ts'
import { handleMessage, handleSlash } from './commands.ts'
import { holdInteraction } from './tickets.ts'

/**
 * ملاحظة نشر: `MessageContent` نيّة مميّزة (privileged) ويجب تفعيلها يدويًا في
 * لوحة المطوّرين. بدونها لا يعمل البريفكس ولا تصل إجابات ألعاب الكتابة إطلاقًا،
 * والبوت يبدو صامتًا بلا خطأ واضح.
 */
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel], // لازم لاستقبال الرسائل الخاصة
})

client.once(Events.ClientReady, (c) => {
  console.log(`متصل باسم ${c.user.tag} في ${c.guilds.cache.size} سيرفر`)
})

client.on(Events.MessageCreate, (message) => {
  // بوت مأذون له بالجلوس على الطاولة يُقبل مجيبًا لا آمرًا: رسالته تصل إلى
  // اللعبة النشطة ولا تمرّ على مسار الأوامر. بوت يبدأ الألعاب بوت يشغّل نفسه.
  const seated = message.author.bot && settings.botPlayers.has(message.author.id)
  if (message.author.bot && !seated) return

  // كل رسالة تُغذّي اللعبة النشطة أولًا (إجابات ألعاب الكتابة)،
  // ثم تُفحص كأمر بريفكس. الترتيب مهم: الإجابة ليست أمرًا.
  if (message.inGuild()) {
    deliverChat(message.channelId, { userId: message.author.id, text: message.content })
  }

  if (seated) return
  void handleMessage(message).catch((err) => console.error('خطأ في معالجة الرسالة:', err))
})

client.on(Events.InteractionCreate, (interaction) => {
  if (interaction.isChatInputCommand()) {
    void handleSlash(interaction).catch((err) => console.error('خطأ في أمر السلاش:', err))
    return
  }

  if (interaction.isButton()) {
    const taken = deliverPress(interaction.channelId, interaction.message.id, {
      userId: interaction.user.id,
      id: interaction.customId,
      ticket: holdInteraction(interaction),
    })
    // الرد الصامت يمنع ظهور "فشل التفاعل" عند اللاعب دون إرسال رسالة جديدة
    void interaction.deferUpdate().catch(() => {})
    if (!taken) {
      void interaction
        .followUp({ content: 'هذا الزر ما عاد فعّالًا.', ephemeral: true })
        .catch(() => {})
    }
  }
})

export async function connect(): Promise<void> {
  await client.login(settings.token)
}
