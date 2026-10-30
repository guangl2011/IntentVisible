# Spec Acceptance Verification Report — Core Intent Engine

Spec: [Buyer Intent Lib — Core Intent Engine](https://app.obvious.ai/p/prj_eJ1YNja9?blueprint=art_KGYzMB5Z), §Verification.
Verified against `main` at `0ab99a5` (PR #17 merged). All local runs used Node 20 + pnpm 12.16.1.

## Local verification commands

```
pnpm install
pnpm generate:check          # generated TS types in parity with JSON Schemas
pnpm lint                    # eslint .
pnpm --filter @intentvisible/web generate   # prisma client (needed before typecheck/test)
pnpm typecheck               # tsc --noEmit per workspace
pnpm test                    # vitest run per workspace
```

Results on the verified commit:

| Workspace | Suites | Tests |
|---|---|---|
| packages/client | 1 passed | 15 passed |
| packages/core-schema | 4 passed | 47 passed |
| packages/intent-importer | 1 passed | 16 passed |
| packages/url-extractor | 5 passed | 29 passed |
| packages/intent-engine | 9 passed | 85 passed |
| apps/api | 1 passed | 12 passed |
| apps/web | 5 passed, 6 skipped (DB-backed suites skip without `DATABASE_URL`; CI runs them against Postgres 16) | 40 passed, 33 skipped |

`pnpm lint`, `pnpm typecheck`, and `pnpm generate:check` all exit 0.

## Criterion → passing check

### 1. Solix golden dataset imports losslessly into Intent Schema v1

Verified by `packages/intent-importer/tests/importer.test.ts`:
- "imports every fixture row, merging paraphrase rows of the same intent"
- "validates every imported record against the published core-schema JSON Schema" (Ajv) and "keeps Zod in agreement with Ajv on the same records"
- "carries the eleven inherited fields through to every record" (plan §2.1 list)
- "preserves legacy measured values under measurement_status 'imported'" / "maps measurement-derived fields to standalone nulls when the row has no value"
- "reports dropped and unmappable columns with reasons" — no field is silently dropped.

Note (open item from the spec): the importer tests run on the plan-derived fixture; the real Solix export is still pending upload. The importer accepts a real export's headers via `columnAliases` config (tested).

### 2. Standalone-mode invariant holds

Verified by `packages/core-schema/tests/invariant.test.ts` (Zod superRefinement):
- rejects `visibility_pct`, `monthly_search_volume`, and non-null `measurement_source` on a `not_measured` record; rejects `0` ("0 is a measurement, not a null")
- "has no construction path that produces a not_measured record with measured values"
- accepts `imported`/`measured` records carrying measured values.

Generator-side enforcement: `packages/intent-engine/tests/validate.test.ts` — any candidate with a measured value is dropped with reason `fabricated_measurement` before storage ("drops a candidate with a non-null visibility_pct…", "…monthly_search_volume…", "…that claims a measurement status").

### 3. Evidence traceability

`packages/intent-engine/tests/validate.test.ts` ("validateCandidate — evidence"):
- drops candidates with no `evidence_urls` and candidates citing a URL outside the fetched-snapshot registry; "validates against the exact snapshot registry supplied in the run"
- "validateCandidate — SKU claims": drops SKU references the profile does not evidence, and brand-scope candidates referencing SKUs at all.

### 4. Semantic dedup to stable IDs

`packages/intent-engine/tests/dedup.test.ts`:
- paraphrase pairs collapse onto one `intent_id` with a version bump; distinct topics get distinct ids; rewording reuses the existing library id with a version bump; markets never merge; brand/product scopes never merge.
- `packages/intent-engine/tests/golden-corpus-dedup.test.ts` runs the same logic against the golden corpus.

### 5. URL extractor handles real page structures

`packages/url-extractor/tests/extract.test.ts` covers all three spec'd fixture shapes:
- JSON-LD product page: "produces schema-valid brand, product, and landing profiles with evidence"; "extracts every landing-page field from the page it cites"
- meta-tags-only page: "builds landing + brand evidence from meta tags and no product record"
- robots-restricted domain: "fails with fetch_robots_disallowed when the seed is disallowed, fetching nothing" (asserts only `/robots.txt` was requested — never guesses past a denial); plus `fetch_unreachable` and `extraction_empty` (snapshot kept for diagnosis).

### 6. API job lifecycle

`apps/api/src/app.test.ts` (12 tests):
- happy path "returns { job_id } immediately and runs queued → complete"; typed failures for robots-disallowed, unreachable, empty extraction, unparseable LLM output, unavailable LLM; intent reads "serve brand intents with null measurement fields and apply filters", 404 typed reasons, and partial visibility while a job is in flight.

### 7. Code quality gates / CI green on all merged PRs

CI (`ci.yml`) runs six jobs — generate:check, lint, typecheck, test, security (pnpm audit), build, plus a DB job replaying Prisma migrations on Postgres 16. `gh run list --branch main` at verification time: `success` on every completed run on `main`; the merged PRs #4, #5, #7, #8, #13, #14, #16, #17 all required green CI to merge. The one `cancelled` run is the concurrency group superseding a superseded push, not a failure.

## Not machine-checkable (per spec §Verification)

Pilot metrics (≥80% human-review usability, ≥90% SKU coverage, 3–5 merchants) are explicitly out of scope for this package — they need real merchants and human panels and come after this package ships.

## Backend-only exception

This is a backend-only change set (no UI); visual evidence is not applicable.
