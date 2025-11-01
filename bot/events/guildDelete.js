// /bot/events/guildDelete.js
import { logger } from '../utils/logger.js';
import GuildConfig from '../../models/GuildConfig.js';
import UserEconomy from '../../models/UserEconomy.js';
import Subscription from '../../models/Subscription.js';

export const name = 'guildDelete';
export const once = false;

export async function execute(guild, client) {
  logger.info('GUILD_REMOVED', { guildId: guild.id, name: guild.name });

  // Optional: GDPR-compliant data cleanup (comment out if you want to retain)
  
  await GuildConfig.deleteOne({ guildId: guild.id });
  await UserEconomy.deleteMany({ guildId: guild.id });
  await Subscription.deleteMany({ guildId: guild.id });
  logger.audit('GUILD_DATA_PURGED', { guildId: guild.id });
}
