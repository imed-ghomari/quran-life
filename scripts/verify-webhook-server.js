
const { validateEvent } = require('@polar-sh/sdk/webhooks');
const { Webhook } = require('standardwebhooks');

// Mock data matching simulate-webhook.js
const secret = process.env.POLAR_SANDBOX_WEBHOOK_SECRET;
const email = 'test@example.com';
const now = new Date();
const msgId = 'msg_' + Date.now();
const payload = {
    type: 'order.created',
    data: {
        id: 'order_123',
        customer: {
            email: email,
            id: 'cust_123',
            name: 'Test User'
        },
        checkout_id: 'chk_123',
        product_id: 'prod_123',
        amount: 1000,
        currency: 'usd',
        status: 'paid'
    }
};
const payloadString = JSON.stringify(payload);

// 1. Simulate Signing (Client Side)
const encodedSecret = Buffer.from(secret).toString('base64');
const wh = new Webhook(encodedSecret);
const signature = wh.sign(msgId, now, payloadString);

console.log('--- Client ---');
console.log('Secret (raw):', secret);
console.log('Secret (base64):', encodedSecret);
console.log('Signature:', signature);
console.log('Payload:', payloadString);

// 2. Simulate Verification (Server Side)
const headers = {
    'webhook-id': msgId,
    'webhook-signature': signature,
    'webhook-timestamp': Math.floor(now.getTime() / 1000).toString(),
};

console.log('\n--- Server ---');
try {
    const parsed = validateEvent(
        payloadString,
        headers,
        secret
    );
    console.log('✅ Verification Successful!');
    console.log('Parsed Event:', parsed.type);
} catch (err) {
    console.error('❌ Verification Failed:', err.message);
}
