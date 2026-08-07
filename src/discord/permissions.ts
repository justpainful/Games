import { PermissionFlagsBits, type GuildMember } from 'discord.js'
import type { GuildConfig } from '../guilds/config.ts'
import { settings } from '../settings.ts'

/**
 * ثلاثة رولات بصلاحيات متدرّجة:
 *   رول الألعاب  → يبدأ الألعاب والإيفنتات
 *   رول الإدارة  → نفس الألعاب + إيقافها
 *   رول النقاط   → يعطي النقاط
 *
 * صاحب السيرفر ومن يملك Administrator مسموحان دائمًا، وإلا لاحتاج كل سيرفر
 * إعدادًا يدويًا قبل أن يعمل البوت أصلًا.
 */
export type Capability = 'startGame' | 'stopGame' | 'awardPoints' | 'settings' | 'ownerPanel'

function hasAnyRole(member: GuildMember, roleIds: Set<string>): boolean {
  if (roleIds.size === 0) return false
  return member.roles.cache.some((r) => roleIds.has(r.id))
}

function isGuildBoss(member: GuildMember): boolean {
  return (
    member.id === member.guild.ownerId || member.permissions.has(PermissionFlagsBits.Administrator)
  )
}

export function can(member: GuildMember, config: GuildConfig, what: Capability): boolean {
  if (what === 'ownerPanel') return member.id === settings.ownerId

  if (isGuildBoss(member)) return true

  switch (what) {
    case 'startGame':
      return hasAnyRole(member, config.roles.GAMES) || hasAnyRole(member, config.roles.ADMIN)
    case 'stopGame':
      // الإيقاف للإدارة وحدها — رول الألعاب يبدأ ولا يوقف
      return hasAnyRole(member, config.roles.ADMIN)
    case 'awardPoints':
      return hasAnyRole(member, config.roles.POINTS) || hasAnyRole(member, config.roles.ADMIN)
    case 'settings':
      return config.authorized.has(member.id) || hasAnyRole(member, config.roles.ADMIN)
  }
}

export const DENIAL: Record<Capability, string> = {
  startGame: 'تحتاج رول الألعاب أو الإدارة لبدء لعبة.',
  stopGame: 'إيقاف الألعاب لرول الإدارة فقط.',
  awardPoints: 'تحتاج رول النقاط لإعطاء النقاط.',
  settings: 'تحتاج صلاحية الإدارة أو أن تكون من المصرح لهم.',
  ownerPanel: 'هذه اللوحة لمالك البوت وحده.',
}
