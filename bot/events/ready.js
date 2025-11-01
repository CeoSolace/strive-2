// /bot/events/ready.js
import { ActivityType } from 'discord.js';
import { logger } from '../utils/logger.js';

export const name = 'ready';
export const once = true;

export async function execute(client) {
  logger.info(`✅ Logged in as ${client.user.tag}`);
  logger.info(`🌍 Serving ${client.guilds.cache.size.toLocaleString()} guilds`);

  // Set dynamic presence
  let i = 0;
  const activities = [
    () => `Servers: ${client.guilds.cache.size.toLocaleString()}`,
    () => `Users: ${client.guilds.cache.reduce((acc, g) => acc + g.memberCount, 0).toLocaleString()}`,
    () => 'Type /help',
    () => 'Strive V2'
  ];

  setInterval(() => {
    const name = activities[i]();
    client.user.setActivity(name, { type: ActivityType.Watching });
    i = (i + 1) % activities.length;
  }, 30_000);
}
