
const { Polar } = require('@polar-sh/sdk');

const accessToken = process.env.POLAR_SANDBOX_ACCESS_TOKEN;
const productId = process.env.NEXT_PUBLIC_POLAR_PRODUCT_ID_MONTHLY;

if (!accessToken) {
    console.error('Missing POLAR_SANDBOX_ACCESS_TOKEN');
    process.exit(1);
}

if (!productId) {
    console.error('Missing NEXT_PUBLIC_POLAR_PRODUCT_ID_MONTHLY');
    process.exit(1);
}

console.log('Testing Polar Sandbox Connection...');
console.log('Access Token:', accessToken.slice(0, 10) + '...');
console.log('Product ID:', productId);

async function testConnection() {
    const polar = new Polar({
        accessToken,
        server: 'sandbox',
    });

    try {
        // Try to fetch the product to verify it exists and token is valid
        console.log('Fetching product...');
        // Note: SDK structure might differ, checking products.get
        const product = await polar.products.get({ id: productId });
        console.log('✅ Product found:', product.name || product.id);

        // Try to create a checkout session (dry run essentially)
        console.log('Creating test checkout...');
        const checkout = await polar.checkouts.create({
            products: [productId],
            successUrl: 'https://example.com/success',
        });
        console.log('✅ Checkout created:', checkout.url);

    } catch (error) {
        console.error('❌ Error:', error);
        if (error.response) {
            console.error('Response data:', await error.response.json());
        }
    }
}

testConnection();
