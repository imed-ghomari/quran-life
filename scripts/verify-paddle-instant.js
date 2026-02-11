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

const REQUIRED_SUBSCRIPTION_EVENTS = new Set([
  'subscription.created',
  'subscription.updated',
  'subscription.canceled',
]);

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

  if (!monthly) {
    pushCheck('FAIL', 'Monthly checkout price ID not found in Paddle', `Missing: ${MONTHLY_PRICE_ID}`);
  } else if (monthly.status !== 'active') {
    pushCheck('FAIL', 'Monthly checkout price is not active', `${monthly.id} status=${monthly.status}`);
  } else {
    pushCheck(
      'PASS',
      'Monthly checkout price exists and is active',
      `${monthly.id} ${monthly.billingCycle?.frequency || '?'} ${monthly.billingCycle?.interval || '?'}`
    );
  }

  if (!yearly) {
    pushCheck('FAIL', 'Yearly checkout price ID not found in Paddle', `Missing: ${YEARLY_PRICE_ID}`);
  } else if (yearly.status !== 'active') {
    pushCheck('FAIL', 'Yearly checkout price is not active', `${yearly.id} status=${yearly.status}`);
  } else {
    pushCheck(
      'PASS',
      'Yearly checkout price exists and is active',
      `${yearly.id} ${yearly.billingCycle?.frequency || '?'} ${yearly.billingCycle?.interval || '?'}`
    );
  }

  if (monthly && yearly && monthly.productId === yearly.productId) {
    pushCheck('PASS', 'Monthly and yearly prices belong to the same Paddle product', monthly.productId);
  } else if (monthly && yearly) {
    pushCheck(
      'FAIL',
      'Monthly and yearly prices are attached to different products',
      `monthly=${monthly.productId} yearly=${yearly.productId}`
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
