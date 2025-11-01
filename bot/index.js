// src/bot/index.js
import { Client, Collection, GatewayIntentBits, Partials, ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, ChannelType } from 'discord.js';
import mongoose from 'mongoose';
import 'dotenv/config';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import fs from 'node:fs/promises';
import express from 'express';
import session from 'express-session';
import MongoStore from 'connect-mongo';
import helmet from 'helmet';
import fetch from 'node-fetch';
import setupDiscordLogging from './logging.js'; // ✅ Renamed import to reflect purpose
import { encryptJSON, decryptJSON } from '../utils/crypto.js';

// ✅ Simple console-based logger
const log = {
  fatal: (...args) => console.error('[FATAL]', ...args),
  error: (...args) => console.error('[ERROR]', ...args),
  warn: (...args) => console.warn('[WARN]', ...args),
  info: (...args) => console.log('[INFO]', ...args),
  debug: (...args) => console.log('[DEBUG]', ...args),
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '..');

// === ENV VALIDATION ===
const requiredEnv = [
  'DISCORD_TOKEN',
  'MONGO_URI',
  'CLIENT_ID',
  'CLIENT_SECRET',
  'SESSION_KEY',
  'REDIRECT_URI',
  'ENCRYPTION_SECRET',
];
for (const key of requiredEnv) {
  if (!process.env[key]) {
    log.error(`❌ Missing required environment variable: ${key}`);
    process.exit(1);
  }
}

const BASE_URL = process.env.BASE_URL || `http://localhost:${process.env.PORT || 10000}`;
const PORT = process.env.PORT || 10000;
const REQUIRE_DASHBOARD_LOGIN = process.env.REQUIRE_DASHBOARD_LOGIN === 'true';

// === DISCORD CLIENT ===
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
  partials: [Partials.Channel, Partials.Message, Partials.User],
  allowedMentions: { parse: [], repliedUser: false },
  rest: { timeout: 15_000 },
});
client.commands = new Collection();

// === SETUP DISCORD LOGGING ===
setupDiscordLogging(client); // ✅ Initialize Discord logging

// === MONGOOSE ===
try {
  await mongoose.connect(process.env.MONGO_URI, {
    maxPoolSize: 10,
    serverSelectionTimeoutMS: 5000,
    socketTimeoutMS: 45000,
  });
  log.info('✅ Connected to MongoDB');
} catch (err) {
  log.error('❌ Failed to connect to MongoDB:', err);
  process.exit(1);
}

// === OPTIONAL REDIS ===
if (process.env.REDIS_URL) {
  try {
    const Redis = (await import('ioredis')).default;
    const redisClient = new Redis(process.env.REDIS_URL, {
      retryStrategy: (times) => Math.min(times * 50, 2000),
    });
    redisClient.on('error', (err) => log.warn('Redis error:', err.message));
    client.redis = redisClient;
    log.info('✅ Connected to Redis');
  } catch (err) {
    log.warn('⚠️ Failed to init Redis:', err.message);
    client.redis = null;
  }
} else {
  client.redis = null;
  log.info('ℹ️ Redis not configured — using in-memory fallbacks');
}

// === LOAD COMMANDS ===
const loadCommandsRecursively = async (dir) => {
  const commands = [];
  let dirents;
  try {
    dirents = await fs.readdir(dir, { withFileTypes: true });
  } catch (err) {
    log.warn(`Command directory not found: ${dir}`);
    return commands;
  }

  for (const dirent of dirents) {
    const path = join(dir, dirent.name);
    if (dirent.isDirectory()) {
      commands.push(...(await loadCommandsRecursively(path)));
    } else if (dirent.isFile() && dirent.name.endsWith('.js')) {
      try {
        const command = await import(`file://${path}`);
        if (command.data && typeof command.execute === 'function') {
          commands.push(command);
          log.debug(`Loaded command: ${command.data.name}`);
        } else {
          log.warn(`Skipped invalid command file: ${path}`);
        }
      } catch (err) {
        log.error(`Failed to load command ${path}:`, { message: err.message, stack: err.stack });
      }
    }
  }
  return commands;
};

const allCommands = await loadCommandsRecursively(join(PROJECT_ROOT, 'commands'));
for (const cmd of allCommands) client.commands.set(cmd.data.name, cmd);
log.info(`✅ Loaded ${allCommands.length} commands`);

// === READY ===
client.once('ready', async () => {
  log.info(`🤖 Logged in as ${client.user.tag} (${client.user.id})`);
  try {
    const commandData = allCommands.map(cmd => cmd.data.toJSON());
    await client.application.commands.set(commandData);
    log.info(`📡 Registered ${commandData.length} global commands`);
  } catch (err) {
    log.warn('⚠️ Failed to register global commands:', err?.message ?? err);
  }
});

