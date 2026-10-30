/**
 * Local default so `pnpm e2e` works on a fresh checkout; CI or the
 * developer's environment overrides it. The webServer env reaches the dev
 * server; the specs' own Prisma seeding reads the same constant.
 */
export const E2E_DATABASE_URL =
  process.env.DATABASE_URL ??
  "postgresql://postgres:postgres@localhost:5432/intentvisible_local";

export const E2E_PASSCODE = process.env.DASHBOARD_PASSCODE ?? "e2e-passcode";
