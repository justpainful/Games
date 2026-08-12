import {
  type ActionRowBuilder,
  AttachmentBuilder,
  type ButtonBuilder,
  type Message,
  type TextBasedChannel,
} from 'discord.js'
import { renderScene } from '../images/render.ts'
import type { Scene } from '../scenes/scene.ts'

/**
 * إرسال المشاهد إلى ديسكورد.
 *
 * قاعدة من DESIGN.md §6: كل صورة يصاحبها نص يلخّص حالتها. الصورة هي المنتج،
 * لكن النص يبقيها قابلة للنسخ والقراءة الآلية، ويعمل لو فشل الرندر.
 */

const FILE_NAME = 'scene.png'

export async function sendScene(
  channel: TextBasedChannel,
  scene: Scene,
  text = '',
  components: readonly ActionRowBuilder<ButtonBuilder>[] = [],
): Promise<Message | null> {
  if (!channel.isSendable()) return null
  const rows = components.length > 0 ? [...components] : undefined
  try {
    const png = await renderScene(scene)
    const file = new AttachmentBuilder(png, { name: FILE_NAME })
    // الصورة والأزرار في نداء واحد. كانا نداءين — إرسال ثم تحرير لتركيب
    // الأزرار — وذلك ذهاب وإياب كامل إلى ديسكورد يُدفع ثمنه في كل جولة،
    // وهو جزء ملموس من التأخير الذي يشعر به اللاعب بعد كل ضغطة.
    return await channel.send({ content: text || undefined, files: [file], components: rows })
  } catch (err) {
    console.error('فشل رندر المشهد:', err)
    // النص وحده أفضل من لا شيء — اللعبة تكمل ولا تتوقف بسبب صورة
    return channel.send({ content: text || 'تعذّر إنشاء الصورة، واللعبة مستمرة.', components: rows })
  }
}

/**
 * يستبدل صورة رسالة قائمة.
 * `attachments: []` ضرورية وإلا تراكمت الصور القديمة مع الجديدة في نفس الرسالة.
 */
export async function editScene(
  message: Message,
  scene: Scene,
  text = '',
  components: readonly ActionRowBuilder<ButtonBuilder>[] = [],
): Promise<Message | null> {
  try {
    const png = await renderScene(scene)
    const file = new AttachmentBuilder(png, { name: FILE_NAME })
    return await message.edit({
      content: text || undefined,
      files: [file],
      attachments: [],
      components: [...components],
    })
  } catch (err) {
    console.error('فشل تحديث المشهد:', err)
    return null
  }
}

/**
 * مؤقت يُعرض في نص الرسالة لا في الصورة.
 *
 * عميل ديسكورد يحدّث هذا الطابع بنفسه كل ثانية مجانًا. البديل — إعادة رندر
 * الصورة كل ثانية — يضرب rate limits فورًا ويحرق المعالج بلا فائدة.
 */
export function countdown(seconds: number): string {
  return `<t:${Math.floor(Date.now() / 1000) + seconds}:R>`
}

/** ذكر مستخدم يظهر كاسم في ديسكورد بلا إشعار مزعج عند التجميع. */
export function mention(userId: string): string {
  return `<@${userId}>`
}
