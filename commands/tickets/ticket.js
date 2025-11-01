import pkg from 'discord.js';
const { SlashCommandBuilder, ChannelType, PermissionFlagsBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = pkg;
import crypto from 'crypto';

export const data = new SlashCommandBuilder()
  .setName('ticket')
  .setDescription('Create or manage support tickets')
  .addSubcommand(sc => sc.setName('create').setDescription('Send a default ticket panel to the current channel'))
  .addSubcommand(sc => sc.setName('panel').setDescription('Generate a custom ticket panel (admin only)'))
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();

  if (sub === 'create') {
    try {
      // Defer the reply to avoid timeout issues
      await interaction.deferReply({ ephemeral: true });

      // Create default ticket panel embed
      const panelEmbed = new EmbedBuilder()
        .setTitle('Support Ticket Panel')
        .setDescription('Click the button below to create a support ticket.')
        .setColor('#5865F2')
        .setTimestamp();

      // Create ticket panel button
      const panelButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`create_ticket_${interaction.guild.id}`)
          .setLabel('Create Ticket')
          .setStyle(ButtonStyle.Primary)
      );

      // Send the ticket panel to the current channel
      await interaction.channel.send({ embeds: [panelEmbed], components: [panelButton] });

      // Follow up with confirmation
      await interaction.followUp({ content: '✅ Ticket panel sent to this channel.', ephemeral: true });
    } catch (error) {
      console.error('Create error:', error);
      try {
        await interaction.followUp({ content: '❌ Failed to send ticket panel.', ephemeral: true });
      } catch (followUpError) {
        console.error('Follow-up error:', followUpError);
      }
    }

  } else if (sub === 'panel') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
      await interaction.reply({ content: '❌ You lack permission.', ephemeral: true });
      return;
    }

    try {
      // Defer the reply to avoid timeout issues
      await interaction.deferReply({ ephemeral: true });

      const token = `${interaction.guild.id}-${crypto.randomBytes(16).toString('hex')}`;
      const expiresAt = Date.now() + 15 * 60 * 1000; // 15 min

      if (!interaction.client.strive) interaction.client.strive = {};
      if (!interaction.client.strive.ticketTokens) interaction.client.strive.ticketTokens = new Map();
      console.log('Storing token:', token, 'for guild:', interaction.guild.id, 'at:', new Date().toISOString());

      const channels = interaction.guild.channels.cache
        .filter(ch => ch.type === ChannelType.GuildText && ch.viewable)
        .map(ch => ({ id: ch.id, name: ch.name }));

      interaction.client.strive.ticketTokens.set(token, {
        guildId: interaction.guild.id,
        guildName: interaction.guild.name,
        userId: interaction.user.id,
        channels,
        expiresAt,
      });

      const url = `${process.env.BASE_URL}/setup.html?token=${encodeURIComponent(token)}`;
      console.log('Generated URL:', url);

      await interaction.followUp({
        content: `🛠️ Configure your ticket panel here:\n${url}`,
        ephemeral: true,
      });
    } catch (error) {
      console.error('Panel error:', error);
      try {
        await interaction.followUp({ content: '❌ Failed to generate ticket panel.', ephemeral: true });
      } catch (followUpError) {
        console.error('Follow-up error:', followUpError);
      }
    }
  }
}

export async function handleSetupInfo(req, res) {
  const { token } = req.query;
  if (!token) {
    console.log('Missing token at:', new Date().toISOString());
    return res.status(400).json({ error: 'Missing token' });
  }

  const client = req.client;
  if (!client.strive?.ticketTokens?.has(token)) {
    console.log('Invalid token:', token, 'at:', new Date().toISOString());
    return res.status(404).json({ error: 'Invalid token' });
  }

  const tokenData = client.strive.ticketTokens.get(token);
  if (tokenData.expiresAt < Date.now()) {
    console.log('Expired token:', token, 'at:', new Date().toISOString());
    client.strive.ticketTokens.delete(token);
    return res.status(410).json({ error: 'Token expired' });
  }

  const [guildIdFromToken] = token.split('-');
  if (guildIdFromToken !== tokenData.guildId) {
    console.log('Guild mismatch for token:', token, 'Expected:', tokenData.guildId, 'Got:', guildIdFromToken, 'at:', new Date().toISOString());
    return res.status(403).json({ error: 'Token guild mismatch' });
  }

  console.log('Valid token:', token, 'for guild:', tokenData.guildId, 'at:', new Date().toISOString());
  res.json({
    bot: { tag: client.user.tag, id: client.user.id },
    guild: { id: tokenData.guildId, name: tokenData.guildName },
    channels: tokenData.channels,
  });
}

export async function handleSavePanel(req, res) {
  const { token, channelId, panelMessage, embedColor } = req.body;
  if (!token || !channelId) {
    console.log('Missing token or channel ID at:', new Date().toISOString());
    return res.status(400).json({ error: 'Missing token or channel ID' });
  }

  const client = req.client;
  if (!client.strive?.ticketTokens?.has(token)) {
    console.log('Invalid token in save:', token, 'at:', new Date().toISOString());
    return res.status(404).json({ error: 'Invalid or expired token' });
  }

  const tokenData = client.strive.ticketTokens.get(token);
  if (tokenData.expiresAt < Date.now()) {
    console.log('Expired token in save:', token, 'at:', new Date().toISOString());
    client.strive.ticketTokens.delete(token);
    return res.status(410).json({ error: 'Token expired' });
  }

  if (tokenData.guildId !== token.split('-')[0]) {
    console.log('Guild mismatch in save:', token, 'at:', new Date().toISOString());
    return res.status(403).json({ error: 'Token does not match guild' });
  }

  try {
    const channel = await client.channels.fetch(channelId);
    if (!channel || channel.guildId !== tokenData.guildId) {
      console.log('Invalid channel:', channelId, 'at:', new Date().toISOString());
      return res.status(400).json({ error: 'Invalid channel' });
    }

    const embed = new EmbedBuilder()
      .setTitle('Support Ticket')
      .setDescription(panelMessage || 'Click the button below to create a support ticket.')
      .setColor(embedColor || '#5865F2')
      .setTimestamp();

    await channel.send({
      embeds: [embed],
      components: [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: 'Create Ticket',
              custom_id: `create_ticket_${tokenData.guildId}`,
            },
          ],
        },
      ],
    });

    client.strive.ticketTokens.delete(token);
    console.log('Panel sent successfully for token:', token, 'at:', new Date().toISOString());
    res.json({ success: true });
  } catch (error) {
    console.error('Save panel error:', error, 'at:', new Date().toISOString());
    res.status(500).json({ error: 'Failed to send panel' });
  }
}
