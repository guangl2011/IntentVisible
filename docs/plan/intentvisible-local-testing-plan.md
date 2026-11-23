# IntentVisible — Local Testing Plan（Pipeline v2 + 插件 Phase I）

**Target:** `guangl2011/IntentVisible` at `main`（PRs #30–41 merged; plugin Phase I per `docs/plan/intentvisible-plugin-design-v1.4.md`）
**Goal:** verify the delivered Pipeline v2 **and** the Shopify plugin Phase I surfaces on your own machine, from static checks to a live UI walkthrough.

The suite is designed so that everything except the optional live-LLM layer runs **without any API keys or network calls** — all tests use recorded fixtures. Only the optional live-LLM walkthrough spends tokens.

---

## 0. Prerequisites

| Requirement | Version / notes |
| --- | --- |
| Node | ≥ 20 (CI uses 22 — recommend 22) |
| pnpm | 12.16.1 (`corepack enable` or `npm i -g pnpm@12.16.1`) |
| PostgreSQL | 16 — **only** needed for Layer 3 and Layer 7; easiest via Docker |
| Gemini API key | only for the live LLM walkthrough. This is the key stored as `SECRET_LLM_API_KEY` |

```sh
git clone https://github.com/guangl2011/IntentVisible.git
cd IntentVisible
pnpm install
cp .env.example .env   # then fill values per layer below
```

> **Never** commit or log the API key. Tests never need it.

---

## Layer 1 — Static checks (~2 min)

```sh
pnpm --filter @intentvisible/web generate   # Prisma client — REQUIRED before typecheck/tests
pnpm lint
pnpm typecheck
pnpm generate:check                          # generated TS types match JSON Schemas
pnpm build
```

**Pass =** all four exit 0.

⚠️ Quirk: a local `next build` rewrites the tracked `apps/web/next-env.d.ts`. Restore with `git checkout -- apps/web/next-env.d.ts`.

## Layer 2 — Full fixture test suite (~5 min, no DB, no keys)

```sh
pnpm test
```

**Baseline at PR #41 = 671 tests passed, 33 skipped.** Plugin Phase I PRs add suites on top; the counts below describe the *plugin additions* (assert at least these exist after the plugin wave merges):

| Area | Plugin additions |
| --- | --- |
| plugin-schema (new) | intent-unit linkage, prompt visibility provenance (engine set + window), buyer stage / category / persona enums |
| pricing | commission calculator: free install, 5–20% tier bands, Track A order-attribution basis, refund offsets; Track B stub rejected until measured results exist |
| attribution | Intent Yield, Demand Gap (Revenue Expansion ≥50% / Market Expansion 30–49% buckets), Channel Quality, D→T→O funnel, Opportunity Score determinism + `estimated` labeling |
| plugin-connectors | Nango client stub (`nango.proxy()` pulls private GA4/Ads reports; authorized writes); treg.to client stub (public intel, developer key, pay-per-call); **assert private merchant data never routes through treg.to** |
| measurement invariants | no invented search volumes; single-day snapshot vs 30-day rolling labels retained and surfaced |
| shopify-connector | Web Pixel event ingest + HMAC webhook suites (existing 52 tests) extended for AI-referral session tagging |

**Pass =** all suites green, zero skips outside the DB-backed web block.

## Layer 3 — DB-backed web suites (needs Postgres)

```sh
docker run -d --name iv-pg -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16
# in .env:
# DATABASE_URL=postgres://postgres:dev@localhost:5432/intentvisible
pnpm --filter @intentvisible/web generate
pnpm --filter @intentvisible/web test
```

**Pass =** the DB-backed suites now run and pass; plugin page routes render from seeded data.

## Layer 4 — API servers (two modes)

```sh
# (a) Fixture mode — deterministic demo data, NO key, NO network
pnpm --filter @intentvisible/api dev:fixtures

# (b) Pipeline mode — real orchestration
pnpm --filter @intentvisible/api dev:pipeline
```

Plugin Phase I additions to check with curl:
- Plugin endpoints (overview summary, buyer intents list, attribution report, commission ledger, affiliate visits) return seeded fixture data with `data_mode` headers.
- Commission records reconcile: gross → refund offsets → net commission per order.

## Layer 5 — Web UI manual walkthrough (API + web running)

```sh
pnpm --filter @intentvisible/api dev:fixtures   # terminal 1
pnpm --filter @intentvisible/web dev            # terminal 2
```

Walk the plugin Phase I surfaces (per design doc §2) and check each acceptance point:

