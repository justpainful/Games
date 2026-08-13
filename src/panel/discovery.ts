import { hostname } from 'node:os'
import { Bonjour, type Service } from 'bonjour-service'

/**
 * إعلان الخادم على الشبكة المحلية بـ Bonjour.
 *
 * ————————————————— لماذا الاكتشاف أصلًا —————————————————
 *
 * البديل أن يكتب صاحب البوت عنوان الجهاز في التطبيق. وهو يعمل مرّة ثم يسقط:
 * الراوتر يوزّع العناوين بالـDHCP فيصير `192.168.1.4` جهازًا آخر بعد أسبوع،
 * ويبدو للمستخدم أن التطبيق تعطّل. ومطاردة ذلك بعنوان Tailscale ثابت هو ما
 * كان يفعله التطبيق القديم، وهو ما طُلب التخلّص منه.
 *
 * وBonjour يحلّها من الجذر: الجهاز ينادي باسمه على الشبكة، والتطبيق يسمع. لا
 * عنوان يُكتب ولا عنوان يُحفظ، وتغيير الراوتر لتوزيعه لا يعني شيئًا.
 *
 * ————————————————— لماذا اسم خدمة خاص —————————————————
 *
 * `_http._tcp` تعلن عنه طابعات وأجهزة تلفاز وكل ما في البيت، فالتطبيق يرى
 * عشرة ويحتاج أن يسأل كلًّا منها. و`_miqwad._tcp` لا يعلنه إلا هذا الخادم،
 * فأول نتيجة هي المطلوبة.
 */

const TYPE = 'miqwad'

let bonjour: Bonjour | null = null
let service: Service | null = null

export function advertise(port: number, botTag: string | null): void {
  if (service) return

  try {
    bonjour = new Bonjour()
    service = bonjour.publish({
      name: `Games — ${hostname()}`,
      type: TYPE,
      port,
      // TXT يصل مع نتيجة البحث نفسها، فالتطبيق يعرض اسم البوت قبل أن يتصل
      txt: { v: '1', bot: botTag ?? 'Games' },
    })
    console.log(`[مقود] مُعلَن على الشبكة كـ _${TYPE}._tcp على المنفذ ${port}`)
  } catch (err) {
    // الإعلان تسهيل لا شرط: من يفشل عنده يبقى أمامه إدخال العنوان يدويًّا
    console.warn('[مقود] تعذّر الإعلان على الشبكة — الاتصال اليدوي يبقى متاحًا:', err)
  }
}

/** يوقف الإعلان ويرسل وداعًا صريحًا، فلا يبقى اسم ميت يجده التطبيق. */
export async function unadvertise(): Promise<void> {
  const active = bonjour
  if (!active) return
  bonjour = null
  service = null
  await new Promise<void>((resolve) => {
    active.unpublishAll(() => {
      active.destroy()
      resolve()
    })
  })
}
