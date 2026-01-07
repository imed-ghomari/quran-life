import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

/**
 * Polar Success Handler
 * Redirects user to dashboard after successful Polar checkout
 * (User is already authenticated in the new flow: Auth → Polar → Dashboard)
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const checkoutId = searchParams.get('checkout_id');

    // Wait for the webhook to process (optional but helpful for UX)
    // We can poll Supabase for a few seconds if needed
    const supabase = await createClient();
    
    // Simple wait loop (max 5 seconds)
    if (checkoutId) {
        for (let i = 0; i < 5; i++) {
            const { data } = await supabase
                .from('purchases')
                .select('id')
                .eq('polar_checkout_id', checkoutId)
                .single();
            
            if (data) break;
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