// === LOAD EVENTS ===
try {
  const eventsPath = join(__dirname, 'events');
  await fs.access(eventsPath);
  const eventFiles = await fs.readdir(eventsPath, { withFileTypes: true });
  for (const file of eventFiles) {
    if (file.isFile() && file.name.endsWith('.js')) {
      const filePath = join(eventsPath, file.name);
      try {
        const event = await import(`file://${filePath}`);
        const eventModule = event.default || event;
        if (!eventModule.name || typeof eventModule.execute !== 'function') {
          log.warn(`Skipped invalid event: ${file.name}`);
          continue;
        }
        if (eventModule.once) {
          client.once(eventModule.name, (...args) => eventModule.execute(...args, client));
        } else {
          client.on(eventModule.name, (...args) => eventModule.execute(...args, client));
        }
        log.debug(`Loaded event: ${eventModule.name}`);
      } catch (err) {
        log.error(`Failed to load event ${file.name}:`, err.message);
      }
    }
  }
} catch (err) {
  log.warn('⚠️ Events directory not loaded:', err.message);
}

// === EXPRESS ===
const app = express();
app.use(helmet({ contentSecurityPolicy: false }));
app.use(express.static(join(PROJECT_ROOT, 'dashboard', 'public')));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(session({
  secret: process.env.SESSION_KEY,
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: process.env.MONGO_URI, collection: 'sessions' }),
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 14 * 24 * 60 * 60 * 1000,
  },
}));

const ensureAuth = (req, res, next) => {
  if (!req.session?.discordUser) {
    const redirect = encodeURIComponent(req.originalUrl);
    return res.redirect(`/login?redirect=${redirect}`);
  }
  next();
};

// === OAUTH ===
app.get('/login', (req, res) => {
  const redirect = req.query.redirect || '/dashboard';
  const state = encodeURIComponent(redirect);
  const url = new URL('https://discord.com/api/oauth2/authorize');
  url.searchParams.set('client_id', process.env.CLIENT_ID);
  url.searchParams.set('redirect_uri', process.env.REDIRECT_URI);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', 'identify guilds');
  url.searchParams.set('state', state);
  res.redirect(url.toString());
});

app.get('/auth/callback', async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send('❌ Missing code.');

  try {
    const tokenRes = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: process.env.CLIENT_ID,
        client_secret: process.env.CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.REDIRECT_URI,
      }),
    });

    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(JSON.stringify(tokens));

    const userRes = await fetch('https://discord.com/api/users/@me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const guildsRes = await fetch('https://discord.com/api/users/@me/guilds', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });

    const user = await userRes.json();
    const guilds = await guildsRes.json();

    req.session.discordUser = user;
    req.session.userGuilds = guilds;

    let redirect = '/dashboard';
    if (state) {
      try {
        redirect = decodeURIComponent(state);
        if (!redirect.startsWith('/')) redirect = '/dashboard';
      } catch {
        redirect = '/dashboard';
      }
    }
    res.redirect(redirect);
  } catch (err) {
    log.error('OAuth error:', err.message);
    res.status(500).send('Login failed.');
  }
});

app.get('/auth/logout', (req, res) => {
  req.session.destroy(() => res.redirect('/'));
});

// === API ===
app.get('/api/user', ensureAuth, (req, res) => {
  const { id, username, avatar } = req.session.discordUser;
  const avatarUrl = avatar ? `https://cdn.discordapp.com/avatars/${id}/${avatar}.png` : null;
  res.json({ user: { id, username, avatar: avatarUrl } });
});

