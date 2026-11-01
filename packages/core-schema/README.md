# @intentvisible/core-schema

Intent Schema v1 — the versioned data contract every other BIL package builds
against. Owns the JSON Schema files, the generated TypeScript contract types,
and the runtime (Zod) schemas for:

- `IntentRecord` — one buyer intent, brand- or product-scoped
- `BrandProfile` / `ProductProfile` — URL-extracted evidence-backed profiles
- `SkuIntentMapping` — SKU ↔ intent links with match strength

Pipeline v2 (additive): the Marketing Graph / Prompt Engine / Monitoring Loop
record contracts and the canonical v2 taxonomies — see
["Pipeline v2"](#pipeline-v2-marketing-graph--prompt-engine--monitoring-loop)
below. v1 remains the shipped surface; v2 is the foundation later packages
import.

## The standalone-mode invariant

This package is generated and consumed in **standalone mode**: the pipeline has
no measurement capability. Every generated record carries
`measurement_status: "not_measured"` with `visibility_pct`,
`monthly_search_volume`, and `measurement_source` set to `null`. The pairing is
enforced at three levels:

1. **JSON Schema** (`schemas/*.schema.json`) — a conditional rejects
   `measurement_status: "not_measured"` alongside any non-null measurement
   field.
2. **Zod runtime schemas** (`src/intent-record.ts`) — `superRefinement` applies
   the same rule plus the reverse direction (a measured record without
   `measurement_source` is invalid).
3. **TypeScript** — `IntentRecord` carries optional-but-nullable measurement
   fields typed to permit `null`; a `BrandProfile`'s evidence-backed
   `SnapshotRef` keeps every claim traceable to a stored page snapshot.

SemVer discipline: `schema_version` is a SemVer string. Minor/patch versions of
the same major are backward compatible; a major bump requires a dedicated
schema PR (spec §10, principle 3). `isSchemaVersionCompatible` accepts records
within the same major.

## Pipeline v2 (Marketing Graph / Prompt Engine / Monitoring Loop)

Additive v2 contracts for the three-stage pipeline (blueprint: *IntentVisible
Pipeline v2*). Nothing v1 changes; v1 enums become mapped legacy values.

**Records** — Persona, Scenario, PromptRecord, MonitoringRun, MetricsSnapshot,
MarketingGraph (schemas + Zod + generated types, same pattern as v1).

**Data-mode provenance (the v2 analogue of the standalone invariant).** Every
generated or monitored record carries a required `data_mode`
(`llm_estimated` | `llm_simulated` | `provider_measured`) plus `provenance:
{ source, retrieved_at }`. Three rules are enforced at schema level:

- estimates never masquerade as answers: `MonitoringRun`/`MetricsSnapshot`
  reject `data_mode: "llm_estimated"` — estimates describe demand tiers, not
  run answers;
- LLM-estimated demand tiers never carry a numeric `monthly_volume` — a volume
  number requires `provider_measured`;
- `MeasurementStatusV2` extends v1 with `"simulated"` (and `"imported"`), so a
  simulated-mode lib publish flips records to `simulated`, never `measured`.

**Evidence integrity.** Persona traits and prompt-embedded facts must cite
`evidence_urls` or carry `assumption_evidence` — a claim with neither is a
typed rejection, not a silent field. The MarketingGraph additionally enforces
referential integrity (scenario edges point at existing personas), id
uniqueness per collection, no self-competitor, and mandatory `mismatch_reason`
for fit scores below 0.5.

**Taxonomy migration.** `src/enums-v2.ts` publishes `BUYER_STAGES_V2`
(6 stages) and `INTENT_CATEGORIES_V2` (10 categories, per Export Spec v2) as
canonical, plus `DataMode` and `MeasurementStatusV2`; `src/legacy-mapping.ts`
adds exhaustive `Record<v1, v2>` alias tables (`BUYER_STAGE_V1_TO_V2`,
`INTENT_CATEGORY_V1_TO_V2`) and `mapBuyerStageToV2` / `mapIntentCategoryToV2`.
Imported v1 records map at read time — stored data is never rewritten. The
v2-only values (Problem Discovery, Expansion, ROI, Future Trends) are
unreachable from v1 data.

## Layout

- `schemas/` — the published JSON Schema (draft 2020-12) files; source of truth
- `src/generated/` — TypeScript types compiled from `schemas/` by
  `scripts/generate-types.mjs` — **never edit by hand**
- `src/*.ts` — Zod runtime schemas (hand-written, kept in lockstep with the
  JSON Schemas by contract tests)
- `src/fixtures.ts` — shared test fixtures, including the spec §4.1 example
- `src/fixtures-v2.ts` — shared v2 placeholder fixtures (estimates/simulations
  only; provenance names the simulated origin, never a real provider)
- `tests/` — invariant, enum-boundary, and Ajv/Zod parity contract tests

## Commands

```sh
corepack pnpm --filter @intentvisible/core-schema generate   # regenerate src/generated
corepack pnpm --filter @intentvisible/core-schema typecheck
corepack pnpm --filter @intentvisible/core-schema test
```

CI runs the generator with `--check` semantics as a dedicated `generate:check`
step: if committed generated types drift from `schemas/`, the build fails with
the regeneration command.

## Changing the schema

Schemas change only in dedicated PRs. Update `schemas/*.schema.json` **and**
the matching Zod schema together, run `generate`, and extend
`tests/contract.test.ts` (Ajv/Zod parity) plus `tests/invariant.test.ts` with
cases for the new rule. If a shared `$defs` entry (e.g. `SnapshotRef`) appears
in more than one schema file, keep the copies byte-identical — a drift test
enforces this.
