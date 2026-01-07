import { NextRequest, NextResponse } from 'next/server';

/**
 * Polar Checkout API Route
 * Handles checkout creation and redirect for the Quran Life app
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('product_id');
    const priceId = searchParams.get('price_id');

    // Input Validation & Sanitization
    // Ensure IDs are valid UUIDs or safe strings to prevent injection
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

    if (!productId || !uuidRegex.test(productId)) {
        return NextResponse.json(
            { error: 'Invalid or missing product_id' },
            { status: 400 }
        );
    }

    if (priceId && !uuidRegex.test(priceId)) {
        return NextResponse.json(
            { error: 'Invalid price_id' },
            { status: 400 }
        );
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
            console.error('Polar checkout creation failed:', errorData);
            return NextResponse.json(
                { error: 'Failed to create checkout session', details: errorData },
                { status: response.status }
            );
        }

        const checkoutData = await response.json();

        // Redirect to Polar checkout page
        return NextResponse.redirect(checkoutData.url);
    } catch (error) {
        console.error('Checkout error:', error);
        return NextResponse.json(
            { error: 'Internal server error creating checkout' },
            { status: 500 }
        );
    }
}
