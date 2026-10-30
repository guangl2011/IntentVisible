import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/shopify/db/schema.ts",
  out: "./src/shopify/db/migrations",
  // Migrations run programmatically via src/shopify/db/migrate.ts
  // (libsql client) in local dev and tests; no CLI migrate step.
});
