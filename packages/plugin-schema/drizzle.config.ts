import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/schema.ts",
  out: "./src/migrations",
  // Migrations run programmatically via src/client.ts (libsql client) in
  // local dev and tests; no CLI migrate step.
});
