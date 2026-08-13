import { networkInterfaces } from 'node:os'

/**
 * عناوين فتح التطبيق على هذا الجهاز.
 *
 * ————————————————— لماذا يُطبع العنوان أصلًا —————————————————
 *
 * `server.listen(port)` في node يستمع على كل الواجهات، فالجوال يصل فعلًا منذ
 * أول لحظة. لكن صاحب الجهاز لا يعرف العنوان: `localhost` على الجوال يعني
 * الجوال نفسه، والبحث عن IP الجهاز يمرّ بإعدادات الشبكة في ويندوز. فالسطر
 * المطبوع هو الفرق بين تطبيق يُفتح بلمسة وتطبيق يبدو معطّلًا.
 *
 * والترتيب مقصود: عناوين الشبكة أولًا لأنها ما يُفتح من الجوال، وعنوان الجهاز
 * نفسه بعدها لأنه لا ينفع إلا على نفس الحاسب.
 */

/** عناوين IPv4 المحلية غير الافتراضية، بلا 127.0.0.1. */
export function lanAddresses(): string[] {
  const found: string[] = []
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries ?? []) {
      if (entry.internal) continue
      // node 18+ يعطي family رقمًا أحيانًا ونصًّا أحيانًا حسب المنصّة
      const four = entry.family === 'IPv4' || (entry.family as unknown as number) === 4
      if (!four) continue
      found.push(entry.address)
    }
  }
  // 192.168.x أولًا: هو عنوان شبكة البيت، وما عداه غالبًا محوّل افتراضي
  return found.sort((a, b) => rank(a) - rank(b))
}

function rank(address: string): number {
  if (address.startsWith('192.168.')) return 0
  if (address.startsWith('10.')) return 1
  if (address.startsWith('172.')) return 2
  // 100.x هو Tailscale — آخر القائمة لأن الهدف عدم الاعتماد عليه
  if (address.startsWith('100.')) return 4
  return 3
}

/** عناوين الخادم كما تُدخل يدويًّا في التطبيق إن تعذّر الاكتشاف التلقائي. */
export function panelUrls(port: number): string[] {
  return [...lanAddresses().map((ip) => `http://${ip}:${port}`), `http://localhost:${port}`]
}

export function printPanelUrls(port: number): void {
  console.log('مِقود — التطبيق يجد هذا الجهاز وحده على نفس الواي فاي. وللإدخال اليدوي:')
  for (const url of panelUrls(port)) console.log(`   ${url}`)
}
