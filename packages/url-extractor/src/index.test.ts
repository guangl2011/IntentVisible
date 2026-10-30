import { describe, expect, it } from "vitest";

import { SnapshotRefSchema } from "@intentvisible/core-schema";

import * as pkg from "./index.js";

describe("url-extractor", () => {
  it("exposes the fetch-side surface", () => {
    expect(pkg.EXTRACTOR_PACKAGE_NAME).toBe("@intentvisible/url-extractor");
    expect(pkg.DEFAULT_FETCHER_OPTIONS.maxPages).toBeGreaterThan(0);
    expect(pkg.DEFAULT_FETCHER_OPTIONS.maxDepth).toBeGreaterThan(0);
    expect(new pkg.LocalFileSnapshotStore("/tmp/unused")).toBeInstanceOf(pkg.LocalFileSnapshotStore);
    expect(new pkg.SystemClock().nowMs()).toBeGreaterThan(0);
  });

  it("re-exports the core-schema snapshot ref it persists", () => {
    const parsed = SnapshotRefSchema.parse({
      url: "https://example.com/products/blueyet",
      content_hash: "a".repeat(64),
      fetched_at: "2026-10-30T00:00:00.000Z",
      storage_ref: `${"a".repeat(64)}.html`,
    });
    expect(parsed.storage_ref).toContain(".html");
  });

  it("names the typed failure reasons the pipeline can produce", () => {
    expect(pkg.PIPELINE_FAILURE_REASONS).toEqual([
      "fetch_robots_disallowed",
      "fetch_unreachable",
      "extraction_empty",
    ]);
    expect(pkg.FETCH_FAILURE_REASONS).toEqual(["fetch_robots_disallowed", "fetch_unreachable"]);
  });
});
