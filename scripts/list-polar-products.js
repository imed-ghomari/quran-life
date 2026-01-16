
const { Polar } = require('@polar-sh/sdk');

const accessToken = process.env.POLAR_SANDBOX_ACCESS_TOKEN;

if (!accessToken) {
    console.error('Missing POLAR_SANDBOX_ACCESS_TOKEN');
    process.exit(1);
}

console.log('Listing Polar Sandbox Products...');

async function listProducts() {
    const polar = new Polar({
        accessToken,
        server: 'sandbox',
    });

    try {
        const result = await polar.products.list({});
        console.log('Found products:', result.result.items.length);
        result.result.items.forEach(p => {
            console.log(`- Name: ${p.name}, ID: ${p.id}`);
        });

    } catch (error) {
        console.error('❌ Error listing products:', error);
    }
}

listProducts();
