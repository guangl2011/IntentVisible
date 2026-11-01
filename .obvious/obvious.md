# IntentVisible — Agent Onboarding Notes

Buyer Intent Library (BIL), externally branded IntentVisible. Pipeline v2 adds
the three-stage PSI pipeline (Marketing Graph → Prompt Engine & Monitoring →
Buyer Intent Lib) on top of the v1 core engine. Source of truth: blueprint
"IntentVisible Pipeline v2" (art_9zAvKcEq); see `docs/verification-report.md`
for how each of the 13 spec criteria is verified.

## Stack and runtime matrix

- TypeScript ESM, pnpm monorepo (pnpm 12.x, Node >= 20; CI uses Node 22)
- Packages: `packages/*` + `apps/*`; all tests via Vitest
- Schema contract: Draft 2020-12 JSON Schemas + generated TS types
  (`scripts/generate-types.mjs`, checked by `pnpm generate:check`) + Zod
  runtime validation
- LLM: provider-agnostic adapter; live provider is Google Gemini via
  OpenAI-compatible endpoint. ALL fixture-based tests never call the network —
  every v2 stage runs on recorded fixtures in CI.
- DB (apps/web only): Prisma against PostgreSQL (CI provisions Postgres 16);
  DB-backed test suites skip without `DATABASE_URL`
- Object storage for snapshots: local filesystem driver (`SNAPSHOT_DIR`)
- API: Fastify + in-process queue with test fallback (`apps/api`)
- Lint: eslint (flat config, typescript-eslint); formatting: prettier

## Local dev commands

```sh
pnpm install
pnpm --filter @intentvisible/web generate   # prisma client — required before typecheck/test
pnpm -r build                               # build all workspaces
pnpm test                                   # all suites (DB-backed web suites skip without DATABASE_URL)
pnpm lint && pnpm typecheck && pnpm generate:check
pnpm --filter @intentvisible/api start             # API server (tsx src/server.ts)
pnpm --filter @intentvisible/web dev               # web app
pnpm --filter @intentvisible/web e2e               # Playwright (needs DATABASE_URL + running app)
```

If you run a `next build` locally, note it rewrites the tracked
`apps/web/next-env.d.ts`; `git checkout -- apps/web/next-env.d.ts` restores it.

## Env vars and secrets

- `SECRET_LLM_API_KEY` — LLM API key, injected as a runtime secret only
  (name only; never commit or log a value). Required only for live LLM
  generation, not for tests.
- `LLM_MODEL` — model id for the API server (e.g. a Gemini model name).
- `DATABASE_URL` — Postgres connection string; enables the DB-backed web suites
  and Prisma migrations.
- `SNAPSHOT_DIR` — snapshot storage root (default `/tmp/intentvisible-snapshots`).
- `PORT` — API port (default 3000).

## Codebase map

### Schema and shared contract

- `packages/core-schema` — JSON Schemas, generated TS types, Zod validation.
  v1: Intent Schema + the standalone measurement invariant
  (`measurement_status: "not_measured"` ⇒ `visibility_pct`/`monthly_search_volume`
  must be null). v2 adds: `BUYER_STAGES_V2` (six stages) and
  `INTENT_CATEGORIES_V2` (ten categories) as canonical taxonomies with the v1
  legacy alias mapping table (read-time mapping — no data rewrite);
  Persona / Scenario / PromptRecord / MonitoringRun / MetricsSnapshot /
  MarketingGraph schemas; `DataMode` (`llm_estimated` / `llm_simulated` /
  `provider_measured`) and `MeasurementStatusV2` (adds `simulated`).

### Pipeline v2 packages

- `packages/data-providers` — the two reserved provider interfaces and their
  LLM defaults: `KeywordDataProvider` (demand-tier estimation, temperature 0,
  cached per keyword/country/language/quarter) and `MonitoringRunner`
  (LLM-simulated platform-persona answers for ChatGPT Search, Perplexity,
  Google AI Overviews, Gemini). Advanced impls (DataForSEO, Visible, native
  APIs) implement the same interfaces later; fixture providers pass the same
  conformance suite as the defaults (`tests/conformance-suite.ts`), so callers
  cannot branch on implementation identity.
