// /bot/reset-commands.js
import { Client, Collection, GatewayIntentBits } from 'discord.js';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs/promises';

const client = new Client({
  intents: [GatewayIntentBits.Guilds] // Only need Guilds for command registration
});

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// Load commands
const commands = [];
const commandsPath = join(PROJECT_ROOT, 'commands');
const commandFiles = await fs.readdir(commandsPath, { recursive: true });

for (const file of commandFiles) {
  if (file.endsWith('.js')) {
    const filePath = join(commandsPath, file);
    const command = await import(`file://${filePath}`);
    if ('data' in command && 'execute' in command) {
      commands.push(command.data.toJSON());
    }
  }
}

console.log(`Loaded ${commands.length} commands.`);

client.once('ready', async () => {
  console.log('Clearing all global commands...');
  await client.application.commands.set([]);
  console.log('✅ All global commands deleted.');

  console.log('Registering new commands...');
  await client.application.commands.set(commands);
  console.log(`✅ ${commands.length} new commands registered globally.`);

  process.exit(0);
});

client.login(process.env.DISCORD_TOKEN);
