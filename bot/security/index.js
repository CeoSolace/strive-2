// /bot/security/index.js
import { antiraid } from './antiraid.js';
import { antispam } from './antispam.js';
import { antilink } from './antilink.js';
import { impersonation } from './impersonation.js';
import { antinuke } from './antinuke.js';
import { automod } from './automod.js';

export function initSecurity(client) {
  antiraid(client);
  antispam(client);
  antilink(client);
  impersonation(client);
  antinuke(client);
  automod(client);
}
