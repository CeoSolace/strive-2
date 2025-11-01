// /bot/events/clientReady.js
import { logger } from '../utils/logger.js';

export default function clientReady(client) {
  client.once('clientReady', () => {
    logger.info(`🤖 Logged in as ${client.user.tag} (${client.user.id})`);
    logger.info(`🌍 Serving ${client.guilds.cache.size} guilds`);
    // Add other initialization logic here, e.g., registering commands
  });
}
