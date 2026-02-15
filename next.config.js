const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    register: true,
    disable: process.env.NODE_ENV === 'development',
    // Avoid forcing navigation caching on App Router transitions.
    // This can make client transitions behave like fresh page loads.
    cacheOnFrontEndNav: false,
    reloadOnOnline: false,
    // Keep start URL deterministic to avoid caching auth redirects as app navigations.
    dynamicStartUrl: false,
    // Use the app's offline handoff route when a document request happens offline.
    fallbacks: {
        document: '/offline-app',
    },
    publicExcludes: [
        '!recitations/**/*',
        '!qpc-hafs-word-by-word.json',
        '!assets/premade-mindmaps/**/*.tldraw',
        '!assets/premade-mindmaps/**/*.chunks.txt',
    ],
    workboxOptions: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        additionalManifestEntries: [
            { url: '/offline-app', revision: null },
        ],
        runtimeCaching: [
            {
                urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                    cacheName: 'google-fonts-webfonts',
                    expiration: {
                        maxEntries: 4,
                        maxAgeSeconds: 365 * 24 * 60 * 60,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
            {
                urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'google-fonts-stylesheets',
                    expiration: {
                        maxEntries: 4,
                        maxAgeSeconds: 7 * 24 * 60 * 60,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
            {
                urlPattern: /\/_next\/static\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'static-assets-v11',
                    expiration: {
                        maxEntries: 256,
                        maxAgeSeconds: 7 * 24 * 60 * 60,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
            {
                urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'image-assets-v11',
                    expiration: {
                        maxEntries: 200,
                        maxAgeSeconds: 7 * 24 * 60 * 60,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
            {
                urlPattern: /\/(search-index\.json|qpc-hafs-word-by-word\.json|assets\/premade-mindmaps\/.*)/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'offline-content-v11',
                    expiration: {
                        maxEntries: 128,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
                    },
                    cacheableResponse: {
                        statuses: [0, 200],
                    },
                },
            },
            {
                urlPattern: /^https?.*\/api\/.*/i,
                handler: 'NetworkOnly',
            },
        ],
    },
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
                source: '/sw.js',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-cache, no-store, must-revalidate'
                    }
                ]
            },
            {
                source: '/manifest.json',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-cache, no-store, must-revalidate'
                    }
                ]
            },
            {
                source: '/workbox-:path(.*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-cache, no-store, must-revalidate'
                    }
                ]
            },
            {
                source: '/fallback-:path(.*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-cache, no-store, must-revalidate'
                    }
                ]
            },
            {
                source: '/worker-:path(.*)',
                headers: [
                    {
                        key: 'Cache-Control',
                        value: 'no-cache, no-store, must-revalidate'
                    }
                ]
            },
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
