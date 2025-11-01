// /bot/security/impersonation.js
import { logger } from '../utils/logger.js';
import GuildConfig from '../../models/GuildConfig.js';

export function impersonation(client) {
  // Common staff-like names
  const suspiciousPatterns = [
    /moderator/i,
    /admin/i,
    /staff/i,
    /owner/i,
    /ceo/i,
    /manager/i,
    /support/i,
    /🔒/i,
    /🛡️/i
  ];

  client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (!newMember.guild || oldMember.displayName === newMember.displayName) return;

    const config = await GuildConfig.findOne({ guildId: newMember.guild.id });
    if (!config?.autoModEnabled) return;

    const newName = newMember.displayName;
    const isSuspicious = suspiciousPatterns.some(pattern => pattern.test(newName));

    if (isSuspicious && !newMember.permissions.has('ADMINISTRATOR')) {
      logger.security('IMPERSONATION_ATTEMPT', {
        guildId: newMember.guild.id,
        userId: newMember.id,
        oldName: oldMember.displayName,
        newName
      });

      try {
        // Revert nickname
        await newMember.setNickname(oldMember.displayName, 'Impersonation prevention');
        await newMember.send('Your nickname was reset because it resembled staff.');
      } catch (err) {
        logger.warn('Failed to revert nickname', { error: err.message });
      }
    }
  });
}
