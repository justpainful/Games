import 'dotenv/config'

/** يفشل التشغيل فورًا بدل أن يسقط البوت لاحقًا برسالة غامضة. */
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`المتغيّر ${name} مفقود — انسخ .env.example إلى .env واملأه`)
  return value
}

export const settings = {
  token: required('DISCORD_TOKEN'),
  appId: required('DISCORD_APP_ID'),
  /** مالك البوت — الوحيد الذي يصل للوحة الهوية العالمية */
  ownerId: process.env.BOT_OWNER_ID ?? '',

  defaultPrefix: '!',

  render: {
    poolSize: Number(process.env.RENDER_POOL_SIZE ?? 4),
    timeoutMs: Number(process.env.RENDER_TIMEOUT_MS ?? 8000),
  },

  lobby: {
    /** مهلة اللوبي قبل الإلغاء التلقائي */
    joinSeconds: 60,
  },

  /**
   * بوتات مسموح لها بالجلوس على الطاولة، بمعرّفاتها مفصولة بفواصل.
   *
   * ديسكورد لا يسمح لبوت بالضغط على زر إطلاقًا، فالبوت لا يدخل لوبيًا بنفسه
   * ولا يلعب لعبة تُدار بالأزرار. يبقى له ألعاب الكتابة: يجيب برسالة عادية،
   * والرسالة تصل. لذلك القائمة تفتح بابًا واحدًا لا بابين — تُقبل رسائله
   * إجاباتٍ، ولا تُقبل أوامرَ. بوت يبدأ الألعاب بوت يشغّل نفسه.
   *
   * فارغة افتراضيًا: من لا يريد لاعبًا آليًا لا يحصل عليه بالصدفة.
   */
  botPlayers: new Set(
    (process.env.BOT_PLAYER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter(Boolean),
  ),
} as const
