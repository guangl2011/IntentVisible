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
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      DASHBOARD_PASSCODE: E2E_PASSCODE,
      CRON_SECRET: E2E_CRON_SECRET,
    },
  },
});
