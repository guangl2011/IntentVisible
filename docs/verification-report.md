# Spec Acceptance Verification Report — Pipeline v2

Spec: [IntentVisible Pipeline v2 — Marketing Graph, Prompt Engine & Monitoring Loop](https://app.obvious.ai/p/prj_eJ1YNja9?blueprint=art_9zAvKcEq), §Verification (13 criteria).
Verified against `main` at `901b494` (PR #39 merged), on branch `feat/verify-v2-and-docs` at the same tree. Local runs used Node 20 + pnpm 12.16.1.

The v1 core-engine report (criteria for the Buyer Intent Lib spec, art_KGYzMB5Z) is preserved in git history — see `docs/verification-report.md` before PR #40; all 197 v1 tests remain in the tree and green.

## Local verification commands

```
pnpm install
pnpm generate:check          # generated TS types in parity with JSON Schemas
pnpm lint                    # eslint .
pnpm --filter @intentvisible/web generate   # prisma client (needed before web tests)
pnpm typecheck               # tsc --noEmit per workspace
pnpm test                    # vitest run per workspace
```

Results on the verified commit (all fixture-based — no live LLM, crawl, or network calls):

| Workspace | Files | Tests |
|---|---|---|
| packages/core-schema | 9 passed | 128 passed |
| packages/data-providers | 5 passed | 56 passed |
| packages/metrics | 3 passed | 40 passed |
| packages/intent-lib-export | 4 passed | 32 passed |
| packages/intent-engine | 12 passed | 130 passed |
| packages/url-extractor | 5 passed | 29 passed |
| packages/intent-importer | 1 passed | 16 passed |
| packages/shopify-connector | 5 passed | 52 passed |
| packages/client | 2 passed | 23 passed |
| apps/api | 7 passed | 56 passed |
| apps/web | 9 passed, 6 skipped (DB-backed suites skip without `DATABASE_URL`; CI runs them against Postgres 16) | 109 passed, 33 skipped |

Total: **671 passed**, 33 skipped (DB-backed, run in CI). `pnpm lint`, `pnpm typecheck`, and `pnpm generate:check` all exit 0.

## Merged PRs shipping Pipeline v2

| PR | Area |
|---|---|
| #30 | core-schema: v2 schemas, v2 taxonomy, legacy alias mapping |
| #31 | data-providers: reserved provider interfaces with LLM defaults |
| #32 | metrics: pure-function metric calculators |
| #33 | intent-lib-export: deterministic Export Spec v2 renderer |
| #36 | intent-engine: Stage A — crawl-to-graph orchestration, typed failures |
| #37 | intent-engine: Stage B — deterministic selection, prompt expansion, monitoring plan |
| #38 | api: pipeline orchestration — gates, scheduler, monitoring, publish |
| #39 | web: onboarding, gate reviews, metrics dashboard, lib browser |

## Criterion → passing checks

### 1. Install triggers a domain-bounded, capped, robots-aware crawl

`packages/intent-engine/tests/stage-a/stage-a.test.ts` — "enforces the 50-page default cap and never fetches the 51st page"; "raises the cap to 100 for weekly-iteration projects"; "maps a robots-blocked seed to crawl_robots_blocked"; "maps an off-domain seed redirect to domain_violation". The robots-aware fetcher and content-hashed snapshot storage are covered by `packages/url-extractor/tests/fetcher.test.ts` and `snapshot.test.ts` (v1 foundation, unchanged). Install-trigger and site-URL fallback wiring is exercised in `apps/api/src/orchestration/pipeline.test.ts` (`trigger: "site_url"` start, `installed` → `crawling` transitions) and `apps/api/src/shopify/routes.test.ts` ("install returns an authorization URL; callback exchanges and connects"; "install rejects non-myshopify domains with a typed 400").

### 2. Marketing Graph is fully traceable; thin crawls fail loudly

`packages/intent-engine/tests/stage-a/stage-a.test.ts` — "produces a schema-valid graph with evidence URLs populated"; "fails loudly when the graph cannot cite enough pages (low-evidence floor)"; "fails with modeling_empty when every persona drops". Assumption-flag handling (unrestatable claims dropped, assumption-carrying prompts rejected) is covered in `packages/intent-engine/tests/validate.test.ts` and stage-b "drops prompts that restate no claim or only assumption-flagged claims".

### 3. Demand estimation is deterministic per (keyword, country, language, quarter) and cached

`packages/data-providers/tests/cache-key.test.ts` — cache key "is identical for identical inputs", "ignores keyword order, case, and surrounding whitespace", "changes when the quarter changes (new quarter re-estimates)", "changes when the market changes", "changes when the keyword set changes". Fixed-temperature contract constants are asserted in `packages/data-providers/src/index.test.ts` ("carries the fixed-temperature and run-count contracts as constants"); deterministic Stage A replay — "is deterministic: identical fixture inputs produce an identical graph" — is in `packages/intent-engine/tests/stage-a/stage-a.test.ts`.

### 4. Intent selection is deterministic and batch-size correct; no near-duplicate prompts

`packages/intent-engine/tests/stage-b/stage-b.test.ts` — "yields the identical selection when the same graph is selected twice"; "cuts the batch to the requested size and rejects out-of-range sizes"; "admits only intents that clear the Monitor Skill bar: high demand or open gap"; "rejects envelopes outside the 5–7 bound as retryable output errors"; "collapses exact and near-duplicate prompts onto the first-seen canonical"; "keeps identical texts apart across markets, brands, and languages". Market-scoped semantic dedup with stable `intent_id`s and version bumps: `packages/intent-engine/tests/dedup.test.ts` and `golden-corpus-dedup.test.ts`.

### 5. Metrics match the Skill formulas exactly, with provenance including data_mode

`packages/metrics/src/formulas.test.ts` — visibilityPct ("computes the Monitor Skill §4 ratio"), voidRatePct ("tags exactly-25% void as an opportunity (inclusive ≥)"), leaderGap ("computes top-1 competitor visibility minus brand visibility"), citationShares, sentimentIndex ("maps the weighted mean polarity onto 0–100") — all against hand-computed fixtures. `packages/metrics/src/compute.test.ts` — "stamps the full provenance block on every snapshot"; grouped and pooled scenarios computed "per the hand ledger".

### 6. Baseline consensus flags noisy prompts; mixed-mode metrics are rejected

`packages/metrics/src/formulas.test.ts` consensusFlag — "is stable when all rounds agree within ±10 points"; "is noisy when any round diverges beyond the tolerance"; "uses the documented ±10-point tolerance"; "refuses to call consensus with fewer than 2 rounds". `packages/metrics/src/compute.test.ts` — "rejects a baseline mixing data modes (typed error)"; "requires at least two baseline rounds per prompt × platform". Plan-level enforcement: `apps/api/src/orchestration/pipeline.test.ts` — "rejects a mixed-mode monitoring plan with the typed error"; "a measured-mode project without registered runners is rejected at creation".

### 7. Export v2 conformance: floor, split, grouping, sort, header, YAML round-trip

`packages/intent-lib-export/src/thresholds.test.ts` — ≥30% floor and Revenue (≥50%) / Market (30–49%) split. `golden.test.ts` — golden files for the Data Mode header, single metadata block with provenance, Revenue/Market sections, grouping and sort, self-contained YAML records with the Prompt field. `roundtrip.test.ts` — re-parse of the YAML export reconstructs the same records. `validate.test.ts` — export-level validation (a metric without its provenance block fails).

### 8. Lib publish flips intent records with provenance and a version bump

`apps/api/src/orchestration/pipeline.test.ts` — "publish flips records to simulated with full provenance; drift bumps the version with fresh measurement"; "bumpPublishedRecord raises the version and rewrites the measurement provenance". `packages/core-schema/src/taxonomy-v2.test.ts` — "maps each run-side data mode to the status it earns at lib publish" (`llm_simulated` → `simulated`, never `measured`).

### 9. Optional gates auto-proceed on timeout; disabled gates never create tasks

`apps/api/src/orchestration/pipeline.test.ts` — "gates off: runs the full state machine to complete and creates zero gate reviews"; "enabled gate: opens one review with a 72h timeout; silence records auto_approved and completes". The transition table (`apps/api/src/orchestration/types.ts`) encodes that gate statuses are skipped entirely when the gate is off, and `pending_gate_*` re-entry targets encode rejection → stage re-run.

### 10. Onboarding defaults hold: USA/English preselected and editable; market change re-baselines

`apps/web/tests/pipeline-pages.test.ts` — "creates the project with the USA/English, llm, monthly defaults". `apps/api/src/orchestration/pipeline.test.ts` — "a market change re-baselines into a separate market-scoped baseline without touching the old one" (a monitoring plan belongs to exactly one market, never mixing).

### 11. Provider interfaces are swappable — fixture providers pass the same conformance suites

`packages/data-providers/tests/conformance.test.ts` runs the shared conformance suites (`keywordProviderConformance`, `monitoringRunnerConformance`) against the LLM defaults **and** fixture stand-ins for future advanced providers — the same suite, so no caller can distinguish simulated from real by the interface. Interface-surface export assertions are in `packages/data-providers/src/index.test.ts`.

### 12. Iteration loop: cadence, drift version bumps, usage cap

`apps/api/src/orchestration/pipeline.test.ts` — "cadence: monthly default advances a calendar month, weekly opt-in advances 7 days"; "hitting the monthly cap pauses the schedule with a notification and resumes later" (pause + notify, never silent coverage degradation). Drift version bumps: "publish flips records to simulated with full provenance; drift bumps the version with fresh measurement".

### 13. Taxonomy migration is lossless: every v1 value maps to a v2 canonical

`packages/core-schema/src/taxonomy-v2.test.ts` — "maps every published v1 stage (a v1 value with no mapping fails CI)"; "follows the blueprint's migration table exactly"; "only produces canonical v2 stage values"; "never invents v2-only stages from v1 data"; the mirrored category-mapping suite ("maps every published v1 category…"); "extends the v1 statuses with imported + simulated and keeps every v1 value valid". Imported-fixture read-through parity: `packages/core-schema/tests/parity-v2.test.ts` and `fixture-parity-v2.test.ts`.

## Lightweight mode's declared limits

- **Simulated ≠ measured.** Every graph node, metric, and exported record carries `data_mode` (`llm_estimated` / `llm_simulated` / `provider_measured`) and a provenance block; a simulated lib is **a directional research artifact**, never a measurement of real platform visibility.
- **Demand estimates are tiers only.** LLM-estimated volume is never rendered as a copyable number anywhere a customer sees it — tiers with provenance only.
- **Platform-differentiation fidelity.** In lightweight mode one LLM model plays all four platform personas with pinned persona versions per baseline; cross-platform differentiation is approximated, not replicated, and the export states so.
- **Round-to-round variance is a finding, not a bug.** Prompts whose simulated answers diverge beyond ±10 points across baseline rounds are published as `noisy`, never silently smoothed.

## Not machine-checkable

First-cohort crawl-yield quality and the spot-check of simulated vs real platform behavior (blueprint §Risks reversal evidence) need real customers and the advanced tier; they are post-ship validation items, not CI checks.

## Visual evidence

This change set is documentation-only (no UI diff); visual evidence is not applicable. The UI acceptance criteria were evidenced on PR #39 against its tested head SHA.

---

# Plugin Phase I acceptance evidence

Verified against `main` at `bac6d22` (PR #47 merged), on branch `test/plugin-dashboard`. Local runs used Node 20 + pnpm 12.16.1 + PostgreSQL 17 (CI gates on 16; the suites are version-agnostic). Spec: `docs/plan/intentvisible-plugin-design-v1.4.md` §2, verification bars from the local testing plan's Test Dashboard Design.

## Merged PRs shipping plugin Phase I

| PR | Merge commit | Area |
|---|---|---|
| #44 | `32c466b` | plugin-schema: Phase I data model + deterministic demo seed |
| #45 | `1fa912b` | plugin-logic: performance billing + attribution engine + connector stubs |
| #46 | `716e3f4` | api: plugin Phase I endpoints — fixtures mode, `data_mode` guard, five-module reads |
| #47 | `bac6d22` | web: seven plugin surfaces, fixtures `data_mode`, typed client, demo-tenant binding |

## Test counts per layer (local run)

**Layer 1 — static checks:** `pnpm lint`, `pnpm typecheck`, `pnpm generate:check`, `pnpm build` — all exit 0.

**Layer 2 — full fixture suite (`pnpm test`, no DB, no keys):** **816 passed, 33 skipped** (the skips are exactly the DB-backed `apps/web` block, which Layer 3 runs). Per workspace:

| Workspace | Tests |
|---|---|
| packages/core-schema | 128 |
| packages/data-providers | 56 |
| packages/metrics | 40 |
| packages/intent-lib-export | 32 |
| packages/intent-engine | 130 |
| packages/url-extractor | 29 |
| packages/intent-importer | 16 |
| packages/shopify-connector | 52 |
| packages/plugin-schema | 21 |
| packages/plugin-logic | 62 |
| packages/client | 23 |
| apps/api | 80 |
| apps/web (without DB) | 147 passed, 33 skipped |

**Layer 3 — DB-backed web suite (`DATABASE_URL` + `prisma migrate deploy`):** **180 passed, 0 skipped** (17 files; the 33 DB-backed tests now run and pass).

**Layer 7 — Playwright e2e (`pnpm --filter @intentvisible/web e2e`):** **15 passed**, including the 8-test plugin-flow spec (`apps/web/e2e/plugin-flow.spec.ts`) added by this branch. Playwright boots both servers itself: the Next dev server (as before) plus the API fixture server (`dev:fixtures`, in-memory SQLite — no Postgres, no keys) as a second `webServer`, readiness-probed on the seeded overview endpoint.

## Seed rules → passing checks (scope ①)

The deterministic demo seed drives every dashboard panel correctly on merged `main`; no drift was found, so no fixture patch was needed. Every number below is asserted *exactly* in the new e2e spec, so seed drift now fails CI instead of surfacing in front of a merchant:

| Test-plan seed rule | Evidence |
|---|---|
| One unit left not_measured; one unit single-day-snapshot labeled | `packages/plugin-schema/tests/seed.test.ts` — "leaves exactly one unit not_measured"; "labels exactly one unit as a single-day snapshot"; e2e "buyer intents" renders `12.8% · chatgpt.com · 2026-11-22 → 2026-11-22 · single-day snapshot` and the explicit `not measured` badge for `intent_solar_sizing` |
| S2000-shaped intent units with persona × stage × pain point | `seed.test.ts` — "uses S2000-shaped intent units…"; "is deterministic — two builds are deep-equal"; e2e asserts three unit names render |
| AI-referral sessions from chatgpt.com / gemini / perplexity | `seed.test.ts` — "covers all three AI-referral sources and carries a refund-offset ledger row"; e2e overview asserts "5 AI-referral sessions in the last 7 days" |
| Refunded order with the exact refund offset | e2e "commission" asserts totals `$146.72` gross / `−$49.90` refund offsets / `$96.82` net and the `#1002` row netting to `$0.00` with status `refunded`; `apps/api/src/plugin/routes.test.ts` — "reconciles gross → refund offsets → net per order" |
| Visibility provenance (engine set + measurement window) | `routes.test.ts` — "carries visibility provenance: engine set and measurement window"; e2e asserts the full provenance string `41.2% · chatgpt.com, perplexity · 2026-11-16 → 2026-11-22 · rolling` |

## Red lines → passing checks (scope ②)

| Red line (test plan) | Evidence |
|---|---|
| No invented search volumes anywhere | `plugin-logic/tests/attribution.test.ts` — "keeps not_measured demand not_measured — no invented volumes"; "refuses a not_measured estimate that smuggles a demand value"; e2e asserts the funnel renders "Demand is held tier-only (no invented search volumes)" and a negative scan for "search volume" on Buyer Intents |
| Single-day snapshot never presented as steady state | e2e asserts the `single-day snapshot` suffix on the snapshot badge; `routes.test.ts` — "labels the single-day snapshot as its own state" |
| Settlement withheld for simulated data | `routes.test.ts` — "withholds settlement over llm_simulated data"; e2e asserts the "Settlement — withheld" panel with its reason |
| Estimated / heuristic labeling | e2e asserts the `estimated` badge on demand tiers and "every score on this table is estimated" on Opportunity Scores, the withheld state for the not-measured unit's score, and the heuristic label on both the Intent Health Score and Intent Audit readiness |
| Measured vs simulated separation | `routes.test.ts` data_mode contract block (serving-mode check, typed `data_mode_mismatch`, mixed-mode rejection, unknown-mode rejection); e2e asserts the simulated Data Mode header on Overview |
| Not-measured never fabricates a value | `routes.test.ts` — "serves not_measured as its own state — never a fabricated value"; e2e asserts the explicit badge |
| Free install + performance-only pricing | `packages/plugin-logic/tests/billing.test.ts` (commission calculator: free install, tier bands, refund offsets; Track B stub rejected); Commission page renders per-order billing fields only |
| Private data never routes through treg.to | `packages/plugin-logic/tests/connectors.test.ts` (treg.to stub is public-intel only, developer key, pay-per-call); e2e Integrations asserts "no private data of yours ever routes through treg.to" and the Phase II stub state |

## Dashboard acceptance checklist (Test Dashboard Design)

| Acceptance point | Status |
|---|---|
| Passcode login gates the plugin pages | ✅ verified — exercised by every e2e test (`/login` → `/queue`) |
| All plugin pages render 200 with seeded data (Overview, Buyer Intents, Attribution, Intent Audit, Intent Match, Commission, Integrations) | ✅ verified — all seven surfaces navigated and asserted against the deterministic seed |
| Every number shows provenance or an estimated/heuristic label | ✅ verified — per the red-line table above |
| Clean browser with no localStorage binding auto-selects the demo project | ✅ verified — each e2e test runs in a fresh context (no stored binding) and still reaches `shop_solix_demo`; unit-backed by `apps/web/tests/plugin-pages.test.ts` "defaults to the demo tenant when nothing is stored" |
| Passcode login works **through the hosted proxy** (`https://1ebcqaukxp-3000.hosted.obvious.ai`) | ⚠️ unverified this run — verified locally (the login flow the e2e exercises is the same one the proxy fronts); the hosted deployment itself was not re-tested |
| Demand Gap Market Expansion bucket renders from seed data | ⚠️ partially verified — the bucket thresholds are unit-tested ("buckets 30–49% as market_expansion (edges inclusive)") and the rendered bucket vocabulary includes Market Expansion, but no seed row currently falls in the 30–49% band, so the row-level badge is not exercised by the demo seed |

