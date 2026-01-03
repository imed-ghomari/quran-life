import { NextRequest, NextResponse } from 'next/server';

/**
 * Polar Checkout API Route
 * Handles checkout creation and redirect for the Quran Life app
 */
export async function GET(request: NextRequest) {
    const searchParams = request.nextUrl.searchParams;
    const productId = searchParams.get('product_id');
    const priceId = searchParams.get('price_id');

    if (!productId) {
        return NextResponse.json(
            { error: 'Missing required parameter: product_id' },
            { status: 400 }
        );
    }

    try {
        // Create checkout session with Polar
        const checkoutResponse = await fetch('https://api.polar.sh/v1/checkouts/custom', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${process.env.POLAR_ACCESS_TOKEN}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                product_id: productId,
                ...(priceId && { product_price_id: priceId }),
                success_url: process.env.POLAR_SUCCESS_URL,
                // customer_email can be added here if you want to pre-fill the email
            }),
        });

        if (!checkoutResponse.ok) {
            const errorData = await checkoutResponse.json().catch(() => ({}));
            console.error('Polar checkout creation failed:', errorData);
            return NextResponse.json(
                { error: 'Failed to create checkout session', details: errorData },
                { status: checkoutResponse.status }
            );
        }

        const checkoutData = await checkoutResponse.json();

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
