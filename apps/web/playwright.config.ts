import { defineConfig } from "@playwright/test";
import { E2E_CRON_SECRET, E2E_DATABASE_URL, E2E_PASSCODE } from "./e2e/config-url";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  // CI refuses a stray --grep/--forbid-only mistake; traces keep failing CI
  // runs debuggable via the uploaded report artifact.
  ...(process.env.CI ? { forbidOnly: true } : {}),
  // One worker: every spec shares one Postgres database, and the sweeper
  // test's "second sweep is a no-op" assertion is only deterministic when no
  // other test's pending intent is in flight.
  workers: 1,
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: "pnpm dev",
      url: "http://localhost:3000",
      reuseExistingServer: true,
      env: {
        DATABASE_URL: E2E_DATABASE_URL,
        DASHBOARD_PASSCODE: E2E_PASSCODE,
        CRON_SECRET: E2E_CRON_SECRET,
      },
    },
    // The plugin-flow spec reads the deterministic demo seed through the
    // real API fixture server (dev:fixtures, in-memory SQLite — no
    // Postgres, no keys). The overview URL doubles as the readiness
    // probe: it only answers 200 once the seed is loaded.
    {
      command: "pnpm --filter @intentvisible/api dev:fixtures",
      url: "http://127.0.0.1:4310/v1/plugin/shops/shop_solix_demo/overview",
      reuseExistingServer: true,
    },
  ],
});
