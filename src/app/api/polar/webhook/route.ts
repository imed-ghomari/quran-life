import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/instant-admin';
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
 * Verifies payment and updates user status in InstantDB
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
        const isSandbox = process.env.POLAR_SANDBOX === 'true';
        const webhookSecret = isSandbox 
            ? process.env.POLAR_SANDBOX_WEBHOOK_SECRET 
            : process.env.POLAR_WEBHOOK_SECRET;

        if (!webhookSecret) {
            console.error(`[Webhook ${requestId}] Missing Polar Webhook Secret`);
            return addSecurityHeaders(internalError('Webhook configuration error'));
        }

        try {
            payload = validateEvent(
                body,
                {
                    'webhook-id': webhookId,
                    'webhook-signature': webhookSignature,
                    'webhook-timestamp': webhookTimestamp,
                },
                webhookSecret
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
            const parsedData = data as any;
            
            // Extract purchase details based on event type
            const customerEmail = parsedData.customer_email || parsedData.customer?.email;
            const checkoutId = parsedData.checkout_id || parsedData.id; // For checkout.completed, id is checkout_id
            
            // Enhanced extraction for IDs
            const customerId = parsedData.customer_id || parsedData.customer?.id;
            const productId = parsedData.product_id || parsedData.product?.id || parsedData.product_price?.product_id;

            console.log(`[Webhook ${requestId}] Processing ${event}`, {
                email: customerEmail,
                checkoutId,
                customerId,
                productId
            });

            if (!customerEmail || typeof customerEmail !== 'string') {
                console.error(`[Webhook ${requestId}] No customer email in payload`, parsedData);
                return addSecurityHeaders(badRequest('Missing customer email in webhook payload'));
            }

            // Store purchase information in InstantDB
            try {
                const purchaseId = crypto.randomUUID();
                await db.transact(
                    db.tx.purchases[purchaseId].update({
                        email: customerEmail.toLowerCase(),
                        polar_checkout_id: checkoutId || '',
                        polar_customer_id: customerId || '',
                        polar_product_id: productId || '',
                        purchased_at: new Date().toISOString(),
                        status: 'completed'
                    })
                );
                console.log(`[Webhook ${requestId}] ✅ Purchase recorded for ${customerEmail}`);
            } catch (err) {
                console.error(`[Webhook ${requestId}] Failed to store purchase in InstantDB:`, err);
                // Don't fail the webhook - log and continue
            }
        } else {
            console.log(`[Webhook ${requestId}] ℹ️ Skipping event type: ${event}`);
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