app.get('/api/servers', ensureAuth, (req, res) => {
  const manageable = (req.session.userGuilds || [])
    .filter(guild => (BigInt(guild.permissions) & BigInt(8)) !== 0n)
    .map(guild => ({
      id: guild.id,
      name: guild.name,
      icon: guild.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=64` : null,
    }));
  res.json({ servers: manageable });
});

app.get('/api/bot-status', (req, res) => {
  res.json({
    connected: !!client.user,
    bot: client.user
      ? {
          id: client.user.id,
          tag: client.user.tag,
          avatar: client.user.displayAvatarURL(),
        }
      : null,
    guilds: client.guilds.cache.map(g => ({ id: g.id, name: g.name })),
  });
});

app.get('/api/ticket/token', (req, res) => {
  try {
    const token = req.query.token;
    if (!token) return res.status(400).json({ valid: false, message: 'No token provided' });

    const payload = decryptJSON(token, process.env.ENCRYPTION_SECRET);
    if (!payload) return res.status(400).json({ valid: false, message: 'Invalid token' });
    if (typeof payload.expiresAt !== 'number' || Date.now() > payload.expiresAt) {
      return res.status(400).json({ valid: false, message: 'Token expired' });
    }

    const guild = client.guilds.cache.get(payload.guildId);
    if (!guild) return res.status(400).json({ valid: false, message: 'Bot not in guild' });

    return res.json({
      valid: true,
      guildId: payload.guildId,
      guildName: payload.guildName || guild.name,
      userId: payload.userId,
      channels: payload.channels || [],
      bot: client.user
        ? {
            id: client.user.id,
            tag: client.user.tag,
            avatar: client.user.displayAvatarURL(),
          }
        : null,
    });
  } catch (err) {
    log.warn('Token verify error:', err.message);
    return res.status(500).json({ valid: false, message: 'Server error' });
  }
});

app.post('/api/ticket/deploy', async (req, res) => {
  try {
    const { token, title, description, color, channelId, buttons } = req.body;
    if (!token) return res.status(400).json({ success: false, message: 'No token' });

    const payload = decryptJSON(token, process.env.ENCRYPTION_SECRET);
    if (!payload) return res.status(400).json({ success: false, message: 'Invalid token' });
    if (Date.now() > payload.expiresAt) return res.status(400).json({ success: false, message: 'Token expired' });

    if (REQUIRE_DASHBOARD_LOGIN) {
      if (!req.session?.discordUser) return res.status(401).json({ success: false, message: 'Login required' });
      if (String(req.session.discordUser.id) !== String(payload.userId)) {
        return res.status(403).json({ success: false, message: 'Not token owner' });
      }
    }

    const guild = await client.guilds.fetch(payload.guildId).catch(() => null);
    if (!guild) return res.status(400).json({ success: false, message: 'Bot not in guild' });

    const channel = await guild.channels.fetch(channelId).catch(() => null);
    if (!channel || channel.type !== ChannelType.GuildText) {
      return res.status(400).json({ success: false, message: 'Invalid channel' });
    }

    const embed = new EmbedBuilder()
      .setTitle(title || 'Support')
      .setDescription(description || '')
      .setColor(color || '#2f3136')
      .setTimestamp();

    const row = new ActionRowBuilder();
    const safeButtons = Array.isArray(buttons) ? buttons.slice(0, 5) : [];
    for (let i = 0; i < safeButtons.length; i++) {
      const b = safeButtons[i] || {};
      const label = String(b.label || `Open ${i + 1}`).slice(0, 80);
      const style = {
        'SECONDARY': ButtonStyle.Secondary,
        'SUCCESS': ButtonStyle.Success,
        'DANGER': ButtonStyle.Danger,
      }[String(b.style || 'PRIMARY').toUpperCase()] || ButtonStyle.Primary;

      const tokenShort = (token || '').slice(0, 16).replace(/[:/+=]/g, '');
      row.addComponents(new ButtonBuilder().setCustomId(`ticket:${tokenShort}:${i}`).setLabel(label).setStyle(style));
    }

    await channel.send({ embeds: [embed], components: row.components && row.components.length ? [row] : [] });
    log.info(`✅ Deployed ticket to ${guild.id}/${channelId}`);
    res.json({ success: true });
  } catch (err) {
    log.error('Deploy error:', err.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// === STATIC ===
const serve = (file) => (req, res) => res.sendFile(join(PROJECT_ROOT, 'dashboard', 'public', file));
app.get('/', serve('index.html'));
app.get('/dashboard', ensureAuth, serve('dashboard.html'));
app.get('/setup.html', ensureAuth, serve('setup.html'));
app.get('/verify', serve('verify.html'));
app.get('/success', serve('success.html'));
app.get('/health', (req, res) => res.json({ status: 'OK', time: new Date().toISOString() }));

// === START ===
app.listen(PORT, '0.0.0.0', () => log.info(`🌐 Dashboard: ${BASE_URL}`));

try {
  await client.login(process.env.DISCORD_TOKEN);
  log.info(`✅ Bot: ${client.user.tag}`);
} catch (err) {
  log.error('❌ Discord login failed:', err.message);
  process.exit(1);
}

// === SHUTDOWN ===
const shutdown = async (signal) => {
  log.warn(`Received ${signal} — shutting down...`);
  try {
    await client.destroy();
    if (client.redis) await client.redis.quit();
    await mongoose.disconnect();
  } catch (err) {
    log.error('Shutdown error:', err.message);
  }
  process.exit(0);
};
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
