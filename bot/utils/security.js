// /bot/utils/security.js
import { PermissionsBitField, EmbedBuilder } from 'discord.js';
import GuildConfig from '../../models/GuildConfig.js';
import { logger } from './logger.js';

export function initSecurity(client) {
  // Anti-spam (basic)
  const spamTracker = new Map();

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const config = await GuildConfig.findOne({ guildId: message.guild.id });
    if (!config?.antiSpamEnabled) return;

    const userId = message.author.id;
    const now = Date.now();
    const window = 10000; // 10 seconds
    const maxMessages = 5;

    if (!spamTracker.has(userId)) {
      spamTracker.set(userId, []);
    }

    const userMessages = spamTracker.get(userId);
    userMessages.push(now);
    userMessages.splice(0, userMessages.findIndex(t => now - t > window));

    if (userMessages.length > maxMessages) {
      try {
        await message.member.timeout(10 * 60 * 1000, 'Anti-spam trigger');
        logger.security('ANTI_SPAM_TRIGGERED', { guildId: message.guild.id, userId });
        await message.channel.send({
          embeds: [new EmbedBuilder()
            .setColor(0xFF0000)
            .setDescription(`${message.author}, you've been muted for 10 minutes due to spam.`)
          ]
        });
      } catch (err) {
        logger.error('ANTI_SPAM_FAILED', { error: err.message });
      }
    }
  });

  // Anti-raid (join flood)
  const joinTracker = new Map();

  client.on('guildMemberAdd', async (member) => {
    const guildId = member.guild.id;
    const now = Date.now();
    const window = 60000; // 1 minute
    const threshold = 10; // 10 joins = raid

    if (!joinTracker.has(guildId)) {
      joinTracker.set(guildId, []);
    }

    const joins = joinTracker.get(guildId);
    joins.push(now);
    joins.splice(0, joins.findIndex(t => now - t > window));

    const config = await GuildConfig.findOne({ guildId });
    if (joins.length >= threshold && config?.antiRaidEnabled) {
      logger.security('ANTI_RAID_TRIGGERED', { guildId, joinCount: joins.length });
      // Enable slowmode, lock channels, etc.
      const publicChannels = member.guild.channels.cache
        .filter(c => c.type === 0 && c.permissionsFor(member.guild.roles.everyone).has(PermissionsBitField.Flags.SendMessages));

      for (const channel of publicChannels.values()) {
        try {
          await channel.setRateLimitPerUser(10, 'Raid detected');
        } catch (e) { /* ignore */ }
      }
    }
  });
}
