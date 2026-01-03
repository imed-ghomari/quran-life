import { NextRequest, NextResponse } from 'next/server';

/**
 * Polar Success Handler
 * Redirects user to auth screen after successful Polar checkout
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const checkoutId = searchParams.get('checkout_id');

    // Store checkout ID in session storage via redirect parameter
    // The auth page will pick this up and verify the purchase
    const redirectUrl = new URL('/auth', request.url);
    if (checkoutId) {
        redirectUrl.searchParams.set('checkout_id', checkoutId);
    }

    return NextResponse.redirect(redirectUrl);
}
