import { NextRequest, NextResponse } from 'next/server';
import {
    isValidUUID,
    badRequest,
    internalError,
    serviceUnavailable,
    addSecurityHeaders,
    getClientIP
} from '@/lib/apiUtils';
import { applyRateLimit, RATE_LIMIT_AUTH, addRateLimitHeaders } from '@/lib/rateLimit';

/**
 * Polar Checkout API Route
 * Handles checkout creation and redirect for the Quran Life app
 * 
 * Security:
 * - Rate limited: 5 requests per minute per IP
 * - UUID validation for product/price IDs
 * - Bot detection
 */
export async function GET(request: NextRequest) {
    // Apply rate limiting
    const rateLimitResponse = applyRateLimit(request, RATE_LIMIT_AUTH);
    if (rateLimitResponse) {
        return addSecurityHeaders(rateLimitResponse);
    }

    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('product_id');
    const priceId = searchParams.get('price_id');

    // Input Validation & Sanitization
    if (!isValidUUID(productId)) {
        return addSecurityHeaders(badRequest('Invalid or missing product_id'));
    }

    if (priceId && !isValidUUID(priceId)) {
        return addSecurityHeaders(badRequest('Invalid price_id'));
    }

    try {
        // Create checkout session with Polar
        const isSandbox = process.env.POLAR_SANDBOX === 'true';
        const polarApiUrl = isSandbox
            ? 'https://sandbox-api.polar.sh/v1/checkouts/custom/'
            : 'https://api.polar.sh/v1/checkouts/custom/';

        const response = await fetch(polarApiUrl, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                product_id: productId,
                product_price_id: priceId || undefined,
                success_url: process.env.POLAR_SUCCESS_URL,
            }),
        });

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            console.error('[Checkout] Polar API error:', {
                status: response.status,
                error: errorData,
                ip: getClientIP(request),
            });

            // Return appropriate error based on Polar response
            if (response.status >= 500) {
                return addSecurityHeaders(serviceUnavailable('Payment service temporarily unavailable'));
            }

            return addSecurityHeaders(
                badRequest('Failed to create checkout session',
                    process.env.NODE_ENV !== 'production' ? errorData : undefined
                )
            );
        }

        const checkoutData = await response.json();

        // Redirect to Polar checkout page with security headers
        const redirectResponse = NextResponse.redirect(checkoutData.url);
        addRateLimitHeaders(redirectResponse, `${getClientIP(request)}:/api/polar/checkout`, RATE_LIMIT_AUTH);
        return addSecurityHeaders(redirectResponse);

    } catch (error) {
        console.error('[Checkout] Unexpected error:', {
            error: error instanceof Error ? error.message : error,
            ip: getClientIP(request),
        });
        return addSecurityHeaders(internalError('Failed to process checkout request'));
    }
}
