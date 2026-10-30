import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts", "src/**/*.test.ts"],
    // DB test files share one Postgres database in CI; parallel files can
    // observe each other's writes, so keep test files sequential.
    fileParallelism: false,
  },
  // tsconfig sets jsx: "preserve" for Next.js; vitest transforms test
  // files itself, so component tests need the runtime transform here.
  esbuild: { jsx: "automatic" },
});
