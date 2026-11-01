import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint runs as a dedicated CI job (`pnpm lint` from the repo root);
  // the production build must not depend on the ESLint toolchain.
  eslint: { ignoreDuringBuilds: true },
  // packages/client (and core-schema beneath it) ship TypeScript source;
  // webpack must transpile them rather than treating them as built JS.
  transpilePackages: ["@intentvisible/client", "@intentvisible/core-schema"],
  webpack(config) {
    // Those packages use NodeNext-style "./x.js" import specifiers
    // (the API consumes them as source). Map the specifier to the TS
    // file for the bundler.
    config.resolve.extensionAlias = { ".js": [".ts", ".js"] };
    return config;
  },
  async rewrites() {
    // The Shopify merchant pages call /shopify-api/*; in dev that proxies
    // to the API server (default port 4310, or SHOPIFY_API_PROXY).
    // Production sets NEXT_PUBLIC_SHOPIFY_API_BASE instead and no rewrite
    // is needed.
    // The Pipeline v2 pages do the same for /pipeline-api/*, driven by
    // NEXT_PUBLIC_PIPELINE_API_BASE / PIPELINE_API_PROXY.
    const rewrites: { source: string; destination: string }[] = [];
    if (process.env.NEXT_PUBLIC_SHOPIFY_API_BASE === undefined) {
      rewrites.push({
        source: "/shopify-api/:path*",
        destination: `${process.env.SHOPIFY_API_PROXY ?? "http://127.0.0.1:4310"}/:path*`,
      });
    }
    if (process.env.NEXT_PUBLIC_PIPELINE_API_BASE === undefined) {
      rewrites.push({
        source: "/pipeline-api/:path*",
        destination: `${process.env.PIPELINE_API_PROXY ?? "http://127.0.0.1:4310"}/:path*`,
      });
    }
    return rewrites;
  },
};

export default nextConfig;
