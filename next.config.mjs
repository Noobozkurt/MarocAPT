/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Server-only packages that must not be bundled into route handlers.
  serverExternalPackages: ['@prisma/client', 'bcryptjs', 'pdf-lib', 'nodemailer', 'ioredis', '@gltf-transform/core', '@gltf-transform/functions', '@gltf-transform/extensions', 'meshoptimizer'],
  images: {
    formats: ['image/avif', 'image/webp'],
  },
  experimental: {
    serverActions: { bodySizeLimit: '30mb' },
  },
  async headers() {
    return [
      {
        source: '/models/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
    ];
  },
};

export default nextConfig;
