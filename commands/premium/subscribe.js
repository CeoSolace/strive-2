// /commands/premium/subscribe.js
import { SlashCommandBuilder } from 'discord.js';
import { stripe } from '../../utils/stripeClient.js';
import Subscription from '../../models/Subscription.js';
import { logger } from '../../utils/logger.js';

// Plan definitions (GBP, yearly = 17% off monthly x12)
const PLANS = {
  basic_monthly: { name: 'Strive Basic', price: 500, interval: 'month', currency: 'gbp' },
  basic_yearly: { name: 'Strive Basic (Yearly)', price: 6000, interval: 'year', currency: 'gbp' },
  premium_monthly: { name: 'Strive Professional', price: 1200, interval: 'month', currency: 'gbp' },
  premium_yearly: { name: 'Strive Professional (Yearly)', price: 14400, interval: 'year', currency: 'gbp' },
  ultra_monthly: { name: 'Strive Business', price: 2900, interval: 'month', currency: 'gbp' },
  ultra_yearly: { name: 'Strive Business (Yearly)', price: 34800, interval: 'year', currency: 'gbp' }
};

export const data = new SlashCommandBuilder()
  .setName('subscribe')
  .setDescription('Subscribe to a premium plan')
  .addStringOption(option =>
    option.setName('plan')
      .setDescription('Choose your plan')
      .setRequired(true)
      .addChoices(
        { name: 'Basic — £5/month', value: 'basic_monthly' },
        { name: 'Basic (Yearly) — £60/year', value: 'basic_yearly' },
        { name: 'Professional — £12/month', value: 'premium_monthly' },
        { name: 'Professional (Yearly) — £144/year', value: 'premium_yearly' },
        { name: 'Business — £29/month', value: 'ultra_monthly' },
        { name: 'Business (Yearly) — £348/year', value: 'ultra_yearly' }
      ));

export async function execute(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const planId = interaction.options.getString('plan');
  const plan = PLANS[planId];
  if (!plan) return interaction.editReply('❌ Invalid plan.');

  const baseUrl = process.env.BASE_URL || `https://strive-dashboard.onrender.com`;
  const successUrl = `${baseUrl}/success?session_id={CHECKOUT_SESSION_ID}`;
  const cancelUrl = `${baseUrl}/premium`;

  try {
    // Create product & price (in real app: cache these)
    const product = await stripe.products.create({ name: plan.name });
    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: plan.price,
      currency: plan.currency,
      recurring: { interval: plan.interval }
    });

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: price.id, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: interaction.user.id,
      metadata: {
        discordUserId: interaction.user.id,
        discordUsername: interaction.user.username,
        plan: planId,
        guildId: interaction.guild.id
      }
    });

    // Save session for later verification
    await Subscription.create({
      discordUserId: interaction.user.id,
      discordUsername: interaction.user.username,
      plan: planId,
      stripeSessionId: session.id,
      guildId: interaction.guild.id
    });

    logger.info('SUBSCRIPTION_CHECKOUT_STARTED', {
      userId: interaction.user.id,
      plan: planId,
      sessionId: session.id
    });

    await interaction.editReply({
      content: `✅ Checkout ready!\n[Click here to subscribe](${session.url})`,
      ephemeral: true
    });

  } catch (err) {
    logger.error('STRIPE_CHECKOUT_ERROR', { error: err.message });
    await interaction.editReply('❌ Failed to start checkout. Please try again.');
  }
}
