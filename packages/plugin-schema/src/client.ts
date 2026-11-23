/**
 * Drizzle client over libsql (SQLite). Same shape as the API's Shopify
 * client: tests use an in-memory database, local dev points at a file,
 * and a Postgres production realization slots in later.
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "./schema.js";

/** Drizzle database handle — the type seeders and future plugin reads see. */
export type PluginDb = ReturnType<typeof drizzle<typeof schema>>;

/** The drizzle-kit migrations directory, resolved from this module. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Opens the plugin database. `url` is a libsql URL: ":memory:" for tests,
 * "file:<path>" for local dev. Migrations run on every open — idempotent
 * by drizzle's journal.
 */
export function openPluginDb(url: string): PluginDb {
  if (url !== ":memory:" && url.startsWith("file:") === false) {
    throw new Error(`libsql url must be ":memory:" or "file:<path>", got "${url}"`);
  }
  if (url.startsWith("file:") && !existsSync(url.slice("file:".length))) {
    throw new Error(`database file does not exist: ${url}`);
  }
  const client: Client = createClient({ url });
  return drizzle(client, { schema });
}

/** Applies the checked-in drizzle migrations — every open, idempotent. */
export async function migratePluginDb(db: PluginDb): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

export { schema };
