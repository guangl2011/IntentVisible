import { defineConfig } from "@playwright/test";
import { E2E_DATABASE_URL, E2E_PASSCODE } from "./e2e/config-url";

export default defineConfig({
  testDir: "e2e",
  timeout: 30_000,
  use: {
    baseURL: "http://localhost:3000",
  },
  webServer: {
    command: "pnpm dev",
    url: "http://localhost:3000",
    reuseExistingServer: true,
    env: {
      DATABASE_URL: E2E_DATABASE_URL,
      DASHBOARD_PASSCODE: E2E_PASSCODE,
    },
  },
});