- `packages/metrics` — pure-function calculators over stored monitoring runs:
  Visibility %, Leader Gap, Void Rate (≥25% ⇒ opportunity tag), Citation
  Share, Sentiment Index, baseline consensus (`stable`/`noisy` at ±10 points),
  plus the deterministic answer parser. Every computed snapshot carries a full
  provenance block (run count, platforms, date range, model, data_mode);
  mixed-mode baselines are a typed rejection.
- `packages/intent-lib-export` — deterministic Export Spec v2 renderer:
  YAML records + grouped human document + Data Mode header, ≥30% visibility
  floor, Revenue (≥50%) / Market (30–49%) split, single metadata block.
  Golden-file and round-trip tested; nothing recomputes stored metrics.

### Engine and ingestion

- `packages/intent-engine` — evidence-first LLM generation, validation +
  typed drop log, market-scoped semantic dedup to stable `intent_id`s with
  version bumps. v2 generation modes: Stage A (crawl-plan pass + persona/
  scenario/competitor modeling → validated Marketing Graph; every claim cites
  a snapshot or is flagged `assumption`; thin crawls fail loudly) and Stage B
  (deterministic intent selection — volume tier desc, gap desc, `intent_id`
  tie-break; 5–7 persona-voiced prompts per selected intent; near-duplicate
  collapse; monitoring-plan assembly with blueprint defaults).
- `packages/url-extractor` — robots-aware fetcher, snapshot storage with
  `content_hash`, JSON-LD / meta-tag / HTML profile extraction with per-field
  evidence URLs. Stage A's crawl input.
- `packages/intent-importer` — Solix golden dataset (CSV/JSON) importer into
  Intent Schema v1; maps measurement-derived fields to standalone nulls.
- `packages/shopify-connector` — OAuth, Admin GraphQL catalog sync, webhook
  verification. The Shopify app install is one of the v2 install triggers.

### Applications

- `packages/client` — typed client for the API.
- `apps/api` — Fastify REST API. v1 analyze endpoints + job state machine
  (queued → fetching → extracting → generating → validating → complete|failed,
  typed failure reasons). v2 pipeline orchestration in
  `src/orchestration/`: install-triggered lifecycle (`site_url` fallback or
  Shopify install), gate endpoints (list/approve/edit/reject/timeout),
  recurring monitoring scheduler with usage guard, lib publish with
  provenance-complete version bumps, provider-configuration surface
  (default `llm`).
- `apps/web` — Next.js app: two-step post-install onboarding (install status,
  country/language selectors defaulting USA/English), Gate 1–3 review screens,
  metrics dashboard, published-lib browser, human decision / agent outcome
  APIs, Prisma schema and migrations.

### Pipeline job states

The v2 pipeline reuses the v1 job queue's state machine with this status
vocabulary (`apps/api/src/orchestration/types.ts`, in run order — every
transition guarded by `canTransition`):

```
installed → crawling → research → modeling → estimating
  → [pending_gate_1] → selecting → expanding
  → [pending_gate_2] → monitoring → computing
  → [pending_gate_3] → complete            (any state → failed)
```

- Gate statuses are skipped entirely when the gate is off; a gate left
  unanswered past its timeout (default 72h) records `auto_approved` and
  auto-proceeds — the pipeline never blocks by default.
- Rejection re-enters the corresponding stage: `pending_gate_1` → crawling
  (Stage A re-models with feedback), `pending_gate_2` → selecting,
  `pending_gate_3` → complete unpublished.
- Iteration (monthly default / weekly opt-in) is a recurring job in this same
  state machine, not a second system; hitting the usage cap pauses the
  schedule with a notification, never a silent coverage drop.
- A monitoring plan belongs to exactly one market (country + language); a
  market change re-baselines, never mixes.

### Docs

- `docs/verification-report.md` — spec acceptance verification with evidence
  (13 v2 criteria + pointers to the v1 report in git history).
- `docs/plan/`, `docs/spec/` — product plan and v1 spec.

## Local verification steps (evidence)

1. `pnpm lint`, `pnpm typecheck`, `pnpm generate:check` — all exit 0.
2. `pnpm test` — 671 tests passing (core-schema 128, intent-engine 130,
   data-providers 56, api 56, shopify-connector 52, metrics 40,
   intent-lib-export 32, url-extractor 29, importer 16, client 23, web 109;
   web DB suites skip locally, run in CI against Postgres 16).
3. Full breakdown of spec criterion → test file is in
   `docs/verification-report.md`; CI on `main` green across all merged PRs.
