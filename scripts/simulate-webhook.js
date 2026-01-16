const { Webhook } = require('standardwebhooks');
// const fetch = require('node-fetch'); // Native fetch is available in Node 18+

const secret = process.env.POLAR_SANDBOX_WEBHOOK_SECRET;
if (!secret) {
    console.error('Error: POLAR_SANDBOX_WEBHOOK_SECRET is not set');
    process.exit(1);
}

const email = process.argv[2];
if (!email) {
    console.error('Usage: POLAR_SANDBOX_WEBHOOK_SECRET="..." node scripts/simulate-webhook.js <email>');
    process.exit(1);
}

const webhookUrl = 'http://localhost:3000/api/polar/webhook';

// Simulate order.created event structure (which was failing)
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

async function sendWebhook() {
    // 3. Sign
    // The Polar SDK's validateEvent function (which the app uses) does this:
    // const base64Secret = Buffer.from(secret, "utf-8").toString("base64");
    // const webhook = new Webhook(base64Secret);
    // 
    // This means it treats the secret string (e.g. "polar_whs_...") as the raw key bytes,
    // rather than decoding it as base64. 
    // To generate a valid signature that the app will accept, we must do the same.
    
    const encodedSecret = Buffer.from(secret).toString('base64');
    const wh = new Webhook(encodedSecret);
    const now = new Date();
    const msgId = 'msg_' + Date.now();

    const signature = wh.sign(msgId, now, payloadString); 

    console.log('Sending webhook...');
    console.log('URL:', webhookUrl);
    console.log('Event:', payload.type);
    console.log('Payload:', payloadString);
    
    try {
        const response = await fetch(webhookUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'webhook-id': msgId,
                'webhook-timestamp': Math.floor(now.getTime() / 1000).toString(),
                'webhook-signature': signature
            },
            body: payloadString
        });

        console.log('Response status:', response.status);
        const text = await response.text();
        console.log('Response body:', text);
    } catch (error) {
        console.error('Error sending webhook:', error);
    }
}

sendWebhook();
