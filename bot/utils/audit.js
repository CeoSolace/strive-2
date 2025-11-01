// /bot/utils/audit.js
import { logger } from './logger.js';

export function initAudit(client) {
  client.on('guildMemberAdd', (member) => {
    logger.audit('MEMBER_JOIN', { guildId: member.guild.id, userId: member.id });
  });

  client.on('guildMemberRemove', (member) => {
    logger.audit('MEMBER_LEAVE', { guildId: member.guild.id, userId: member.id });
  });
}
