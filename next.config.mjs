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
  // Removed custom webpack config to rely on Next.js defaults
};

export default withPWA(nextConfig);
