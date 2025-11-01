// /bot/events/interactionCreate.js
import pkg from 'discord.js';
const { ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = pkg;
import { logger } from '../utils/logger.js';
import crypto from 'crypto';

export const name = 'interactionCreate';
export const once = false;

export async function execute(interaction, client) {
  // Handle button interactions for ticket system
  if (interaction.isButton()) {
    if (interaction.customId.startsWith('create_ticket_')) {
      try {
        await interaction.deferReply({ ephemeral: true });

        // Find or create the "Strive Tickets" category
        let category = interaction.guild.channels.cache.find(
          ch => ch.type === ChannelType.GuildCategory && ch.name === 'Strive Tickets'
        );

        if (!category) {
          category = await interaction.guild.channels.create({
            name: 'Strive Tickets',
            type: ChannelType.GuildCategory,
            permissionOverwrites: [
              {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel],
              },
              {
                id: client.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels],
              },
              {
                id: interaction.user.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
              },
            ],
          });
        }

        // Create the ticket channel
        const ticketChannel = await interaction.guild.channels.create({
          name: `ticket-${interaction.user.username}-${crypto.randomBytes(4).toString('hex')}`,
          type: ChannelType.GuildText,
          parent: category.id,
          permissionOverwrites: [
            {
              id: interaction.guild.id,
              deny: [PermissionFlagsBits.ViewChannel],
            },
            {
              id: interaction.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
            },
            {
              id: client.user.id,
              allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ManageChannels],
            },
          ],
        });

        // Store ticket data
        if (!client.strive) client.strive = {};
        if (!client.strive.tickets) client.strive.tickets = new Map();
        client.strive.tickets.set(ticketChannel.id, {
          openerId: interaction.user.id,
          guildId: interaction.guild.id,
          createdAt: Date.now(),
        });

        // Create ticket embed
        const ticketEmbed = new EmbedBuilder()
          .setTitle('Support Ticket')
          .setDescription(`Welcome to your support ticket, <@${interaction.user.id}>. A staff member will assist you shortly.`)
          .setColor('#5865F2')
          .setTimestamp();

        // Create ticket buttons
        const ticketButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId(`claim_ticket_${ticketChannel.id}`)
            .setLabel('Claim')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId(`close_ticket_${ticketChannel.id}`)
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger),
          new ButtonBuilder()
            .setCustomId(`reminder_ticket_${ticketChannel.id}`)
            .setLabel('Reminder')
            .setStyle(ButtonStyle.Secondary)
        );

        // Send ping and ticket embed with buttons
        await ticketChannel.send(`<@${interaction.user.id}>`);
        await ticketChannel.send({ embeds: [ticketEmbed], components: [ticketButtons] });

        await interaction.followUp({
          content: `✅ Ticket created: ${ticketChannel}`,
          ephemeral: true,
        });

        logger.info('TICKET_CREATED', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: ticketChannel.id,
        });
      } catch (error) {
        logger.error('TICKET_CREATION_ERROR', {
          userId: interaction.user.id,
          guildId: interaction.guild?.id,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });

        try {
          await interaction.followUp({
            content: '❌ Failed to create ticket.',
            ephemeral: true,
          });
        } catch (followUpError) {
          logger.error('TICKET_FOLLOWUP_ERROR', {
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            error: followUpError.message,
          });
        }
      }
    } else if (interaction.customId.startsWith('close_ticket_')) {
      try {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.followUp({
            content: '❌ This command must be used in a ticket channel.',
            ephemeral: true,
          });
          return;
        }

        const hasPermission = interaction.member.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels);
        if (!hasPermission) {
          await interaction.followUp({
            content: '❌ You do not have permission to close this ticket.',
            ephemeral: true,
          });
          return;
        }

        // Clean up ticket data
        if (client.strive?.tickets?.has(channel.id)) {
          client.strive.tickets.delete(channel.id);
        }

        await channel.delete();
        logger.info('TICKET_CLOSED', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: channel.id,
        });
      } catch (error) {
        logger.error('TICKET_CLOSE_ERROR', {
          userId: interaction.user.id,
          guildId: interaction.guild?.id,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });

        try {
          await interaction.followUp({
            content: '❌ Failed to close ticket.',
            ephemeral: true,
          });
        } catch (followUpError) {
          logger.error('TICKET_FOLLOWUP_ERROR', {
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            error: followUpError.message,
          });
        }
      }
    } else if (interaction.customId.startsWith('claim_ticket_')) {
      try {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.followUp({
            content: '❌ This command must be used in a ticket channel.',
            ephemeral: true,
          });
          return;
        }

        const hasPermission = interaction.member.permissionsIn(channel).has(PermissionFlagsBits.ManageChannels);
        if (!hasPermission) {
          await interaction.followUp({
            content: '❌ You do not have permission to claim this ticket.',
            ephemeral: true,
          });
          return;
        }

        await channel.send({
          content: `${interaction.user} has claimed this ticket.`,
        });

        await interaction.followUp({
          content: '✅ Ticket claimed.',
          ephemeral: true,
        });

        logger.info('TICKET_CLAIMED', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: channel.id,
        });
      } catch (error) {
        logger.error('TICKET_CLAIM_ERROR', {
          userId: interaction.user.id,
          guildId: interaction.guild?.id,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });

        try {
          await interaction.followUp({
            content: '❌ Failed to claim ticket.',
            ephemeral: true,
          });
        } catch (followUpError) {
          logger.error('TICKET_FOLLOWUP_ERROR', {
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            error: followUpError.message,
          });
        }
      }
    } else if (interaction.customId.startsWith('reminder_ticket_')) {
      try {
        await interaction.deferReply({ ephemeral: true });

        const channel = interaction.channel;
        if (!channel.isTextBased()) {
          await interaction.followUp({
            content: '❌ This command must be used in a ticket channel.',
            ephemeral: true,
          });
          return;
        }

        // Get opener from stored ticket data
        const ticketData = client.strive?.tickets?.get(channel.id);
        if (!ticketData?.openerId) {
          await interaction.followUp({
            content: '❌ Could not identify ticket opener.',
            ephemeral: true,
          });
          return;
        }

        const user = await client.users.fetch(ticketData.openerId);
        await user.send({
          content: `Hello! Please check your support ticket in ${interaction.guild.name}: ${channel}`,
        });

        await interaction.followUp({
          content: '✅ Reminder sent to ticket opener.',
          ephemeral: true,
        });

        logger.info('TICKET_REMINDER_SENT', {
          userId: interaction.user.id,
          guildId: interaction.guild.id,
          channelId: channel.id,
          openerId: ticketData.openerId,
        });
      } catch (error) {
        logger.error('TICKET_REMINDER_ERROR', {
          userId: interaction.user.id,
          guildId: interaction.guild?.id,
          error: error.message,
          stack: error.stack?.split('\n').slice(0, 3).join('\n'),
        });

        try {
          await interaction.followUp({
            content: '❌ Failed to send reminder.',
            ephemeral: true,
          });
        } catch (followUpError) {
          logger.error('TICKET_FOLLOWUP_ERROR', {
            userId: interaction.user.id,
            guildId: interaction.guild?.id,
            error: followUpError.message,
          });
        }
      }
    }
    return;
  }

  // Handle slash commands
  if (!interaction.isChatInputCommand()) {
    logger.debug('Non-command interaction ignored', {
      type: interaction.type,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    return;
  }

  // Ensure bot is ready
  if (!client.isReady()) {
    logger.warn('Bot not ready for command', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Bot Not Ready')
      .setDescription('The bot is not ready to process commands. Please try again later.')
      .setTimestamp();
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }

  const command = client.commands.get(interaction.commandName);
  if (!command) {
    logger.warn('Command not found', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
    });
    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Command Not Found')
      .setDescription(`The command \`${interaction.commandName}\` does not exist.`)
      .setTimestamp();
    await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    return;
  }

  // Check permissions
  if (command.data.default_member_permissions) {
    const requiredPermissions = BigInt(command.data.default_member_permissions);
    if (!interaction.member.permissions.has(requiredPermissions)) {
      logger.info('Command permission denied', {
        command: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        permissions: requiredPermissions.toString(),
      });
      const errorEmbed = new EmbedBuilder()
        .setColor('#FF0000')
        .setTitle('Permission Denied')
        .setDescription('You do not have permission to use this command.')
        .setTimestamp();
      await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      return;
    }
  }

  try {
    logger.debug('Executing command', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
    });
    await command.execute(interaction, client);
    logger.info('Command executed successfully', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
    });
  } catch (error) {
    logger.error('COMMAND_ERROR', {
      command: interaction.commandName,
      userId: interaction.user.id,
      guildId: interaction.guild?.id,
      channelId: interaction.channel?.id,
      error: error.message,
      stack: error.stack?.split('\n').slice(0, 3).join('\n'),
    });

    const errorEmbed = new EmbedBuilder()
      .setColor('#FF0000')
      .setTitle('Command Error')
      .setDescription('An error occurred while executing the command.')
      .setTimestamp();

    try {
      if (interaction.deferred || interaction.replied) {
        await interaction.followUp({ embeds: [errorEmbed], ephemeral: true });
      } else {
        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
      }
    } catch (followUpError) {
      logger.error('COMMAND_FOLLOWUP_ERROR', {
        command: interaction.commandName,
        userId: interaction.user.id,
        guildId: interaction.guild?.id,
        error: followUpError.message,
      });
    }
  }
}
