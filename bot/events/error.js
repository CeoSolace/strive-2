// /bot/events/error.js
import { logger } from '../utils/logger.js';

export const name = 'error';
export const once = false;

export async function execute(error, client) {
  logger.error('DISCORD_CLIENT_ERROR', { message: error.message });
}
