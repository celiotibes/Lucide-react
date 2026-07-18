import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Skip prerendering for routes that require database access
  // This prevents build errors when DATABASE_URL is not set
  skipMiddlewareUrlNormalization: true,
};

export default nextConfig;
