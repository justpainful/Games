import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ShardingManager } from 'discord.js'
import { settings } from './settings.ts'

/**
 * مشغّل الشاردات — لا يُستخدم إلا فوق ~2000 سيرفر.
 *
 * ⚠️ **الذاكرة تتضاعف مع كل شارد.** كل شارد عملية مستقلة تشغّل Chromium خاصًا
 * بها، فأربعة شاردات تعني أربع نسخ من المتصفح. لذلك `RENDER_POOL_SIZE` يجب أن
 * ينخفض إلى 2 عند التشارد بدل 4، وإلا التهم الرندر ذاكرة الخادم.
 *
 * لماذا لا يكسر التشارد حالة الألعاب: ديسكورد يثبّت السيرفر على شارد واحد
 * (`guild_id >> 22 % shards`)، فرسائل القناة تصل دائمًا للعملية التي تحمل
 * لعبتها. الحالة في الذاكرة تبقى صحيحة بلا Redis.
 *
 *   node --import tsx src/shard.ts
 */
const here = path.dirname(fileURLToPath(import.meta.url))

const manager = new ShardingManager(path.join(here, 'app.ts'), {
  token: settings.token,
  totalShards: 'auto',
  execArgv: ['--import', 'tsx'],
  respawn: true,
})

manager.on('shardCreate', (shard) => {
  console.log(`أُطلق الشارد ${shard.id}`)
  shard.on('death', () => console.error(`مات الشارد ${shard.id} — يُعاد تشغيله`))
})

manager.spawn().catch((err) => {
  console.error('فشل إطلاق الشاردات:', err)
  process.exit(1)
})
