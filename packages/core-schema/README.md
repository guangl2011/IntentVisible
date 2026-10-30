# @intentvisible/core-schema

Intent Schema v1 — the versioned data contract every other BIL package builds
against. Owns the JSON Schema files, the generated TypeScript contract types,
and the runtime (Zod) schemas for:

- `IntentRecord` — one buyer intent, brand- or product-scoped
- `BrandProfile` / `ProductProfile` — URL-extracted evidence-backed profiles
- `SkuIntentMapping` — SKU ↔ intent links with match strength

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

## Layout

- `schemas/` — the published JSON Schema (draft 2020-12) files; source of truth
- `src/generated/` — TypeScript types compiled from `schemas/` by
  `scripts/generate-types.mjs` — **never edit by hand**
- `src/*.ts` — Zod runtime schemas (hand-written, kept in lockstep with the
  JSON Schemas by contract tests)
- `src/fixtures.ts` — shared test fixtures, including the spec §4.1 example
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
