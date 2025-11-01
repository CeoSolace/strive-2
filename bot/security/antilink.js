// /bot/security/antilink.js
import { logger } from '../utils/logger.js';
import GuildConfig from '../../models/GuildConfig.js';

export function antilink(client) {
  // Regex to detect Discord invites, phishing, etc.
  const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite)\/[a-zA-Z0-9]+/i;
  const dangerousLinkRegex = /(?:http|https):\/\/[^\s]*\.(exe|bat|cmd|scr|js|vbs|jar|zip)/i;

  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    const { guild, author, content } = message;
    const config = await GuildConfig.findOne({ guildId: guild.id });
    if (!config?.autoModEnabled) return;

    // Check for invites or dangerous links
    if (inviteRegex.test(content) || dangerousLinkRegex.test(content)) {
      logger.security('LINK_BLOCKED', { guildId: guild.id, userId: author.id, content });

      try {
        await message.delete();
        await message.channel.send({
          content: `${author}, posting invite or executable links is not allowed here.`,
          ephemeral: true
        });
      } catch (err) {
        logger.warn('Failed to delete message or notify', { error: err.message });
      }
    }
  });
}
