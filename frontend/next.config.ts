import type { NextConfig } from "next";

const BACKEND_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

const nextConfig: NextConfig = {
  headers: async () => [
    {
      source: '/sw.js',
      headers: [
        { key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' },
        { key: 'Service-Worker-Allowed', value: '/' },
      ],
    },
  ],
  // Keep trailing slashes so Django URLs work through the proxy
  skipTrailingSlashRedirect: true,
  // Proxy API requests to Django backend (localhost in dev, Railway URL in production)
  rewrites: async () => [
    {
      source: '/api/:path*/',
      destination: `${BACKEND_URL}/api/:path*/`,
    },
    {
      source: '/api/:path*',
      destination: `${BACKEND_URL}/api/:path*`,
    },
  ],
};

export default nextConfig;
