const { Paddle, Environment } = require('@paddle/paddle-node-sdk');
const { init } = require('@instantdb/admin');

const isProduction = process.env.PADDLE_ENV === 'production';
const paddleApiKey = (isProduction ? process.env.PADDLE_SECRET_KEY_PRODUCTION : process.env.PADDLE_SECRET_KEY_SANDBOX)
  || process.env.PADDLE_SECRET_KEY;

const MONTHLY_PRICE_ID =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID_SANDBOX)
  || process.env.NEXT_PUBLIC_PADDLE_PRICE_MONTHLY_ID
  || 'pri_01kgvka6b5ddgjzstxesj208cz';
const YEARLY_PRICE_ID =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID_SANDBOX)
  || process.env.NEXT_PUBLIC_PADDLE_PRICE_YEARLY_ID
  || 'pri_01kgvkaxewf2awdc5xr906jxsc';
const TEACHER_BASE_MONTHLY_PRICE_ID =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID_SANDBOX)
  || process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_MONTHLY_ID;
const TEACHER_BASE_YEARLY_PRICE_ID =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID_SANDBOX)
  || process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_BASE_YEARLY_ID;
const TEACHER_SEAT_MONTHLY_PRICE_ID =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID_SANDBOX)
  || process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_MONTHLY_ID;
const TEACHER_SEAT_YEARLY_PRICE_ID =
  (isProduction
    ? process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID_PRODUCTION
    : process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID_SANDBOX)
  || process.env.NEXT_PUBLIC_PADDLE_PRICE_TEACHER_SEAT_YEARLY_ID;

const REQUIRED_SUBSCRIPTION_EVENTS = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
]);

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

