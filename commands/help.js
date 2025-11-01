// /commands/help.js
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs/promises';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');
const COMMANDS_DIR = join(PROJECT_ROOT, 'commands');

export const data = new SlashCommandBuilder()
  .setName('help')
  .setDescription('Show all available commands');

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const commandMap = new Map(); // category → [commands]

  // Recursively scan /commands and subdirs
  const scanDirectory = async (dirPath, category = 'General') => {
    try {
      const dirents = await fs.readdir(dirPath, { withFileTypes: true });
      for (const dirent of dirents) {
        const fullPath = join(dirPath, dirent.name);
        if (dirent.isDirectory()) {
          // Subdirectory = category
          await scanDirectory(fullPath, dirent.name);
        } else if (dirent.isFile() && dirent.name.endsWith('.js')) {
          try {
            const commandModule = await import(`file://${fullPath}`);
            if (commandModule.data?.name && commandModule.data?.description) {
              if (!commandMap.has(category)) commandMap.set(category, []);
              commandMap.get(category).push({
                name: commandModule.data.name,
                description: commandModule.data.description
              });
            }
          } catch (err) {
            // Skip invalid files
          }
        }
      }
    } catch (err) {
      // Skip unreadable dirs
    }
  };

  await scanDirectory(COMMANDS_DIR);

  // Build embed
  const embed = new EmbedBuilder()
    .setTitle('🛠️ Strive V2 — Command List')
    .setColor(0x00FF00)
    .setFooter({ text: 'Use /help for this list' });

  for (const [category, cmds] of commandMap.entries()) {
    if (cmds.length === 0) continue;
    const fieldText = cmds
      .map(cmd => `\`/${cmd.name}\` — ${cmd.description}`)
      .join('\n');
    embed.addFields({ name: `📁 ${category.charAt(0).toUpperCase() + category.slice(1)}`, value: fieldText, inline: false });
  }

  if (embed.data.fields?.length === 0) {
    embed.setDescription('No commands found.');
  }

  await interaction.editReply({ embeds: [embed] });
}
