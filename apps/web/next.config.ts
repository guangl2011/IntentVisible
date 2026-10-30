import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint runs as a dedicated CI job (`pnpm lint` from the repo root);
  // the production build must not depend on the ESLint toolchain.
  eslint: { ignoreDuringBuilds: true },
  async rewrites() {
    // The Shopify merchant pages call /shopify-api/*; in dev that proxies
    // to the API server (default port 4310, or SHOPIFY_API_PROXY).
    // Production sets NEXT_PUBLIC_SHOPIFY_API_BASE instead and no rewrite
    // is needed.
    if (process.env.NEXT_PUBLIC_SHOPIFY_API_BASE !== undefined) return [];
    return [
      {
        source: "/shopify-api/:path*",
        destination: `${process.env.SHOPIFY_API_PROXY ?? "http://127.0.0.1:4310"}/:path*`,
      },
    ];
  },
};

export default nextConfig;