function getExpectedWebhookUrl() {
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

const checks = [];
let hasFailure = false;

function pushCheck(status, message, details) {
  checks.push({ status, message, details });
  if (status === 'FAIL') hasFailure = true;
}

function summarize() {
  for (const check of checks) {
    const head = `[${check.status}] ${check.message}`;
    if (!check.details) {
      console.log(head);
      continue;
    }
    console.log(`${head}\n  ${check.details}`);
  }
}

async function getPaddleClient() {
  if (!paddleApiKey) {
    pushCheck('FAIL', 'Missing `PADDLE_SECRET_KEY`', 'Set Paddle API key in your environment.');
    return null;
  }

  const environment = process.env.PADDLE_ENV === 'production'
    ? Environment.production
    : Environment.sandbox;

  return new Paddle(paddleApiKey, { environment });
}

async function verifyCatalog(paddle) {
  const prices = [];
  for await (const price of paddle.prices.list()) prices.push(price);

  const monthly = prices.find((p) => p.id === MONTHLY_PRICE_ID);
  const yearly = prices.find((p) => p.id === YEARLY_PRICE_ID);
  const teacherBaseMonthly = prices.find((p) => p.id === TEACHER_BASE_MONTHLY_PRICE_ID);
  const teacherBaseYearly = prices.find((p) => p.id === TEACHER_BASE_YEARLY_PRICE_ID);
  const teacherSeatMonthly = prices.find((p) => p.id === TEACHER_SEAT_MONTHLY_PRICE_ID);
  const teacherSeatYearly = prices.find((p) => p.id === TEACHER_SEAT_YEARLY_PRICE_ID);

  const checkPrice = (price, priceId, label) => {
    if (!priceId) {
      pushCheck('FAIL', `${label} price ID missing from environment`, 'Set the corresponding NEXT_PUBLIC_PADDLE_PRICE_* env var.');
      return;
    }
    if (!price) {
      pushCheck('FAIL', `${label} price ID not found in Paddle`, `Missing: ${priceId}`);
      return;
    }
    if (price.status !== 'active') {
      pushCheck('FAIL', `${label} price is not active`, `${price.id} status=${price.status}`);
      return;
    }
    pushCheck(
      'PASS',
      `${label} price exists and is active`,
      `${price.id} ${price.billingCycle?.frequency || '?'} ${price.billingCycle?.interval || '?'}`
    );
  };

  checkPrice(monthly, MONTHLY_PRICE_ID, 'Student monthly checkout');
  checkPrice(yearly, YEARLY_PRICE_ID, 'Student yearly checkout');
  checkPrice(teacherBaseMonthly, TEACHER_BASE_MONTHLY_PRICE_ID, 'Teacher base monthly checkout');
  checkPrice(teacherBaseYearly, TEACHER_BASE_YEARLY_PRICE_ID, 'Teacher base yearly checkout');
  checkPrice(teacherSeatMonthly, TEACHER_SEAT_MONTHLY_PRICE_ID, 'Teacher seat monthly checkout');
  checkPrice(teacherSeatYearly, TEACHER_SEAT_YEARLY_PRICE_ID, 'Teacher seat yearly checkout');

  if (monthly && yearly && monthly.productId === yearly.productId) {
    pushCheck('PASS', 'Monthly and yearly prices belong to the same Paddle product', monthly.productId);
  } else if (monthly && yearly) {
    pushCheck(
      'FAIL',
      'Monthly and yearly prices are attached to different products',
      `monthly=${monthly.productId} yearly=${yearly.productId}`
    );
  }

  if (teacherBaseMonthly && teacherBaseYearly && teacherBaseMonthly.productId === teacherBaseYearly.productId) {
    pushCheck('PASS', 'Teacher base monthly and yearly prices belong to the same Paddle product', teacherBaseMonthly.productId);
  } else if (teacherBaseMonthly && teacherBaseYearly) {
    pushCheck(
      'FAIL',
      'Teacher base monthly and yearly prices are attached to different products',
      `monthly=${teacherBaseMonthly.productId} yearly=${teacherBaseYearly.productId}`
    );
  }

  if (teacherSeatMonthly && teacherSeatYearly && teacherSeatMonthly.productId === teacherSeatYearly.productId) {
    pushCheck('PASS', 'Teacher seat monthly and yearly prices belong to the same Paddle product', teacherSeatMonthly.productId);
  } else if (teacherSeatMonthly && teacherSeatYearly) {
    pushCheck(
      'FAIL',
      'Teacher seat monthly and yearly prices are attached to different products',
      `monthly=${teacherSeatMonthly.productId} yearly=${teacherSeatYearly.productId}`
    );
  }
}

async function verifyWebhookSettings(paddle) {
  const settings = await paddle.notificationSettings.list();
  const webhookSetting = settings.find(
    (s) => s.active && s.type === 'url' && String(s.destination || '').includes('/api/webhooks/paddle'),
  );

  if (!webhookSetting) {
    pushCheck(
      'FAIL',
      'No active Paddle webhook destination found for `/api/webhooks/paddle`',
      'Create or update notification settings in Paddle.'
    );
    return;
  }

  pushCheck(
    'PASS',
    'Found active Paddle webhook destination',
    `${webhookSetting.id} -> ${webhookSetting.destination}`
  );

  const expectedWebhookUrl = getExpectedWebhookUrl();
  if (String(webhookSetting.destination || '') !== expectedWebhookUrl) {
    pushCheck(
      'FAIL',
      'Webhook destination does not match expected domain',
      `expected=${expectedWebhookUrl} actual=${webhookSetting.destination}`
    );
  } else {
    pushCheck('PASS', 'Webhook destination matches expected domain', expectedWebhookUrl);
  }

  const subscribed = new Set((webhookSetting.subscribedEvents || []).map((event) => event.name));
  const missingEvents = [...REQUIRED_SUBSCRIPTION_EVENTS].filter((name) => !subscribed.has(name));
  if (missingEvents.length > 0) {
    pushCheck(
      'FAIL',
      'Webhook is missing required subscription events',
      missingEvents.join(', ')
    );
  } else {
    pushCheck('PASS', 'Webhook subscribes to required subscription events');
  }

  const recent = [];
  const notificationCollection = paddle.notifications.list({
    notificationSettingId: [webhookSetting.id],
    perPage: 20,
  });
  for await (const notification of notificationCollection) {
    recent.push(notification);
    if (recent.length >= 20) break;
  }

  const failedCount = recent.filter((notification) => notification.status === 'failed').length;
  const deliveredCount = recent.filter((notification) => notification.status === 'delivered').length;

  if (recent.length === 0) {
    pushCheck(
      'WARN',
      'No recent webhook notifications found',
      'Run a checkout to produce test events.'
    );
    return;
  }

  if (deliveredCount > 0) {
    pushCheck(
      'PASS',
      'Paddle webhook deliveries are reaching your endpoint',
      `delivered=${deliveredCount} failed=${failedCount} inspected=${recent.length}`
    );
  } else if (failedCount > 0) {
    pushCheck(
      'FAIL',
      'Recent Paddle webhook deliveries are failing',
      `failed=${failedCount} delivered=${deliveredCount} inspected=${recent.length}`
    );
  } else {
    pushCheck('WARN', 'No delivery outcome found in recent notifications');
  }
}

async function verifyInstantData() {
  const appId = process.env.NEXT_PUBLIC_INSTANT_APP_ID || 'pr-quran-life';
  const adminToken = process.env.INSTANT_APP_ADMIN_TOKEN || process.env.INSTANT_ADMIN_TOKEN;

  if (!adminToken) {
    pushCheck(
      'WARN',
      'Missing Instant admin token; skipping InstantDB verification',
      'Set INSTANT_APP_ADMIN_TOKEN or INSTANT_ADMIN_TOKEN.'
    );
    return;
  }

  const db = init({ appId, adminToken });
  const { subscriptions = [], paddleWebhookEvents = [] } = await db.query({
    subscriptions: {},
    paddleWebhookEvents: {},
  });

  const realSubscriptions = subscriptions.filter((subscription) =>
    String(subscription?.paddleSubscriptionId || '').startsWith('sub_'),
  );
  const realWebhookEvents = paddleWebhookEvents.filter(
    (event) => !String(event?.eventId || '').startsWith('seed-event-'),
  );

  if (realSubscriptions.length === 0) {
    pushCheck(
      'WARN',
      'No real Paddle subscriptions in InstantDB yet',
      'Current data appears seeded or from non-Paddle sources.'
    );
  } else {
    pushCheck('PASS', 'InstantDB has real Paddle subscriptions', `count=${realSubscriptions.length}`);
  }

  if (realWebhookEvents.length === 0) {
    pushCheck(
      'WARN',
      'No real Paddle webhook events in InstantDB yet',
      'Run a successful webhook delivery and verify insertion.'
    );
  } else {
    pushCheck('PASS', 'InstantDB has real Paddle webhook events', `count=${realWebhookEvents.length}`);
  }
}

async function main() {
  try {
    const paddle = await getPaddleClient();
    if (paddle) {
      await verifyCatalog(paddle);
      await verifyWebhookSettings(paddle);
    }
    await verifyInstantData();
    summarize();
    process.exit(hasFailure ? 1 : 0);
  } catch (error) {
    console.error('[FAIL] Verification script crashed');
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
