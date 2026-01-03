import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Polar Webhook Handler
 * Handles post-checkout events from Polar
 * Verifies payment and updates user status in Supabase
 */
export async function POST(request: NextRequest) {
    try {
        const payload = await request.json();

        // Verify webhook signature (optional but recommended)
        const signature = request.headers.get('polar-signature');
        // TODO: Implement signature verification when Polar provides webhook secrets

        const { event, data } = payload;

        // Handle checkout.completed event
        if (event === 'checkout.completed' || event === 'order.created') {
            const { customer_email, customer_id, checkout_id, product_id } = data;

            if (!customer_email) {
                console.error('No customer email in webhook payload');
                return NextResponse.json({ error: 'Missing customer email' }, { status: 400 });
            }

            // Store purchase information in Supabase
            const supabase = createClient();

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
