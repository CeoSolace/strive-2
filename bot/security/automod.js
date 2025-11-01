// /bot/security/automod.js
import { logger } from '../utils/logger.js';
import GuildConfig from '../../models/GuildConfig.js';

export function automod(client) {
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const { guild, author, content } = message;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config?.autoModEnabled || !config.autoModKeywords?.length) return;

    const lowerContent = content.toLowerCase();
    const matchedKeyword = config.autoModKeywords.find(kw => lowerContent.includes(kw.toLowerCase()));

    if (matchedKeyword) {
      logger.security('AUTOMOD_KEYWORD_DETECTED', {
        guildId: guild.id,
        userId: author.id,
        keyword: matchedKeyword,
        content
      });

      try {
        await message.delete();
        await message.channel.send({
          content: `${author}, your message was removed for containing blocked content.`,
          ephemeral: true
        });
      } catch (err) {
        logger.warn('AutoMod cleanup failed', { error: err.message });
      }
    }
  });
}
