import type { NextConfig } from 'next';

/**
 * The dashboard is exported as static files and served by the API server at /admin
 * (one service to host, same address, no CORS). Security headers are set by the API (helmet).
 */
const config: NextConfig = {
  output: 'export',
  basePath: '/admin',
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
};
export default config;
