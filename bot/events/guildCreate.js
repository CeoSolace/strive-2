// /bot/events/guildCreate.js
import { ChannelType, EmbedBuilder } from 'discord.js';
import { logger } from '../utils/logger.js';

export const name = 'guildCreate';
export const once = false;

export async function execute(guild, client) {
  logger.info('GUILD_ADDED', { guildId: guild.id, name: guild.name, memberCount: guild.memberCount });

  // Try to send welcome message
  try {
    let channel = guild.systemChannel;
    if (!channel || !channel.permissionsFor(guild.members.me).has('SendMessages')) {
      channel = guild.channels.cache.find(
        c => c.type === ChannelType.GuildText && c.permissionsFor(guild.members.me).has('SendMessages')
      );
    }

    if (channel) {
      const embed = new EmbedBuilder()
        .setTitle('🚀 Thanks for adding Strive!')
        .setDescription(
          'I’m an all-in-one bot for moderation, music, economy, automation, and more.\n' +
          '• Use `/help` to get started\n' +
          '• Visit the [Dashboard](https://strive-dashboard.onrender.com) to configure\n' +
          '• Contact `ceosolace` for support'
        )
        .setColor(0x00FF00)
        .setFooter({ text: 'Strive V2 — One bot to rule them all' });

      await channel.send({ embeds: [embed] });
    }
  } catch (err) {
    logger.warn('Failed to send welcome message', { guildId: guild.id, error: err.message });
  }
}
