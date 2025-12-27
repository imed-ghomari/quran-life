import withPWAInit from 'next-pwa';

const withPWA = withPWAInit({
  dest: 'public',
  disable: false, // process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Transpile tldraw packages to ensure proper production build
  transpilePackages: ['tldraw', '@tldraw/tldraw', '@tldraw/editor', '@tldraw/tlschema'],
  // Webpack config to handle tldraw's dynamic imports properly
  webpack: (config, { isServer }) => {
    // Tldraw uses some browser-only APIs, skip on server
    if (isServer) {
      config.externals.push({
        canvas: 'commonjs canvas',
      });
    }
    return config;
  },
};

export default withPWA(nextConfig);
