// /bot/events/warn.js
import { logger } from '../utils/logger.js';

export const name = 'warn';
export const once = false;

export async function execute(message, client) {
  logger.warn('DISCORD_WARNING', { message });
}
