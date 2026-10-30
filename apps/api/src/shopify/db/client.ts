/**
 * Drizzle client over libsql (SQLite). Tests use an in-memory database;
 * local dev points DATABASE_PATH at a file. The Postgres production
 * realization of the same tables slots in behind ShopifyStore — the gap
 * is noted in the PR (spec D2 stack: Postgres prod / SQLite tests).
 */

import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";

import * as schema from "./schema.js";

/** Drizzle database handle — the only db type job runners and routes see. */
export type ShopifyDb = ReturnType<typeof drizzle<typeof schema>>;

/** The drizzle-kit migrations directory, resolved from this module. */
const MIGRATIONS_FOLDER = fileURLToPath(new URL("./migrations", import.meta.url));

/**
 * Opens (and migrates) the Shopify database. `url` is a libsql URL:
 * ":memory:" for tests, "file:<path>" for local dev. Migrations run on
 * every open — idempotent by drizzle's journal.
 */
export function openShopifyDb(url: string): ShopifyDb {
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
export async function migrateShopifyDb(db: ShopifyDb): Promise<void> {
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
}

export { schema };
