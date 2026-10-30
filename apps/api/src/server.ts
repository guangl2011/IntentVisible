/**
 * Real-dependency entrypoint: Gemini adapter from the injected runtime
 * secret, system clock, local snapshot storage, global fetch. Fixture
 * tests never run this module — they script the seams directly.
 */

import { FetchChatAdapter, resolveProviderConfig } from "@intentvisible/intent-engine";
import { LocalFileSnapshotStore, SystemClock } from "@intentvisible/url-extractor";

import { AnalyzePipeline } from "./pipeline.js";
import { InProcessQueue } from "./queue.js";
import { MemoryJobStore, MemoryLibraryStore } from "./store.js";
import { buildApp } from "./app.js";

async function main(): Promise<void> {
  const model = process.env.LLM_MODEL;
  if (!model) {
    console.error("Set LLM_MODEL to the Gemini deployment to use.");
    process.exit(1);
  }
  const provider = resolveProviderConfig(process.env, model);
  if (!provider.ok) {
    console.error(`LLM provider unavailable: ${provider.reason}`);
    process.exit(1);
  }

  const snapshotRoot = process.env.SNAPSHOT_DIR ?? "/tmp/intentvisible-snapshots";
  const jobStore = new MemoryJobStore();
  const libraryStore = new MemoryLibraryStore();
  const queue = new InProcessQueue(1);
  const pipeline = new AnalyzePipeline({
    jobStore,
    libraryStore,
    queue,
    extractorDeps: {
      clock: new SystemClock(),
      fetchImpl: fetch,
      snapshotStore: new LocalFileSnapshotStore(snapshotRoot),
    },
    llmAdapter: new FetchChatAdapter({
      baseUrl: provider.config.baseUrl,
      apiKey: provider.config.apiKey,
      model: provider.config.model,
    }),
  });

  const app = buildApp({ pipeline, jobStore, libraryStore });
  const port = Number(process.env.PORT ?? 3000);
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`intent-visible api listening on :${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
