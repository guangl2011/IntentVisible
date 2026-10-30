import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Lint runs as a dedicated CI job (`pnpm lint` from the repo root);
  // the production build must not depend on the ESLint toolchain.
  eslint: { ignoreDuringBuilds: true },
};

export default nextConfig;
