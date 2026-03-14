const { Paddle, Environment } = require('@paddle/paddle-node-sdk');

const REQUIRED_SUBSCRIPTION_EVENTS = [
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
];

const DEFAULT_WEBHOOK_DOMAIN = 'https://quran-life.org';

function normalizeBaseUrl(rawUrl) {
  if (!rawUrl) return DEFAULT_WEBHOOK_DOMAIN;
  const trimmed = String(rawUrl).trim();
  if (!trimmed) return DEFAULT_WEBHOOK_DOMAIN;
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed.replace(/\/+$/, '');
  }
  return `https://${trimmed.replace(/\/+$/, '')}`;
}

function getTargetWebhookUrl() {
  const baseUrl = normalizeBaseUrl(
    process.env.PADDLE_WEBHOOK_DOMAIN
      || process.env.NEXT_PUBLIC_SITE_URL
      || process.env.SITE_URL
      || process.env.VERCEL_PROJECT_PRODUCTION_URL
      || process.env.VERCEL_URL
      || DEFAULT_WEBHOOK_DOMAIN
  );
  return `${baseUrl}/api/webhooks/paddle`;
}

function getPaddleClient() {
  const isProduction = process.env.PADDLE_ENV === 'production';
  const paddleApiKey = (isProduction
    ? process.env.PADDLE_SECRET_KEY_PRODUCTION
    : process.env.PADDLE_SECRET_KEY_SANDBOX)
    || process.env.PADDLE_SECRET_KEY;

  if (!paddleApiKey) {
    throw new Error('Missing PADDLE_SECRET_KEY (or environment-specific key).');
  }

  const environment = isProduction ? Environment.production : Environment.sandbox;
  return new Paddle(paddleApiKey, { environment });
}

function getEventNames(subscribedEvents) {
  if (!Array.isArray(subscribedEvents)) return [];
  return subscribedEvents
    .map((event) => (typeof event === 'string' ? event : event?.name))
    .filter(Boolean);
}

function mergeEventNames(existing) {
  const merged = new Set([...existing, ...REQUIRED_SUBSCRIPTION_EVENTS]);
  return Array.from(merged);
}

async function ensureWebhookDestination(paddle) {
  const targetUrl = getTargetWebhookUrl();
  const settings = await paddle.notificationSettings.list();
  const urlSettings = settings.filter((setting) => setting.type === 'url');
  const webhookSettings = urlSettings.filter((setting) =>
    String(setting.destination || '').includes('/api/webhooks/paddle')
  );

  let targetSetting = webhookSettings.find((setting) => setting.active) || webhookSettings[0];

  if (!targetSetting) {
    const created = await paddle.notificationSettings.create({
      description: 'Quran Life webhook',
      destination: targetUrl,
      subscribedEvents: REQUIRED_SUBSCRIPTION_EVENTS,
      type: 'url',
    });
    console.log('[PASS] Created Paddle webhook destination:', created?.destination || targetUrl);
    return;
  }

  const existingEvents = getEventNames(targetSetting.subscribedEvents);
  const mergedEvents = mergeEventNames(existingEvents);
  const needsDestinationUpdate = targetSetting.destination !== targetUrl;
  const needsActivation = !targetSetting.active;
  const needsEventUpdate = mergedEvents.length !== existingEvents.length;

  if (!needsDestinationUpdate && !needsActivation && !needsEventUpdate) {
    console.log('[PASS] Paddle webhook destination already up to date:', targetSetting.destination);
    return;
  }

  const updated = await paddle.notificationSettings.update(targetSetting.id, {
    destination: targetUrl,
    active: true,
    subscribedEvents: mergedEvents,
  });

  console.log('[PASS] Updated Paddle webhook destination:', updated?.destination || targetUrl);
}

async function main() {
  try {
    const paddle = getPaddleClient();
    await ensureWebhookDestination(paddle);
  } catch (error) {
    console.error('[FAIL] Unable to ensure Paddle webhook destination');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
