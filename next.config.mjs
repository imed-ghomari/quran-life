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
  // Transpile tldraw packages to ensure proper production build
  transpilePackages: ['tldraw', '@tldraw/tldraw', '@tldraw/editor', '@tldraw/tlschema'],
};

export default withPWA(nextConfig);
