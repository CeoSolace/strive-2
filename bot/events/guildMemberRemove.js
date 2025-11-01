// /bot/events/guildMemberRemove.js
import { logger } from '../utils/logger.js';

export const name = 'guildMemberRemove';
export const once = false;

export async function execute(member, client) {
  logger.audit('MEMBER_LEAVE', { guildId: member.guild.id, userId: member.id });
}
