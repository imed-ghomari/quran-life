const withPWA = require('next-pwa')({
    dest: 'public',
    register: true,
    skipWaiting: true,
    cleanupOutdatedCaches: true,
    disable: process.env.NODE_ENV === 'development',
    fallbacks: {
        document: '/offline',
    },
    runtimeCaching: [
        // HTML navigations: prefer network, but allow fast fallback if network is slow.
        {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
                cacheName: 'pages',
                networkTimeoutSeconds: 4,
                expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 24 * 60 * 60,
                },
            },
        },
        // Static assets: update in background to reduce stale UI.
        {
            urlPattern: ({ request }) =>
                request.destination === 'style' ||
                request.destination === 'script' ||
                request.destination === 'font' ||
                request.destination === 'image',
            handler: 'StaleWhileRevalidate',
            options: {
                cacheName: 'static-assets',
                expiration: {
                    maxEntries: 200,
                    maxAgeSeconds: 7 * 24 * 60 * 60,
                },
            },
        },
        // JSON data: keep short-lived cache to avoid long-lived stale data.
        {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.endsWith('.json'),
            handler: 'NetworkFirst',
            options: {
                cacheName: 'data-json',
                networkTimeoutSeconds: 3,
                expiration: {
                    maxEntries: 50,
                    maxAgeSeconds: 24 * 60 * 60,
                },
            },
        },
    ],
});

/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    turbopack: {},
    images: {
        unoptimized: true,
    },
    serverExternalPackages: ['@open-spaced-repetition/binding'],
    // Add security headers to all responses
    async headers() {
        return [
            {
                source: '/:path*',
                headers: [
                    {
                        key: 'X-DNS-Prefetch-Control',
                        value: 'on'
                    },
                    {
                        key: 'Strict-Transport-Security',
                        value: 'max-age=63072000; includeSubDomains; preload'
                    },
                    {
                        key: 'X-XSS-Protection',
                        value: '1; mode=block'
                    },
                    {
                        key: 'X-Frame-Options',
                        value: 'DENY' // Prevent clickjacking
                    },
                    {
                        key: 'X-Content-Type-Options',
                        value: 'nosniff' // Prevent MIME type sniffing
                    },
                    {
                        key: 'Referrer-Policy',
                        value: 'strict-origin-when-cross-origin'
                    }
                ]
            },
            {
                source: '/((?!_next|favicon.ico).*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'public, max-age=0, must-revalidate'
                    }
                ]
            },
            {
                source: '/api/:path*',
                headers: [
                    { key: 'Access-Control-Allow-Credentials', value: 'true' },
                    { key: 'Access-Control-Allow-Origin', value: '*' }, // Replace '*' with specific domain in production if needed
                    { key: 'Access-Control-Allow-Methods', value: 'GET,DELETE,PATCH,POST,PUT' },
                    { key: 'Access-Control-Allow-Headers', value: 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version' },
                ]
            }
        ];
    }
};

module.exports = withPWA(nextConfig);
