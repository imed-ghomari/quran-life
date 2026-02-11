const withSerwist = require('@serwist/next').default({
    swSrc: 'src/sw.ts',
    swDest: 'public/sw.js',
    register: true,
    disable: process.env.NODE_ENV === 'development',
    // Avoid giant precache manifests that can break SW installs on lower-storage devices.
    globPublicPatterns: [
        '**/*.{js,css,html,ico,png,svg,webp,jpg,jpeg,gif,webmanifest}',
        'search-index.json',
        'assets/premade-mindmaps/index.json',
        'assets/premade-mindmaps/*.chunks.txt',
        'assets/premade-mindmaps/*.tldraw',
    ],
    maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
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

module.exports = withSerwist(nextConfig);
