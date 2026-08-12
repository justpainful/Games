import { boardScene } from '../scenes/board.ts'
import { cardScene } from '../scenes/card.ts'
import { duelScene } from '../scenes/duel.ts'
import { huntScene } from '../scenes/hunt.ts'
import { leadersScene } from '../scenes/leaders.ts'
import { lobbyScene } from '../scenes/lobby.ts'
import { noticeScene } from '../scenes/notice.ts'
import { panelScene } from '../scenes/panel.ts'
import { pollScene } from '../scenes/poll.ts'
import { profileScene } from '../scenes/profile.ts'
import { rolesScene } from '../scenes/roles.ts'
import { roundScene } from '../scenes/round.ts'
import { standingsScene } from '../scenes/standings.ts'
import { wheelScene } from '../scenes/wheel.ts'
import type { Scene } from '../scenes/scene.ts'
import { shoot } from './browser.ts'

/**
 * المكان الوحيد الذي يعرف أي قالب يخدم أي مشهد.
 * إضافة نوع مشهد جديد يفشل التحويل هنا حتى يُضاف قالبه — مقصود.
 */
export function toHtml(scene: Scene): string {
  switch (scene.kind) {
    case 'lobby':
      return lobbyScene(scene)
    case 'round':
      return roundScene(scene)
    case 'standings':
      return standingsScene(scene)
    case 'board':
      return boardScene(scene)
    case 'duel':
      return duelScene(scene)
    case 'wheel':
      return wheelScene(scene)
    case 'roles':
      return rolesScene(scene)
    case 'hunt':
      return huntScene(scene)
    case 'poll':
      return pollScene(scene)
    case 'card':
      return cardScene(scene)
    case 'profile':
      return profileScene(scene)
    case 'leaders':
      return leadersScene(scene)
    case 'panel':
      return panelScene(scene)
    case 'notice':
      return noticeScene(scene)
  }
}

export async function renderScene(scene: Scene): Promise<Buffer> {
  return shoot(toHtml(scene))
}
