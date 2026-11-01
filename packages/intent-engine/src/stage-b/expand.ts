/**
 * Stage B.2 — persona-voiced prompt expansion (blueprint "B.2 — Prompt
 * expansion"). Each selected intent expands to 5–7 prompts through one
 * LLM pass grounded in the graph: the intent record, the persona and
 * scenario each prompt speaks from, the competitor set, and the claim
 * corpus the prompts must anchor to.
 *
 * The voices are pre-assigned positionally (persona × scenario in graph
 * order, canonical scenario type order), so the assignment — not the
 * model — decides which voice writes which prompt; the pass parser holds
 * every prompt to that assignment. Validation drops, with typed events:
 *
 *   - prompts quoting a fact no graph claim supports (invented facts:
 *     a price point, an ingredient, a spec) — `invented_claim`
 *   - prompts restating no claim, or only assumption-flagged claims (a
 *     monitorable prompt must cite at least one evidence URL — the
 *     PromptRecord contract requires a non-empty evidence_urls) —
 *     `unevidenced_prompt`
 *
 * Near-duplicate prompts collapse through the v1 market-partitioned
 * lexical-semantic dedup: the earliest prompt survives as canonical, the
 * rest are recorded as variants (QA log only — variants are never stored).
 */

import { z } from "zod";

import {
  PromptRecordSchema,
  SCENARIO_TYPES,
  SCHEMA_VERSION_V2,
  type MarketingGraph,
  type PromptRecord,
} from "@intentvisible/core-schema";

import { slugify } from "../slug.js";
import { tokenOverlap } from "../dedup.js";
import { parseEnvelope } from "../stage-a/llm.js";
import { freshStableId } from "../stage-a/graph.js";
import { matchClaim, type GraphClaim } from "./claims.js";
import type { RankedIntent } from "./select.js";

export const MIN_PROMPTS_PER_INTENT = 5;
export const MAX_PROMPTS_PER_INTENT = 7;

/** Why one expanded prompt was dropped (QA log only — dropped prompts are never stored). */
export const STAGE_B_DROP_REASONS = ["invented_claim", "unevidenced_prompt"] as const;
export type StageBDropReason = (typeof STAGE_B_DROP_REASONS)[number];

export interface StageBDropEvent {
  /** Which prompt (or quote) was dropped, e.g. "int_x prompts[2]". */
  subject: string;
  reason: StageBDropReason;
  detail: string;
}

// ---------------------------------------------------------------------------
// Voice assignment: which persona × scenario each prompt speaks from
// ---------------------------------------------------------------------------

/** One pre-assigned prompt voice: a persona and one of its scenarios. */
export interface ExpansionVoice {
  persona: MarketingGraph["personas"][number];
  scenario: MarketingGraph["scenarios"][number];
}

/**
 * Flattens the graph's personas × scenarios into the deterministic voice
 * list: personas in graph order, each persona's scenarios in canonical
 * scenario-type order. Prompt #i speaks as voice #i (wrapping around when
 * the prompts outnumber the voices), so the assignment is pure.
 */
export function personaScenarioPairs(graph: MarketingGraph): ExpansionVoice[] {
  const pairs: ExpansionVoice[] = [];
  for (const persona of graph.personas) {
    for (const scenarioType of SCENARIO_TYPES) {
      const scenario = graph.scenarios.find(
        (candidate) => candidate.persona_id === persona.persona_id && candidate.scenario_type === scenarioType,
      );
      if (scenario !== undefined) {
        pairs.push({ persona, scenario });
      }
    }
  }
  return pairs;
}

// ---------------------------------------------------------------------------
// The expansion LLM pass
// ---------------------------------------------------------------------------

