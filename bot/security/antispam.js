// /bot/security/antispam.js
import { EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';
import ProtectionConfig from '../../models/ProtectionConfig.js';

export function antispam(client) {
  const messageTracker = new Map(); // userId → { timestamps: [], guildId: string }

  // Periodic cleanup to prevent memory leaks
  const cleanupInterval = setInterval(() => {
    const now = Date.now();
    const windowMs = 10_000; // 10 seconds
    let removed = 0;
    for (const [userId, data] of messageTracker) {
      data.timestamps = data.timestamps.filter((ts) => now - ts <= windowMs);
      if (data.timestamps.length === 0) {
        messageTracker.delete(userId);
        removed++;
      }
    }
    logger.debug('Cleaned up messageTracker', { size: messageTracker.size, removed });
  }, 60_000); // Run every 60 seconds

  client.on('messageCreate', async (message) => {
    // Skip bots, non-guild messages, or messages without a member
    if (message.author.bot || !message.guild || !message.member) {
      logger.debug('Message ignored', {
        userId: message.author.id,
        guildId: message.guild?.id,
        isBot: message.author.bot,
        hasGuild: !!message.guild,
        hasMember: !!message.member,
      });
      return;
    }

    const { guild, author, channel } = message;

    // Fetch guild's anti-spam configuration
    let config;
    try {
      config = await ProtectionConfig.findOne({ guildId: guild.id });
      logger.debug('Fetched ProtectionConfig', {
        guildId: guild.id,
        antiSpamEnabled: config?.antiSpamEnabled ?? 'not found',
      });
    } catch (err) {
      logger.error('Failed to fetch ProtectionConfig', {
        guildId: guild.id,
        error: err.message,
      });
      return;
    }

    // Skip if anti-spam is disabled or config is missing
    if (!config?.antiSpamEnabled) {
      logger.debug('Anti-spam disabled or config missing, skipping', { guildId: guild.id });
      return;
    }

    const userId = author.id;
    const now = Date.now();
    const windowMs = 10_000; // 10 seconds
    const maxMessages = 5; // Maximum messages allowed in window

    // Initialize or update user's message tracker
    if (!messageTracker.has(userId)) {
      messageTracker.set(userId, { timestamps: [], guildId: guild.id });
    }

    const userData = messageTracker.get(userId);
    // Reset timestamps if guild changes
    if (userData.guildId !== guild.id) {
      logger.debug('Guild changed for user, resetting timestamps', {
        userId,
        oldGuildId: userData.guildId,
        newGuildId: guild.id,
      });
      userData.timestamps = [];
      userData.guildId = guild.id;
    }

    userData.timestamps.push(now);
    userData.timestamps = userData.timestamps.filter((ts) => now - ts <= windowMs);

    // Log message count for debugging
    logger.debug('User message count', {
      userId,
      guildId: guild.id,
      messageCount: userData.timestamps.length,
      maxMessages,
    });

    // Check if user exceeds message limit
    if (userData.timestamps.length > maxMessages) {
      logger.security('SPAM_DETECTED', { guildId: guild.id, userId });

      try {
        // Check if member is mutable
        if (!message.member.moderatable) {
          logger.warn('Cannot mute member', { guildId: guild.id, userId });
          const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('Anti-Spam Error')
            .setDescription('Cannot mute this user due to permissions.')
            .setTimestamp();
          await channel.send({ embeds: [errorEmbed] });
          return;
        }

        // Apply timeout (10 minutes)
        await message.member.timeout(10 * 60 * 1000, 'Anti-spam auto-mute');

        // Clear timestamps to prevent repeated mutes
        userData.timestamps = [];

        // Create embed for mute notification
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Anti-Spam Warning')
          .setDescription(`${author}, you've been muted for 10 minutes due to excessive messaging.`)
          .addFields(
            { name: 'Reason', value: 'Spam detection (too many messages)' },
            { name: 'Duration', value: '10 minutes' }
          )
          .setTimestamp()
          .setFooter({ text: `Guild: ${guild.name}`, iconURL: guild.iconURL() });

        // Attempt ephemeral message, fall back to non-ephemeral
        try {
          await channel.send({ content: `${author}`, embeds: [embed], ephemeral: true });
        } catch (ephemeralErr) {
          logger.warn('Ephemeral message failed, sending non-ephemeral', {
            guildId: guild.id,
            userId,
            error: ephemeralErr.message,
          });
          await channel.send({ content: `${author}`, embeds: [embed] });
        }
      } catch (err) {
        logger.error('Failed to mute spammer or send notification', {
          guildId: guild.id,
          userId,
          error: err.message,
        });

        const errorEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('Anti-Spam Error')
          .setDescription('Failed to apply anti-spam measures. Please contact an administrator.')
          .setTimestamp();
        await channel.send({ embeds: [errorEmbed] });
      }
    }
  });

  // Cleanup on bot shutdown
  client.on('close', () => {
    clearInterval(cleanupInterval);
    messageTracker.clear();
    logger.debug('Cleaned up antispam resources on shutdown');
  });
}
