import type { NextConfig } from "next";

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
  // Proxy API requests to Django — eliminates CORS issues in Codespaces/production
  rewrites: async () => [
    {
      source: '/api/:path*/',
      destination: 'http://localhost:8000/api/:path*/',
    },
    {
      source: '/api/:path*',
      destination: 'http://localhost:8000/api/:path*',
    },
  ],
};

export default nextConfig;
