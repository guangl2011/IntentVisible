# IntentVisible — Agent Onboarding Notes

Buyer Intent Library (BIL) core intent engine: extracts buyer-intent records
from public brand/product pages into a versioned, machine-callable library.
See `docs/verification-report.md` for how each spec criterion is verified.

## Stack and runtime matrix

- TypeScript ESM, pnpm monorepo (pnpm 12.x, Node >= 20; CI uses Node 22)
- Packages: `packages/*` + `apps/*`; all tests via Vitest
- Schema contract: Draft 2020-12 JSON Schemas + generated TS types (`scripts/generate-types.mjs`, checked by `pnpm generate:check`) + Zod runtime validation
- LLM: provider-agnostic adapter (`packages/intent-engine`); live provider is Google Gemini via OpenAI-compatible endpoint. Fixture-based tests never call the network.
- DB (apps/web only): Prisma against PostgreSQL (CI provisions Postgres 16); DB-backed test suites skip without `DATABASE_URL`
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

- `packages/core-schema` — Intent Schema v1: JSON Schemas, generated TS types,
  Zod validation, the standalone-mode measurement invariant
  (`measurement_status: "not_measured"` ⇒ `visibility_pct`/`monthly_search_volume`
  must be null; enforced by Zod superRefinement and re-checked by the engine).
- `packages/url-extractor` — robots-aware fetcher, snapshot storage with
  `content_hash`, JSON-LD / meta-tag / HTML profile extraction with per-field
  evidence URLs.
- `packages/intent-engine` — evidence-first LLM intent generation (brand- and
  product-level), validation + drop log, market-scoped semantic dedup to stable
  `intent_id`s with version bumps.
- `packages/intent-importer` — Solix golden dataset (CSV/JSON) importer into
  Intent Schema v1; maps measurement-derived fields to standalone nulls.
- `packages/client` — typed client for the API.
- `apps/api` — Fastify REST API: `POST /v1/brands/analyze`,
  `POST /v1/products/analyze`, filtered intent reads, `GET /v1/jobs/{id}`
  (queued → fetching → extracting → generating → validating → complete|failed,
  typed failure reasons).
- `apps/web` — Next.js app: human decision / agent outcome APIs, Prisma schema
  and migrations (later package; consumes the same schema).
- `docs/verification-report.md` — spec acceptance verification with evidence.

## Local verification steps (evidence)

1. `pnpm lint`, `pnpm typecheck`, `pnpm generate:check` — all exit 0 on current
   `main` (`0ab99a5`).
2. `pnpm test` — 197 tests passing (core-schema 47, engine 85, url-extractor 29,
   importer 16, client 15, api 12; web DB suites skip locally, run in CI).
3. Full breakdown of spec criterion → test file is in
   `docs/verification-report.md`; CI on `main` green across all merged PRs.
