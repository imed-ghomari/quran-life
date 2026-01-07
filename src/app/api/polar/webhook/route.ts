import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { validateEvent } from '@polar-sh/sdk/webhooks';

/**
 * Polar Webhook Handler
 * Handles post-checkout events from Polar
 * Verifies payment and updates user status in Supabase
 */
export async function POST(request: NextRequest) {
    try {
        const body = await request.text();
        
        // Extract required headers for Polar webhook validation
        const webhookId = request.headers.get('webhook-id');
        const webhookSignature = request.headers.get('webhook-signature');
        const webhookTimestamp = request.headers.get('webhook-timestamp');

        console.log('--- Webhook Received ---');
        console.log('Headers:', JSON.stringify({
            'webhook-id': webhookId,
            'webhook-signature': webhookSignature,
            'webhook-timestamp': webhookTimestamp
        }, null, 2));

        if (!webhookSignature || !webhookId || !webhookTimestamp) {
            console.error('Missing required webhook headers');
            return NextResponse.json({ error: 'Missing headers' }, { status: 401 });
        }

        let payload;
        try {
            payload = validateEvent(
                body,
                {
                    'webhook-id': webhookId,
                    'webhook-signature': webhookSignature,
                    'webhook-timestamp': webhookTimestamp,
                },
                process.env.POLAR_WEBHOOK_SECRET || ''
            );
        } catch (err) {
            console.error('Webhook signature verification failed:', err);
            return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
        }

        const { type: event, data } = payload as any;

        // Handle checkout.completed event
        if (event === 'checkout.completed' || event === 'order.created') {
            const { customer_email, customer_id, checkout_id, product_id } = data;

            if (!customer_email) {
                console.error('No customer email in webhook payload');
                return NextResponse.json({ error: 'Missing customer email' }, { status: 400 });
            }

            // Store purchase information in Supabase
            const supabase = await createClient();

            // Insert purchase record
            const { error: purchaseError } = await supabase
                .from('purchases')
                .insert({
                    email: customer_email,
                    polar_checkout_id: checkout_id,
                    polar_customer_id: customer_id,
                    polar_product_id: product_id,
                    purchased_at: new Date().toISOString(),
                    status: 'completed'
                });

            if (purchaseError) {
                console.error('Failed to store purchase:', purchaseError);
                // Don't fail the webhook - log and continue
            }

            console.log(`✅ Purchase recorded for ${customer_email}`);
        }

        return NextResponse.json({ received: true });
    } catch (error) {
        console.error('Webhook error:', error);
        return NextResponse.json(
            { error: 'Webhook processing failed' },
            { status: 500 }
        );
    }
}
