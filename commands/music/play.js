import { SlashCommandBuilder, PermissionsBitField, ChannelType } from 'discord.js';
import { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus } from '@discordjs/voice';
import ytdl from 'ytdl-core';
import { createLogger, format, transports } from 'winston';

// Logger setup (console only)
const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [
    new transports.Console()
  ]
});

// In-memory queue
const queues = new Map();

export const data = new SlashCommandBuilder()
  .setName('play')
  .setDescription('Play music from YouTube in a specified voice channel.')
  .addStringOption(option =>
    option.setName('query')
      .setDescription('YouTube URL')
      .setRequired(true)
  )
  .addChannelOption(option =>
    option.setName('channel')
      .setDescription('The voice channel to play music in')
      .addChannelTypes(ChannelType.GuildVoice)
      .setRequired(true)
  );

export async function execute(interaction) {
  // Log command execution
  logger.info('Executing command', {
    command: 'play',
    userId: interaction.user.id,
    guildId: interaction.guild?.id,
    channelId: interaction.channelId
  });

  // Ensure command is used in a guild
  if (!interaction.guild) {
    logger.warn('Play command used outside a guild', { userId: interaction.user.id });
    return interaction.reply({ content: '❌ This command can only be used in a server!', ephemeral: true });
  }

  // Get the selected voice channel
  const voiceChannel = interaction.options.getChannel('channel');
  if (!voiceChannel || voiceChannel.type !== ChannelType.GuildVoice) {
    logger.warn('Invalid or non-voice channel selected', {
      userId: interaction.user.id,
      channelId: voiceChannel?.id,
      guildId: interaction.guild.id
    });
    return interaction.reply({ content: '❌ Please select a valid voice channel!', ephemeral: true });
  }

  // Check bot permissions for the voice channel
  if (!voiceChannel.permissionsFor(interaction.client.user).has([
    PermissionsBitField.Flags.Connect,
    PermissionsBitField.Flags.Speak
  ])) {
    logger.warn('Bot lacks voice channel permissions', {
      guildId: interaction.guild.id,
      channelId: voiceChannel.id
    });
    return interaction.reply({
      content: '❌ I lack permissions to join or speak in the selected voice channel!',
      ephemeral: true
    });
  }

  // Log selected voice channel
  logger.info('Voice channel selected', {
    userId: interaction.user.id,
    channelId: voiceChannel.id,
    channelName: voiceChannel.name,
    guildId: interaction.guild.id
  });

  // Defer reply immediately to avoid timeout
  try {
    await interaction.deferReply();
  } catch (err) {
    logger.error('Failed to defer reply', {
      error: err.message,
      guildId: interaction.guild.id
    });
    return; // Exit if defer fails
  }

  const query = interaction.options.getString('query');

  // Validate YouTube URL
  if (!ytdl.validateURL(query)) {
    logger.warn('Invalid YouTube URL provided', { query, userId: interaction.user.id });
    return interaction.editReply({ content: '❌ Please provide a valid YouTube URL.', ephemeral: true });
  }

  try {
    // Get video info
    const videoInfo = await ytdl.getInfo(query).catch(err => {
      throw new Error(`Failed to fetch YouTube video info: ${err.message}`);
    });
    const song = {
      title: videoInfo.videoDetails.title,
      url: videoInfo.videoDetails.video_url
    };
    logger.info('Fetched song info', { title: song.title, url: song.url });

    // Initialize queue for the guild
    let queue = queues.get(interaction.guild.id);
    if (!queue) {
      queue = {
        songs: [],
        player: createAudioPlayer(),
        connection: null
      };
      queues.set(interaction.guild.id, queue);
    }

    // Add song to queue
    queue.songs.push(song);

    // Join the specified voice channel if not already connected
    if (!queue.connection) {
      try {
        queue.connection = joinVoiceChannel({
          channelId: voiceChannel.id,
          guildId: interaction.guild.id,
          adapterCreator: interaction.guild.voiceAdapterCreator
        });
        logger.info('Bot joined voice channel', {
          guildId: interaction.guild.id,
          channelId: voiceChannel.id,
          channelName: voiceChannel.name
        });
      } catch (err) {
        logger.error('Failed to join voice channel', {
          error: err.message,
          guildId: interaction.guild.id,
          channelId: voiceChannel.id
        });
        queues.delete(interaction.guild.id);
        return interaction.editReply({
          content: '❌ Failed to join the selected voice channel. Please check my permissions and try again.',
          ephemeral: true
        });
      }

      // Player error handling
      queue.player.on('error', error => {
        logger.error('Audio player error', {
          error: error.message,
          guildId: interaction.guild.id
        });
        interaction.followUp({ content: '❌ An error occurred while playing the audio.', ephemeral: true }).catch(err => {
          logger.error('Failed to send follow-up', { error: err.message });
        });
        queue.songs = [];
        queue.connection.destroy();
        queues.delete(interaction.guild.id);
      });

      // Handle idle state (play next song or disconnect)
      queue.player.on(AudioPlayerStatus.Idle, () => {
        queue.songs.shift();
        if (queue.songs.length > 0) {
          playSong(interaction, queue);
        } else {
          queue.connection.destroy();
          queues.delete(interaction.guild.id);
          logger.info('Queue empty, disconnected from voice channel', {
            guildId: interaction.guild.id
          });
        }
      });
    }

    // Play song if queue was empty
    if (queue.songs.length === 1) {
      playSong(interaction, queue);
    } else {
      await interaction.editReply(`🎶 Added to queue: **${song.title}**`).catch(err => {
        logger.error('Failed to edit reply', { error: err.message });
      });
    }
  } catch (error) {
    logger.error('Error in play command', {
      error: error.message,
      guildId: interaction.guild.id
    });
    await interaction.editReply({ content: '❌ Failed to play the song. Please try again.', ephemeral: true }).catch(err => {
      logger.error('Failed to edit reply', { error: err.message });
    });
  }
}

// Play the next song in the queue
function playSong(interaction, queue) {
  const song = queue.songs[0];
  try {
    const stream = ytdl(song.url, { filter: 'audioonly', quality: 'highestaudio' });
    const resource = createAudioResource(stream);
    queue.player.play(resource);
    queue.connection.subscribe(queue.player);
    interaction.editReply(`▶️ Now playing: **${song.title}** in <#${queue.connection.joinConfig.channelId}>`).catch(err => {
      logger.error('Failed to edit reply', { error: err.message });
    });
    logger.info('Playing song', {
      title: song.title,
      guildId: interaction.guild.id,
      channelId: queue.connection.joinConfig.channelId
    });
  } catch (err) {
    logger.error('Error playing song', {
      error: err.message,
      guildId: interaction.guild.id
    });
    interaction.followUp({ content: '❌ Failed to play the song.', ephemeral: true }).catch(err => {
      logger.error('Failed to send follow-up', { error: err.message });
    });
  }
}