export function expansionSystemPrompt(): string {
  return [
    "You are a buyer-experience researcher writing the exact questions real buyers type into AI search assistants (ChatGPT, Perplexity, Google AI Overviews, Gemini) when researching a brand's category.",
    "",
    "Produce, as JSON (no prose, no markdown fences):",
    "{",
    '  "prompts": [',
    '    { "text": "the buyer\'s first-person question, 10-1000 characters", "claims": ["<a GRAPH CLAIM text quoted verbatim>"] }',
    "  ]",
    "}",
    "",
    "Field rules:",
    `- Write between ${MIN_PROMPTS_PER_INTENT} and ${MAX_PROMPTS_PER_INTENT} prompts, in order: prompt #1 speaks as voice #1, prompt #2 as voice #2, and so on (wrap back to voice #1 if you write more prompts than voices).`,
    '- First-person buyer voice ("I", "my"), one natural question per prompt. Never SEO keyword concatenation — "cheap camping fridge power station best price buy" is forbidden; write the way a person actually asks an assistant.',
    "- Weave the voice's explicit constraints (budget, channel, age, ingredient, and similar) into the prompt where the persona carries them.",
    "- Every prompt must restate at least one claim from the GRAPH CLAIMS list: copy that claim's text verbatim into \"claims\" (quote every claim the prompt encodes).",
    "- Never invent a product fact: no price point, ingredient, certification, or specification unless a GRAPH CLAIM states it. Prompts inventing facts are dropped by validation.",
    "- Write every prompt in the target market's language named below.",
  ].join("\n");
}

export interface ExpansionPromptInput {
  brandName: string;
  brandId: string;
  country: string;
  language: string;
  intent: RankedIntent;
  /** The topic's primary demand phrase (the graph stores it on the volume dimension). */
  primaryKeyword: string;
  competitorNames: Array<{ name: string; relation: string }>;
  voices: readonly ExpansionVoice[];
  corpus: readonly GraphClaim[];
}

export function buildExpansionUserPrompt(input: ExpansionPromptInput): string {
  const voices = input.voices.map((voice, index) => {
    const persona = voice.persona;
    const frustrations = persona.core_frustrations.map((trait) => `"${trait.text}"`).join("; ");
    return [
      `Voice #${index + 1} — persona ${persona.persona_id} ("${persona.archetype}"), scenario ${voice.scenario.scenario_id} (${voice.scenario.scenario_type}): "${voice.scenario.description.text}"`,
      `  AI-search language: "${persona.ai_language_fingerprint.text}"`,
      `  Demographics: "${persona.demographics.text}"`,
      frustrations.length > 0 ? `  Frustrations: ${frustrations}` : "",
    ]
      .filter((line) => line !== "")
      .join("\n");
  });

  const claims = input.corpus.map(
    (claim, index) => `${index + 1}. "${claim.text}" ${claim.assumption ? "[assumption]" : "[evidenced]"}`,
  );

  return [
    `Brand: ${input.brandName} (brand_id ${input.brandId}). Target market: country ${input.country}, language ${input.language}.`,
    "",
    `Selected intent: "${input.intent.intent_name}" (buyer stage: ${input.intent.buyer_stage}, category: ${input.intent.intent_category}).`,
    `Primary demand phrase: ${input.primaryKeyword}.`,
    input.competitorNames.length > 0
      ? `Competitors monitored for this intent: ${input.competitorNames.map((competitor) => `${competitor.name} (${competitor.relation})`).join(", ")}.`
      : "No competitors were resolved in the graph.",
    "",
    `VOICES — the ${input.voices.length} persona×scenario voices, in order:`,
    ...voices,
    "",
    "GRAPH CLAIMS (the only facts a prompt may encode — copy text verbatim into \"claims\"):",
    ...claims,
  ].join("\n");
}

/** One validated expanded prompt, pre-id: everything the PromptRecord needs. */
export interface ExpandedPromptDraft {
  text: string;
  /** The matched graph claims the prompt restates — never model-supplied URLs. */
  claims: GraphClaim[];
  persona_id: string;
  scenario_id: string;
  intent: RankedIntent;
  brand_id: string;
  country: string;
  language: string;
  competitor_ids: string[];
}

export interface ExpansionParse {
  drafts: ExpandedPromptDraft[];
  dropped: StageBDropEvent[];
}

export interface ExpansionContext {
  corpus: readonly GraphClaim[];
  voices: readonly ExpansionVoice[];
  intent: RankedIntent;
  brandId: string;
  country: string;
  language: string;
  competitorIds: readonly string[];
}

const RawPromptEntrySchema = z.strictObject({
  text: z.string().min(10).max(1000),
  claims: z.array(z.string().min(1).max(500)).max(10),
});

const RawExpansionSchema = z.strictObject({
  prompts: z.array(RawPromptEntrySchema).min(MIN_PROMPTS_PER_INTENT).max(MAX_PROMPTS_PER_INTENT),
});

