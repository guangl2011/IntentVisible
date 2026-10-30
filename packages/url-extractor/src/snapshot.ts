import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

import type { PageSnapshot, StoredSnapshot } from "./types.js";

/**
 * Page snapshot persistence (spec Flow, Fetch row: snapshots to storage
 * with content_hash and fetch timestamp). Object storage arrives later;
 * for now everything goes through this interface, so the swap is a new
 * driver, not a pipeline change.
 */
export interface SnapshotStore {
  save(snapshot: PageSnapshot): Promise<StoredSnapshot>;
  /** Reads raw HTML back for diagnosis or evidence resolution. */
  read(storageRef: string): Promise<string>;
}

export class LocalFileSnapshotStore implements SnapshotStore {
  /** This driver's refs are content-addressed sha256 hex names. */
  private static readonly REF_PATTERN = /^[a-f0-9]{64}\.html$/;

  constructor(private readonly rootDir: string) {}

  async save(snapshot: PageSnapshot): Promise<StoredSnapshot> {
    await mkdir(this.rootDir, { recursive: true });
    const storageRef = `${snapshot.content_hash}.html`;
    // Content-addressed: identical content dedupes to the same file.
    await writeFile(join(this.rootDir, storageRef), snapshot.raw_html, "utf8");
    return {
      url: snapshot.url,
      content_hash: snapshot.content_hash,
      fetched_at: snapshot.fetched_at,
      storage_ref: storageRef,
    };
  }

  async read(storageRef: string): Promise<string> {
    // The ref comes back out of records; never let it traverse.
    if (!LocalFileSnapshotStore.REF_PATTERN.test(storageRef)) {
      throw new Error(`Invalid snapshot storage_ref: ${storageRef}`);
    }
    return readFile(join(this.rootDir, storageRef), "utf8");
  }
}
