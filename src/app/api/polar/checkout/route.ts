import { NextRequest, NextResponse } from 'next/server';
import { Polar } from '@polar-sh/sdk';
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
    // price_id is optional and might not be needed if using separate products
    // const priceId = searchParams.get('price_id');

    // Input Validation & Sanitization
    if (!isValidUUID(productId)) {
        return addSecurityHeaders(badRequest('Invalid or missing product_id'));
    }

    try {
        // Create checkout session with Polar SDK
        const isSandbox = process.env.POLAR_SANDBOX === 'true';
        
        const accessToken = isSandbox 
            ? process.env.POLAR_SANDBOX_ACCESS_TOKEN 
            : process.env.POLAR_ACCESS_TOKEN;

        if (!accessToken) {
            console.error('[Checkout] Missing Polar Access Token');
            return addSecurityHeaders(internalError('Payment configuration error'));
        }

        const polar = new Polar({
            accessToken,
            server: isSandbox ? 'sandbox' : 'production',
        });

        const checkout = await polar.checkouts.create({
            products: [productId],
            successUrl: process.env.POLAR_SUCCESS_URL,
        });

        // Redirect to Polar checkout page with security headers
        const redirectResponse = NextResponse.redirect(checkout.url);
        addRateLimitHeaders(redirectResponse, `${getClientIP(request)}:/api/polar/checkout`, RATE_LIMIT_AUTH);
        return addSecurityHeaders(redirectResponse);

    } catch (error) {
        console.error('[Checkout] Error:', {
            error: error instanceof Error ? error.message : error,
            ip: getClientIP(request),
        });

        // Handle specific Polar SDK errors if possible, otherwise generic error
        return addSecurityHeaders(
            badRequest('Failed to create checkout session', 
                process.env.NODE_ENV !== 'production' ? { error: String(error) } : undefined
            )
        );
    }
}
