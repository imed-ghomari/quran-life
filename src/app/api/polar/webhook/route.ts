import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';
import { validateEvent } from '@polar-sh/sdk/webhooks';
import {
    unauthorized,
    badRequest,
    internalError,
    successResponse,
    addSecurityHeaders,
    getClientIP
} from '@/lib/apiUtils';

/**
 * Polar Webhook Handler
 * Handles post-checkout events from Polar
 * Verifies payment and updates user status in Supabase
 * 
 * Security:
 * - Webhook signature verification
 * - Structured error responses
 * - Comprehensive logging
 */
export async function POST(request: NextRequest) {
    const requestId = crypto.randomUUID().slice(0, 8);
    const clientIP = getClientIP(request);

    try {
        const body = await request.text();

        // Extract required headers for Polar webhook validation
        const webhookId = request.headers.get('webhook-id');
        const webhookSignature = request.headers.get('webhook-signature');
        const webhookTimestamp = request.headers.get('webhook-timestamp');

        console.log(`[Webhook ${requestId}] Received from ${clientIP}`);

        if (!webhookSignature || !webhookId || !webhookTimestamp) {
            console.error(`[Webhook ${requestId}] Missing required headers`, {
                hasId: !!webhookId,
                hasSignature: !!webhookSignature,
                hasTimestamp: !!webhookTimestamp,
            });
            return addSecurityHeaders(unauthorized('Missing required webhook headers'));
        }

        // Validate webhook signature
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
            console.error(`[Webhook ${requestId}] Signature verification failed:`,
                err instanceof Error ? err.message : err
            );
            return addSecurityHeaders(unauthorized('Invalid webhook signature'));
        }

        const { type: event, data } = payload as { type: string; data: Record<string, unknown> };
        console.log(`[Webhook ${requestId}] Event type: ${event}`);

        // Handle checkout.completed event
        if (event === 'checkout.completed' || event === 'order.created') {
            const { customer_email, customer_id, checkout_id, product_id } = data;

            if (!customer_email || typeof customer_email !== 'string') {
                console.error(`[Webhook ${requestId}] No customer email in payload`);
                return addSecurityHeaders(badRequest('Missing customer email in webhook payload'));
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
                console.error(`[Webhook ${requestId}] Failed to store purchase:`, purchaseError);
                // Don't fail the webhook - log and continue
                // Polar will retry if we return error, which could cause duplicates
            } else {
                console.log(`[Webhook ${requestId}] ✅ Purchase recorded for ${customer_email}`);
            }
        }

        return addSecurityHeaders(successResponse({ received: true }));

    } catch (error) {
        console.error(`[Webhook ${requestId}] Unexpected error:`, {
            error: error instanceof Error ? error.message : error,
            stack: error instanceof Error ? error.stack : undefined,
            ip: clientIP,
        });
        return addSecurityHeaders(internalError('Webhook processing failed'));
    }
}
