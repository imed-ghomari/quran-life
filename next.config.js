const PWA_CACHE_VERSION = (
    process.env.VERCEL_GIT_COMMIT_SHA
    || process.env.VERCEL_DEPLOYMENT_ID
    || process.env.COMMIT_REF
    || process.env.GITHUB_SHA
    || `${Date.now()}`
).slice(0, 12);

const withPWA = require('@ducanh2912/next-pwa').default({
    dest: 'public',
    register: true,
    disable: process.env.NODE_ENV === 'development',
    cacheOnFrontEndNav: false,
    reloadOnOnline: false,
    dynamicStartUrl: false,
    fallbacks: {
        document: '/offline-app',
    },
    publicExcludes: [
        '!recitations/**/*',
        '!qpc-hafs-word-by-word.json',
    ],
    workboxOptions: {
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        additionalManifestEntries: [
            { url: '/', revision: PWA_CACHE_VERSION },
            { url: '/dashboard', revision: PWA_CACHE_VERSION },
            { url: '/offline-app', revision: PWA_CACHE_VERSION },
            { url: '/qpc-hafs-word-by-word.json', revision: PWA_CACHE_VERSION },
            { url: '/search-index.json', revision: PWA_CACHE_VERSION },
        ],
        runtimeCaching: [
            {
                urlPattern: ({ request, url }) =>
                    request.mode === 'navigate'
                    && (
                        url.pathname === '/'
                        || url.pathname === '/dashboard'
                        || url.pathname === '/offline-app'
                    )
                    && !url.pathname.startsWith('/api/'),
                handler: 'NetworkFirst',
                options: {
                    cacheName: `pages-v13-${PWA_CACHE_VERSION}`,
                    networkTimeoutSeconds: 6,
                    cacheableResponse: { statuses: [200] },
                    expiration: { maxEntries: 64, maxAgeSeconds: 24 * 60 * 60 },
                    precacheFallback: { fallbackURL: '/offline-app' },
                },
            },
            {
                urlPattern: ({ url }) =>
                    url.searchParams.has('_rsc')
                    && (
                        url.pathname === '/'
                        || url.pathname === '/dashboard'
                        || url.pathname === '/offline-app'
                    ),
                handler: 'NetworkFirst',
                options: {
                    cacheName: `rsc-v13-${PWA_CACHE_VERSION}`,
                    networkTimeoutSeconds: 3,
                    matchOptions: { ignoreSearch: true },
                    cacheableResponse: { statuses: [200] },
                    expiration: { maxEntries: 128, maxAgeSeconds: 24 * 60 * 60 },
                },
            },
            {
                urlPattern: /^https:\/\/fonts\.(?:gstatic)\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                    cacheName: 'google-fonts-webfonts',
                    expiration: { maxEntries: 4, maxAgeSeconds: 365 * 24 * 60 * 60 },
                    cacheableResponse: { statuses: [0, 200] },
                },
            },
            {
                urlPattern: /^https:\/\/fonts\.(?:googleapis)\.com\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: 'google-fonts-stylesheets',
                    expiration: { maxEntries: 4, maxAgeSeconds: 7 * 24 * 60 * 60 },
                    cacheableResponse: { statuses: [0, 200] },
                },
            },
            {
                urlPattern: /\/_next\/static\/.*/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: `static-assets-v13-${PWA_CACHE_VERSION}`,
                    expiration: { maxEntries: 256, maxAgeSeconds: 7 * 24 * 60 * 60 },
                    cacheableResponse: { statuses: [0, 200] },
                },
            },
            {
                urlPattern: /\.(?:png|jpg|jpeg|gif|webp|svg|ico)$/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: `image-assets-v13-${PWA_CACHE_VERSION}`,
                    expiration: { maxEntries: 200, maxAgeSeconds: 7 * 24 * 60 * 60 },
                    cacheableResponse: { statuses: [0, 200] },
                },
            },
            {
                urlPattern: /\/(search-index\.json|qpc-hafs-word-by-word\.json)/i,
                handler: 'StaleWhileRevalidate',
                options: {
                    cacheName: `offline-content-v13-${PWA_CACHE_VERSION}`,
                    expiration: { maxEntries: 128, maxAgeSeconds: 30 * 24 * 60 * 60 },
                    cacheableResponse: { statuses: [0, 200] },
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
    env: {
        NEXT_PUBLIC_DEPLOYMENT_ID: PWA_CACHE_VERSION,
    },
    images: {
        unoptimized: true,
    },
    async headers() {
        return [
            {
                source: '/sw.js',
                headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }]
            },
            {
                source: '/manifest.json',
                headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }]
            },
            {
                source: '/workbox-:path(.*)',
                headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }]
            },
            {
                source: '/:path*',
                headers: [
                    { key: 'X-DNS-Prefetch-Control', value: 'on' },
                    { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                    { key: 'X-XSS-Protection', value: '1; mode=block' },
                    { key: 'X-Frame-Options', value: 'DENY' },
                    { key: 'X-Content-Type-Options', value: 'nosniff' },
                    { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' }
                ]
            },
            {
                source: '/((?!_next|favicon.ico).*)',
                headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }]
            },
        ];
    }
};

module.exports = withPWA(nextConfig);