/**
 * Parses and validates one expansion completion for one intent. Envelope
 * failures (fewer than 5 or more than 7 prompts, wrong shape) throw
 * ModelOutputError so the retry budget can spend another attempt;
 * per-prompt evidence failures become typed drop events — one broken
 * prompt never discards the good ones.
 */
export function parseExpansion(text: string, context: ExpansionContext): ExpansionParse {
  const raw = parseEnvelope(text, RawExpansionSchema);
  const dropped: StageBDropEvent[] = [];
  const drafts: ExpandedPromptDraft[] = [];

  for (const [index, entry] of raw.prompts.entries()) {
    const subject = `${context.intent.intent_id} prompts[${index}]`;
    const voice = context.voices[index % context.voices.length];
    if (voice === undefined) {
      // Guarded upstream (a graph with no persona×scenario pair fails
      // before any LLM call) — kept so a mis-shaped context degrades to
      // a typed drop instead of a crash.
      dropped.push({
        subject,
        reason: "unevidenced_prompt",
        detail: "the graph offers no persona×scenario voice to ground this prompt",
      });
      continue;
    }

    const matched: GraphClaim[] = [];
    const inventedQuotes: string[] = [];
    for (const quote of entry.claims) {
      const claim = matchClaim(quote, context.corpus);
      if (claim === null) {
        inventedQuotes.push(quote);
      } else if (!matched.some((candidate) => candidate.text === claim.text)) {
        matched.push(claim);
      }
    }
    for (const quote of inventedQuotes) {
      dropped.push({
        subject,
        reason: "invented_claim",
        detail: `the prompt encodes a fact no graph claim supports: "${quote.slice(0, 150)}"`,
      });
    }
    if (inventedQuotes.length > 0) {
      continue;
    }
    if (matched.length === 0) {
      dropped.push({
        subject,
        reason: "unevidenced_prompt",
        detail: "the prompt restates no graph claim — every prompt must encode at least one evidenced or assumption-flagged claim",
      });
      continue;
    }
    const evidenceUrls = matched.flatMap((claim) => claim.evidence_urls);
    if (evidenceUrls.length === 0) {
      // All matched claims are assumption-flagged; the PromptRecord
      // contract requires at least one citable URL, so the prompt is not
      // monitorable as written.
      dropped.push({
        subject,
        reason: "unevidenced_prompt",
        detail: "the prompt restates only assumption-flagged claims — a monitorable prompt must cite at least one evidence URL",
      });
      continue;
    }

    drafts.push({
      text: entry.text,
      claims: matched,
      persona_id: voice.persona.persona_id,
      scenario_id: voice.scenario.scenario_id,
      intent: context.intent,
      brand_id: context.brandId,
      country: context.country,
      language: context.language,
      competitor_ids: [...context.competitorIds],
    });
  }

  return { drafts, dropped };
}

// ---------------------------------------------------------------------------
// Near-duplicate collapse (Verification #4): market-partitioned, lexical-
// semantic, first-seen canonical survives
// ---------------------------------------------------------------------------

/** Same bar as the v1 intent-name dedup: half the tokens shared is the same prompt. */
const PROMPT_SIMILARITY_THRESHOLD = 0.5;

/** One collapsed near-duplicate: the canonical that survived, plus its variants. */
export interface PromptCollapse {
  canonical: ExpandedPromptDraft;
  variants: Array<{
    text: string;
    intent_id: string;
    persona_id: string;
    scenario_id: string;
  }>;
}

export interface PromptDedupReport {
  /** Surviving prompts, in first-seen order. */
  canonical: ExpandedPromptDraft[];
  /** One entry per canonical that absorbed at least one variant. */
  collapsed: PromptCollapse[];
}

/** Lowercased, order-insensitive token key — the exact-duplicate material. */
function promptKey(text: string): string {
  return [...promptTokens(text)].sort().join(" ");
}

function promptTokens(text: string): string[] {
  return text
    .toLowerCase()
    .normalize("NFKD")
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 0);
}

/**
 * Collapses near-duplicate prompts across the whole batch (the v1 engine's
 * market-partitioned lexical-semantic dedup, applied to prompts): prompts
 * only compete within the same (brand, country, language) market; within
 * it, an exact normalized-text match or a token overlap at or above 0.5
 * collapses into the earliest prompt, which survives as canonical.
 * Deterministic: first-seen order decides, never similarity noise.
 */