1. **Overview** — Today's Alert renders at least one alert with a typed reason; Agentic Store Summary shows a generated summary with provenance footer; Intent Health Score shows a heuristic label + component breakdown (never a CVR/revenue promise).
2. **Buyer Intents** — intent units grouped by persona × stage × pain point; prompt cards show visibility with **engine set + measurement window** labels; not-measured prompts show explicit "not measured", never a volume.
3. **Attribution** — Intent Yield table, Demand Gap buckets (Revenue/Market Expansion), Channel Quality, D→T→O funnel; Opportunity Score always carries an "estimated" badge; standalone traffic/order analytics are not rebuilt here.
4. **Intent Audit** — readiness shown as a heuristic; recommendations reference specific intent units.
5. **Intent Match** — Intent Affiliate Visit rows (external affiliate traffic with UTM provenance), match queue, **Commission page** with per-order billing fields (order value, refund offset, rate tier, net payable).
6. **Integrations** — Shopify connected; Nango cards show Phase II stub state (no live OAuth); treg.to public-intel toggle is stubbed and labeled "developer key, pay-per-call".

Red lines to spot-check while you click: free install + performance-only pricing statements; measured vs simulated separation everywhere; no invented search volumes; single-day data never presented as steady state.

## Layer 6 (optional) — Live LLM end-to-end

Export `SECRET_LLM_API_KEY` and `LLM_MODEL`, run Layer 4 (b) against a real site you control. Expect: tier-only demand estimates, evidence URLs on every graph claim. Spends Gemini tokens; the monthly usage cap pauses and notifies rather than silently failing.

## Layer 7 (optional) — Playwright e2e

```sh
pnpm --filter @intentvisible/web e2e   # needs DATABASE_URL + both servers running
```

Plugin flows: login → Overview → Buyer Intents → Attribution → Commission, asserting provenance badges and empty states.

---

## Test Dashboard Design — Plugin Phase I

The hosted local dashboard (`https://1ebcqaukxp-3000.hosted.obvious.ai`, web on :3000 + API on :4000, passcode-gated) doubles as the **plugin verification instrument** before any real merchant install.

**Seed (deterministic, fixture mode):**
- Demo shop with buyer intents derived from the Solix library shape: intent units (S2000 vs Rivals, How Long Fridge, Camping Power Rec, …) → prompts with persona/stage/pain point; visibility values carry `source_engines` + `measurement_window` (one unit intentionally left not-measured; one unit intentionally single-day-snapshot labeled, to prove the UI surfaces the distinction).
- AI-referral sessions (sources: chatgpt.com, gemini, perplexity), orders with UTM + discount codes, commission ledger rows incl. one refunded order, affiliate visits.

**Panels (mirrors plugin §2 pages):**

| Panel | Verifies |
| --- | --- |
| Overview (Today's Alert / Agentic Store Summary / Intent Health Score) | alert states render with typed reasons; summary carries provenance; score is labeled heuristic |
| Buyer Intents | intent-unit grouping, visibility provenance labels, not-measured states |
| Attribution (Intent Yield / Demand Gap / Channel Quality / D→T→O / Opportunity Score) | bucket thresholds, estimated badges, deterministic recomputation |
| Intent Audit | readiness heuristic + recommendations referencing intent units |
| Intent Match (Affiliate Visit / match queue / Commission) | visit→order linking, per-order billing fields, refund offsets |
| Integrations | Shopify live status; Nango + treg.to stub cards with the data-type split labeled |

**Dashboard pass criteria:** passcode login works through the hosted proxy; all plugin pages return 200 with seeded data; every number shows provenance or an estimated/heuristic label; a clean browser with no localStorage binding still auto-selects the demo project.

---

## What "pass" means — the 13 spec criteria

All 13 blueprint criteria are mapped to named passing suites in `docs/verification-report.md`. The ones most worth confirming by hand on your machine:

| # | Criterion | Where to see it |
| --- | --- | --- |
| 1 | Crawl is domain-bounded, capped (50/100), robots-aware | Layer 4: watch the fetch log stop at the cap |
| 2 | Graph claims cite evidence; thin crawls fail loudly | Layer 6: sparse site ⇒ typed failure, not a fake graph |
| 3/4 | Demand estimates deterministic + cached; selection deterministic | Layer 4: run twice, compare outputs |
| 6 | Mixed data modes rejected | API: submit a mixed-mode monitoring plan ⇒ typed error |
| 7 | Simulated lib carries Data Mode header | Layer 5 |
| 9 | Gate timeout auto-approves; gates-off creates no tasks | API integration tests |
| 10 | Market change re-baselines (never mixes markets) | Layer 5.1 + API tests |
| 12 | Monthly cap pauses + notifies | Layer 6 with a low configured cap |

Full per-criterion evidence: `docs/verification-report.md` in the repo.

## Troubleshooting

- **Web tests fail to compile** → you skipped `pnpm --filter @intentvisible/web generate`.
- **Everything in apps/web skips** → no `DATABASE_URL`; that's Layer 3.
- **`next-env.d.ts` shows as modified** → expected after `next build`; checkout to restore.
- **API port conflicts** → `PORT` env var; point the web app at it with `NEXT_PUBLIC_API_BASE_URL`.
