import { NextRequest, NextResponse } from 'next/server';

/**
 * Polar Success Handler
 * Redirects user to dashboard after successful Polar checkout
 * (User is already authenticated in the new flow: Auth → Polar → Dashboard)
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const checkoutId = searchParams.get('checkout_id');

    // User has completed payment, redirect to dashboard
    // They should already have a session from the auth step
    const redirectUrl = new URL('/dashboard', request.url);
    if (checkoutId) {
        redirectUrl.searchParams.set('checkout_id', checkoutId);
    }

    return NextResponse.redirect(redirectUrl);
}
