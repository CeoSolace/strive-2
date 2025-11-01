// /bot/events/messageCreate.js
// This is primarily handled by security modules (antispam, antilink, etc.)
// But we keep a minimal handler for future extensibility

import { logger } from '../utils/logger.js';

export const name = 'messageCreate';
export const once = false;

export async function execute(message, client) {
  if (message.author.bot) return;

  // Security modules (antispam, antilink, etc.) are initialized separately
  // No additional logic needed here unless you add prefix commands later
}
