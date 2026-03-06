const path = require('path');
const fs = require('fs');

const TL_DRAW_PACKAGES = [
    'tldraw',
    '@tldraw/editor',
    '@tldraw/state',
    '@tldraw/state-react',
    '@tldraw/store',
    '@tldraw/tlschema',
    '@tldraw/utils',
    '@tldraw/validate',
];

const resolvePackageRoot = (packageName) => {
    let current = path.dirname(require.resolve(packageName));
    const fsRoot = path.parse(current).root;

    while (current && current !== fsRoot) {
        if (fs.existsSync(path.join(current, 'package.json'))) {
            return current;
        }
        current = path.dirname(current);
    }

    throw new Error(`Could not resolve package root for ${packageName}`);
};

const tldrawAliases = Object.fromEntries(
    TL_DRAW_PACKAGES.map((packageName) => [packageName, resolvePackageRoot(packageName)])
);

const CONTENT_DIR = path.join(process.cwd(), 'content');

const collectMdxFiles = (dirPath, rootDir = dirPath, files = []) => {
    const entries = fs.readdirSync(dirPath, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        if (entry.isDirectory()) {
            collectMdxFiles(fullPath, rootDir, files);
            continue;
        }
        if (!entry.isFile() || !entry.name.endsWith('.mdx')) continue;
        files.push(path.relative(rootDir, fullPath));
    }
    return files;
};

const getDocsPrecacheEntries = (revision) => {
    const routes = new Set(['/docs']);
    if (!fs.existsSync(CONTENT_DIR)) {
        return Array.from(routes).map((url) => ({ url, revision }));
    }

    const mdxFiles = collectMdxFiles(CONTENT_DIR);
    for (const file of mdxFiles) {
        const normalized = file.split(path.sep).join('/');
        if (normalized === 'index.mdx') {
            routes.add('/docs');
            continue;
        }

        let slug = normalized.replace(/\.mdx$/, '');
        if (slug.endsWith('/index')) {
            slug = slug.slice(0, -'/index'.length);
        }
        if (!slug) {
            routes.add('/docs');
            continue;
        }

        routes.add(`/docs/${slug}`);
    }

    return Array.from(routes)
        .sort()
        .map((url) => ({ url, revision }));
};

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
            { url: '/dashboard', revision: PWA_CACHE_VERSION },
            { url: '/todo', revision: PWA_CACHE_VERSION },
            { url: '/statistics', revision: PWA_CACHE_VERSION },
            { url: '/settings', revision: PWA_CACHE_VERSION },
            ...getDocsPrecacheEntries(PWA_CACHE_VERSION),
            { url: '/offline-app', revision: PWA_CACHE_VERSION },
            { url: '/qpc-hafs-word-by-word.json', revision: PWA_CACHE_VERSION },
            { url: '/search-index.json', revision: PWA_CACHE_VERSION },
        ],
        runtimeCaching: [
            {
                urlPattern: ({ request, url }) =>
                    request.mode === 'navigate'
                    && (
                        url.pathname === '/dashboard'
                        || url.pathname === '/todo'
                        || url.pathname === '/statistics'
                        || url.pathname === '/settings'
                        || url.pathname === '/docs'
                        || url.pathname.startsWith('/docs/')
                        || url.pathname === '/offline-app'
                    )
                    && !url.pathname.startsWith('/api/'),
                handler: 'NetworkFirst',
                options: {
                    cacheName: `pages-v13-${PWA_CACHE_VERSION}`,
                    networkTimeoutSeconds: 6,
                    cacheableResponse: {
                        statuses: [200],
                    },
                    expiration: {
                        maxEntries: 64,
                        maxAgeSeconds: 24 * 60 * 60,
                    },
                    precacheFallback: {
                        fallbackURL: '/offline-app',
                    },
                },
            },
            {
                urlPattern: ({ url }) =>
                    url.searchParams.has('_rsc')
                    && (
                        url.pathname === '/dashboard'
                        || url.pathname === '/todo'
                        || url.pathname === '/statistics'
                        || url.pathname === '/settings'
                        || url.pathname === '/docs'
                        || url.pathname.startsWith('/docs/')
                    ),
                handler: 'NetworkFirst',
                options: {
                    cacheName: `rsc-v13-${PWA_CACHE_VERSION}`,
                    networkTimeoutSeconds: 3,
                    matchOptions: {
                        ignoreSearch: true,
                    },
                    cacheableResponse: {
                        statuses: [200],
                    },
                    expiration: {
                        maxEntries: 128,
                        maxAgeSeconds: 24 * 60 * 60,
                    },
                },
            },
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
                // tldraw UI assets (icons, fonts, translations, watermark) come from their CDN.
                // Cache them explicitly so the editor UI remains fully usable offline.
                urlPattern: /^https:\/\/cdn\.tldraw\.com\/.*/i,
                handler: 'CacheFirst',
                options: {
                    cacheName: `tldraw-cdn-v1-${PWA_CACHE_VERSION}`,
                    expiration: {
                        maxEntries: 256,
                        maxAgeSeconds: 30 * 24 * 60 * 60,
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
                    cacheName: `static-assets-v13-${PWA_CACHE_VERSION}`,
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
                    cacheName: `image-assets-v13-${PWA_CACHE_VERSION}`,
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
                    cacheName: `offline-content-v13-${PWA_CACHE_VERSION}`,
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
    turbopack: {
        resolveAlias: tldrawAliases,
    },
    images: {
        unoptimized: true,
    },
    serverExternalPackages: ['@open-spaced-repetition/binding'],
    webpack(config) {
        config.resolve = config.resolve || {};
        config.resolve.alias = {
            ...(config.resolve.alias || {}),
            ...tldrawAliases,
        };
        config.resolve.symlinks = true;
        return config;
    },
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
