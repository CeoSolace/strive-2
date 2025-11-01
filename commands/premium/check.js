import { SlashCommandBuilder } from 'discord.js';
import Subscription from '../../models/Subscription.js';
import { logger } from '../../utils/logger.js';

export const data = new SlashCommandBuilder()
  .setName('premium')
  .setDescription('Manage your Strive premium subscription')
  .addSubcommand(sc =>
    sc
      .setName('check')
      .setDescription('Check if payment went through')
  )
  .addSubcommand(sc =>
    sc
      .setName('status')
      .setDescription('View your current plan')
  );

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'check') {
    try {
      const subscription = await Subscription.findOne({
        discordUserId: interaction.user.id,
        isActive: true
      });

      if (subscription) {
        await interaction.reply('✅ You have an active premium subscription!');
      } else {
        await interaction.reply('❌ No active premium subscription.');
      }
    } catch (error) {
      logger.error('Error checking subscription:', error);
      await interaction.reply({
        content: '❌ An error occurred while checking your subscription.',
        ephemeral: true
      });
    }
  } else if (sub === 'status') {
    // Replace with actual logic to fetch and display the user's plan
    await interaction.reply({
      content: '📊 You are on the Free plan. (Implement plan retrieval logic here)',
      ephemeral: true
    });
  }
}
