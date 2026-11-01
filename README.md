# IntentVisible — Buyer Intent Library (BIL)

Branch protection on `main` requires pull requests with the `secrets` and `dependencies` checks green.

Buyer Intent Lib turns a brand's public website and product-page content into a
versioned, machine-callable library of buyer intents — category questions,
comparison moments, scenario needs, risk objections — with every record traced
to page evidence. No user-behavior tracking, no pixels, no personal profiles.

**Status:** core intent engine (first build package) — spec approved, implementation starting.

## Documents

| Document | Path | Notes |
|---|---|---|
| Product plan (v1.0, 2026-10-30) | [`docs/plan/buyer-intent-lib-product-plan.md`](docs/plan/buyer-intent-lib-product-plan.md) | Source plan (in Chinese): scope, milestones M1–M5, API design, working principles |
| Core Intent Engine spec | [`docs/spec/core-intent-engine-spec.html`](docs/spec/core-intent-engine-spec.html) | Approved Blueprint for the first build package: Intent Schema v1, Solix golden dataset + importer, URL-to-profile extractor, evidence-first LLM intent generator, minimal async API |

## Non-negotiables (from the spec)

- Standalone generation mode only: generated records carry
  `measurement_status: "not_measured"` with `visibility_pct` and
  `monthly_search_volume` as `null` — enforced at schema level.
- Every generated intent cites evidence URLs resolvable to stored page snapshots.
- Schema files change only in dedicated PRs.

## Secret scanning (pre-commit)

Commits are scanned for hardcoded secrets — API keys, tokens, private keys —
by [gitleaks](https://github.com/gitleaks/gitleaks), wired through
[pre-commit](https://pre-commit.com) via `.pre-commit-config.yaml`. The hook
runs in git guard mode: it scans only staged changes and fails the commit,
naming the offending file, line, and rule.

One-time setup:

1. Install the gitleaks binary (v8 or newer) and put it on your `PATH`:
   `brew install gitleaks` — or download a release asset from
   <https://github.com/gitleaks/gitleaks/releases>.
2. Install the hook into this clone:

   ```sh
   pre-commit install
   ```

After that, every `git commit` runs the scanner automatically. To scan the
whole working tree on demand: `gitleaks detect --no-git`. If a commit is
rejected, replace the secret with a placeholder or load it from the
environment — never bypass the hook with `--no-verify`.

## Repository

TypeScript ESM monorepo (pnpm): `packages/core-schema`, `packages/url-extractor`,
`packages/intent-engine`, `packages/intent-importer`, `apps/api`.
Stack and verification criteria: see the spec document.
