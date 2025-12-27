import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: true, // Temporarily disabled to debug production caching issues
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
/** @type {import('next').NextConfig} */
const nextConfig = {
  productionBrowserSourceMaps: true, // Enable source maps for debugging
  reactStrictMode: false, // Disabled to prevent double-mount issues with Tldraw
  // Transpile tldraw packages to ensure proper production build
  transpilePackages: ['tldraw', '@tldraw/tldraw', '@tldraw/editor', '@tldraw/tlschema'],
  webpack: (config) => {
    config.externals.push({
      'utf-8-validate': 'commonjs utf-8-validate',
      'bufferutil': 'commonjs bufferutil',
      'canvas': 'commonjs canvas',
    });
    return config;
  },
};

export default withPWA(nextConfig);
