/**
 * يوصل بوتًا بالطاولة **كلاعب جوال** لا كبوت ديسكورد.
 *
 *   npx tsx scripts/play-as-bot.ts rooms          يعرض الغرف المفتوحة
 *   npx tsx scripts/play-as-bot.ts join <roomId>  ينضم ويبقى يستمع
 *   npx tsx scripts/play-as-bot.ts press <roomId> <buttonId>
 *
 * ————————————————— لماذا هذا الباب مفتوح وباب ديسكورد مغلق —————————————————
 *
 * ديسكورد لا يسمح للبوتات بضغط أزرار الرسائل، وهذا حدّ في المنصّة لا في الكود.
 * لكن أزرار ديسكورد ليست الطريق الوحيد إلى الطاولة: تطبيق الجوال لا يضغطها
 * أصلًا، بل يفتح وصلة WebSocket ويرسل `press` بمعرّف الزر. و`fanout` يجمع
 * سطح ديسكورد وأسطح الوصلات في طاولة واحدة، فاللعبة لا تعرف من أين جاءت
 * الضغطة ولا يعنيها.
 *
 * فالبوت الذي يعجز عن الضغط في ديسكورد يستطيعه كاملًا من هذا الباب. وليس في
 * ذلك التفاف على قيد أمني: الوصلة تتحقّق من رمز جلسة موقّع، ومن عضوية
 * السيرفر، ومن أن اللاعب انضم للغرفة فعلًا. البوت يمرّ بما يمرّ به الإنسان.
 *
 * ————————————————————— حدّ يبقى قائمًا —————————————————————
 *
 * هذا يفتح ألعاب الأزرار للبوت، ولا يجعله لاعبًا جيدًا فيها. «كود نيمز» تحتاج
 * فهم الروابط بين الكلمات، و«لايرز بار» تحتاج قراءة الخصم. القدرة على الضغط
 * شرط لا يكفي وحده.
 */
import { config } from '../src/api/env.ts'
import { signToken } from '../src/api/jwt.ts'
import { settings } from '../src/settings.ts'

const [action, ...rest] = process.argv.slice(2)
/** السيرفر يُمرَّر بالبيئة: السكربت أداة تشخيص لا يعرف سيرفرًا بعينه. */
const GUILD = process.env['GUILD_ID'] ?? '1535979812860993617'
const BASE = config.publicUrl.replace(/^http/, 'ws')

/** الرمز يُوقَّع بنفس مفتاح الخادم، فهو رمز جلسة حقيقي لا مفتاح خلفي. */
const token = signToken(settings.appId, config.jwt.secret, 3600)

function open(): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`${BASE}/ws?token=${encodeURIComponent(token)}`)
    ws.addEventListener('open', () => resolve(ws))
    ws.addEventListener('error', () => reject(new Error('تعذّر فتح الوصلة')))
  })
}

async function main(): Promise<void> {
  if (action === 'rooms') {
    const res = await fetch(`${config.publicUrl}/rooms?guildId=${GUILD}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
    console.log(res.status, (await res.text()).slice(0, 600))
    return
  }

  const ws = await open()
  console.log('الوصلة مفتوحة')

  ws.addEventListener('message', (event) => {
    const raw = String(event.data)
    const parsed: unknown = JSON.parse(raw)
    const row = parsed as Record<string, unknown>
    const kind = row['type']
    // المشاهد ضخمة، فيُطبع نوعها ونصّها وأزرارها لا كامل الكائن
    if (kind === 'scene') {
      const scene = row['scene'] as Record<string, unknown> | undefined
      const buttons = (row['buttons'] ?? []) as { id: string; label: string }[]
      console.log(
        `[مشهد ${String(scene?.['kind'])}] ${String(row['text'] ?? '').slice(0, 120)}\n` +
          `  أزرار: ${buttons.map((b) => `${b.id}=${b.label}`).join(' · ') || 'لا شيء'}`,
      )
      return
    }
    console.log(`[${String(kind)}]`, raw.slice(0, 300))
  })

  if (action === 'join' || action === 'press') {
    const roomId = rest[0]
    if (!roomId) throw new Error('يلزم معرّف الغرفة')
    ws.send(JSON.stringify({ type: 'join', guildId: GUILD, roomId }))
  }

  if (action === 'press') {
    const buttonId = rest[1]
    if (!buttonId) throw new Error('يلزم معرّف الزر')
    // مهلة قصيرة حتى يكتمل الانضمام قبل أن تُرسل الضغطة
    setTimeout(() => ws.send(JSON.stringify({ type: 'press', id: buttonId, sceneId: null })), 1200)
  }
}

main().catch((err: unknown) => {
  console.error(err)
  process.exit(1)
})
