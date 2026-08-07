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
} as const
