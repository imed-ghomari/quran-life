import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/instant-admin';

/**
 * Polar Success Handler
 * Redirects user to dashboard after successful Polar checkout
 * (User is already authenticated in the new flow: Auth → Polar → Dashboard)
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const checkoutId = searchParams.get('checkout_id');

    // Wait for the webhook to process (optional but helpful for UX)
    // We poll InstantDB for a few seconds
    
    // Simple wait loop (max 5 seconds)
    if (checkoutId) {
        for (let i = 0; i < 5; i++) {
            try {
                const result = await db.query({
                    purchases: {
                        $: {
                            where: { polar_checkout_id: checkoutId }
                        }
                    }
                });
                
                if (result.purchases && result.purchases.length > 0) break;
            } catch (err) {
                console.error('Error polling InstantDB for purchase:', err);
            }
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    // User has completed payment, redirect to dashboard
    const redirectUrl = new URL('/dashboard', request.url);
    if (checkoutId) {
        redirectUrl.searchParams.set('checkout_id', checkoutId);
    }

    return NextResponse.redirect(redirectUrl);
}
