// /bot/utils/rateLimiter.js
export function initRateLimiter(client) {
  const commandCooldowns = new Map();

  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    const now = Date.now();
    const cooldownAmount = 3000;

    if (!commandCooldowns.has(interaction.commandName)) {
      commandCooldowns.set(interaction.commandName, new Map());
    }

    const timestamps = commandCooldowns.get(interaction.commandName);
    const userId = interaction.user.id;

    if (timestamps.has(userId)) {
      const expirationTime = timestamps.get(userId) + cooldownAmount;
      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return interaction.reply({
          content: `⏱️ Please wait ${timeLeft.toFixed(1)} more second(s) before using \`${interaction.commandName}\`.`,
          ephemeral: true
        });
      }
    }

    timestamps.set(userId, now);
    setTimeout(() => timestamps.delete(userId), cooldownAmount);
  });
}
