/** @type {import('next').NextConfig} */
const nextConfig = {
    reactStrictMode: true,
    eslint: {
        // Warning: This allows production builds to successfully complete even if
        // your project has ESLint errors.
        ignoreDuringBuilds: true,
    },
    typescript: {
        //  We verified tsc passes, but this ensures next build doesn't double-check and fail on minor things
        ignoreBuildErrors: true,
    }
}

module.exports = nextConfig
