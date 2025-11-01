// /bot/security/antinuke.js
import { PermissionsBitField, Collection } from 'discord.js';
import { logger } from '../utils/logger.js';

export function antinuke(client) {
  const dangerousActions = new Collection(); // userId → count

  const isDangerousAction = (action) => {
    return [
      'GUILD_UPDATE', // server settings change
      'CHANNEL_CREATE',
      'CHANNEL_DELETE',
      'CHANNEL_UPDATE',
      'ROLE_CREATE',
      'ROLE_DELETE',
      'ROLE_UPDATE',
      'GUILD_BAN_ADD',
      'GUILD_BAN_REMOVE',
      'MEMBER_KICK',
      'MEMBER_PRUNE'
    ].includes(action);
  };

  // Listen to audit log for destructive actions
  client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
    const { executorId, action, targetId, reason } = auditLogEntry;
    if (!executorId || executorId === client.user.id) return;

    const member = await guild.members.fetch(executorId).catch(() => null);
    if (!member || member.permissions.has(PermissionsBitField.Flags.Administrator)) return;

    if (isDangerousAction(action)) {
      const now = Date.now();
      const windowMs = 10_000; // 10 seconds
      const threshold = 3;

      if (!dangerousActions.has(executorId)) {
        dangerousActions.set(executorId, []);
      }

      const actions = dangerousActions.get(executorId);
      actions.push({ time: now, action, targetId });

      // Clean old actions
      while (actions.length > 0 && now - actions[0].time > windowMs) {
        actions.shift();
      }

      if (actions.length >= threshold) {
        logger.security('NUKE_DETECTED', { guildId: guild.id, userId: executorId, actions: actions.length });

        // Revoke dangerous permissions
        try {
          await member.roles.set(
            member.roles.cache.filter(r => !r.permissions.has(PermissionsBitField.Flags.Administrator)).map(r => r.id),
            'Anti-nuke protection'
          );

          // Ban if extreme
          // await guild.bans.create(executorId, { reason: 'Anti-nuke: rapid destructive actions' });

          // Notify owners
          const owner = await guild.fetchOwner();
          owner.send(`🚨 Anti-nuke triggered in **${guild.name}** for user <@${executorId}>.`);
        } catch (err) {
          logger.error('Anti-nuke response failed', { error: err.message });
        }

        dangerousActions.delete(executorId);
      }
    }
  });
}