export function dedupPrompts(drafts: readonly ExpandedPromptDraft[]): PromptDedupReport {
  interface Partition {
    exactKeys: Map<string, ExpandedPromptDraft>;
    members: ExpandedPromptDraft[];
  }
  const partitions = new Map<string, Partition>();
  const collapseByCanonical = new Map<ExpandedPromptDraft, PromptCollapse>();
  const canonical: ExpandedPromptDraft[] = [];

  for (const draft of drafts) {
    const marketKey = `${draft.brand_id}|${draft.country}|${draft.language}`;
    let partition = partitions.get(marketKey);
    if (partition === undefined) {
      partition = { exactKeys: new Map(), members: [] };
      partitions.set(marketKey, partition);
    }

    // 1. Exact semantic key — same normalized text within the market.
    let matched: ExpandedPromptDraft | undefined = partition.exactKeys.get(promptKey(draft.text));
    // 2. Fuzzy fallback — token overlap at or above the v1 name threshold.
    if (matched === undefined) {
      matched = partition.members.find(
        (member) => tokenOverlap(member.text, draft.text) >= PROMPT_SIMILARITY_THRESHOLD,
      );
    }

    if (matched !== undefined) {
      let collapse = collapseByCanonical.get(matched);
      if (collapse === undefined) {
        collapse = { canonical: matched, variants: [] };
        collapseByCanonical.set(matched, collapse);
      }
      collapse.variants.push({
        text: draft.text,
        intent_id: draft.intent.intent_id,
        persona_id: draft.persona_id,
        scenario_id: draft.scenario_id,
      });
      continue;
    }

    partition.exactKeys.set(promptKey(draft.text), draft);
    partition.members.push(draft);
    canonical.push(draft);
  }

  return { canonical, collapsed: [...collapseByCanonical.values()] };
}

// ---------------------------------------------------------------------------
// PromptRecord assembly
// ---------------------------------------------------------------------------

export interface PromptProvenance {
  /** The expansion model (the source of the prompt text), e.g. "gemini-2.5-pro". */
  model: string;
  /** ISO timestamp of the expansion (the records' retrieved_at). */
  generatedAt: string;
}

/**
 * Assembles the PromptRecords for the surviving prompts. Ids are minted
 * deterministically from intent + persona + the prompt's ordinal within
 * its intent (post-dedup), so the same expansion output always yields the
 * same ids. Evidence URLs come only from the matched graph claims — the
 * model never supplies URLs.
 */
export function buildPromptRecords(
  drafts: readonly ExpandedPromptDraft[],
  provenance: PromptProvenance,
): PromptRecord[] {
  const usedIds = new Set<string>();
  const ordinalByIntent = new Map<string, number>();
  return drafts.map((draft) => {
    const ordinal = (ordinalByIntent.get(draft.intent.intent_id) ?? 0) + 1;
    ordinalByIntent.set(draft.intent.intent_id, ordinal);
    const personaFragment = draft.persona_id.replace(/^persona_/, "");
    const promptId = freshStableId(
      "prompt",
      slugify(`${draft.intent.intent_name} ${personaFragment} ${ordinal}`).slice(0, 80),
      usedIds,
    );
    usedIds.add(promptId);

    const evidenceUrls: string[] = [];
    for (const claim of draft.claims) {
      for (const url of claim.evidence_urls) {
        if (!evidenceUrls.includes(url)) {
          evidenceUrls.push(url);
        }
      }
    }

    return PromptRecordSchema.parse({
      schema_version: SCHEMA_VERSION_V2,
      prompt_id: promptId,
      intent_id: draft.intent.intent_id,
      persona_id: draft.persona_id,
      scenario_id: draft.scenario_id,
      text: draft.text,
      buyer_stage: draft.intent.buyer_stage,
      intent_category: draft.intent.intent_category,
      language: draft.language,
      country: draft.country,
      brand_id: draft.brand_id,
      competitors: draft.competitor_ids,
      evidence_urls: evidenceUrls,
      status: "draft",
      data_mode: "llm_simulated",
      provenance: { source: provenance.model, retrieved_at: provenance.generatedAt },
    });
  });
}
