import type { GuildMember, User } from 'discord.js'
import type { PlayerView } from '../scenes/scene.ts'

/**
 * تحويل مستخدم ديسكورد إلى `PlayerView` الذي تفهمه المشاهد.
 *
 * الأفتار يُحمَّل مرة ويُحوَّل إلى data: URI. السبب أن صفحة الرندر تُفتح بـ file://
 * فلا تستطيع جلب صور من الشبكة، وحتى لو استطاعت لكان كل رندر ينتظر طلب HTTP.
 */

const AVATAR_PX = 128
const MAX_CACHED = 500
const MAX_BYTES = 2 * 1024 * 1024

/** Map في JS تحفظ ترتيب الإدراج، فحذف أول مفتاح يعطي LRU بسيطًا. */
const cache = new Map<string, string | null>()

function remember(key: string, value: string | null): void {
  if (cache.size >= MAX_CACHED) {
    const oldest = cache.keys().next().value
    if (oldest !== undefined) cache.delete(oldest)
  }
  cache.set(key, value)
}

async function avatarDataUri(user: User): Promise<string | null> {
  // الرابط يتضمّن هاش الأفتار، فتغيير المستخدم لصورته يبطل الكاش تلقائيًا
  const url = user.displayAvatarURL({ extension: 'png', size: AVATAR_PX, forceStatic: true })

  const hit = cache.get(url)
  if (hit !== undefined) return hit

  try {
    const res = await fetch(url)
    if (!res.ok) {
      remember(url, null)
      return null
    }
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.byteLength > MAX_BYTES) {
      remember(url, null)
      return null
    }
    const uri = `data:image/png;base64,${buf.toString('base64')}`
    remember(url, uri)
    return uri
  } catch {
    // أفتار مفقود لا يوقف اللعبة — المشهد يرسم دائرة فارغة مكانه
    remember(url, null)
    return null
  }
}

export async function playerView(member: GuildMember | User): Promise<PlayerView> {
  const user = 'user' in member ? member.user : member
  const name = 'displayName' in member ? member.displayName : user.displayName
  return { id: user.id, name, avatar: await avatarDataUri(user) }
}

/** يحضّر عدة لاعبين بالتوازي — أسرع بكثير من انتظار كل أفتار على حدة. */
export async function playerViews(members: (GuildMember | User)[]): Promise<PlayerView[]> {
  return Promise.all(members.map(playerView))
}
