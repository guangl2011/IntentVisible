import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { SnapshotRefSchema } from "@intentvisible/core-schema";

import { LocalFileSnapshotStore } from "../src/snapshot.js";
import type { PageSnapshot } from "../src/types.js";

function makeSnapshot(rawHtml: string, overrides: Partial<PageSnapshot> = {}): PageSnapshot {
  return {
    url: "https://example.com/products/blueyet",
    status: 200,
    fetched_at: "2026-10-30T00:00:00.000Z",
    content_hash: "a".repeat(64),
    raw_html: rawHtml,
    ...overrides,
  };
}

describe("LocalFileSnapshotStore", () => {
  let rootDir: string;

  beforeEach(async () => {
    rootDir = await mkdtemp(join(tmpdir(), "url-extractor-snapshots-"));
  });

  it("saves and reads back raw HTML with a SnapshotRef-shaped record", async () => {
    const store = new LocalFileSnapshotStore(rootDir);
    const snapshot = makeSnapshot("<html><p>hello</p></html>", { content_hash: "b".repeat(64) });

    const stored = await store.save(snapshot);
    expect(SnapshotRefSchema.parse(stored)).toEqual(stored);
    expect(stored.content_hash).toBe("b".repeat(64));
    await expect(store.read(stored.storage_ref)).resolves.toContain("hello");
  });

  it("dedupes identical content to the same content-addressed ref", async () => {
    const store = new LocalFileSnapshotStore(rootDir);
    const first = await store.save(makeSnapshot("<p>same</p>"));
    const second = await store.save(makeSnapshot("<p>same</p>", { fetched_at: "2026-10-30T01:00:00.000Z" }));

    expect(second.storage_ref).toBe(first.storage_ref);
  });

  it("refuses storage refs that are not its own content-addressed names", async () => {
    const store = new LocalFileSnapshotStore(rootDir);
    await expect(store.read("../../etc/passwd")).rejects.toThrow(/Invalid snapshot storage_ref/);
    await expect(store.read("not-a-hash.html")).rejects.toThrow(/Invalid snapshot storage_ref/);
  });
});
