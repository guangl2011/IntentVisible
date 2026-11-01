/**
 * Stage A.1 + A.2 — the two modeling LLM passes over the extracted
 * profiles. A.1 resolves the business entity: business model, value
 * proposition, moats, the competitor set, and the 10 spot-check prompts.
 * A.2 models 3–4 MECE personas (six standard PSI fields each, three
 * scenario types per persona) and the candidate intent topics with their
 * fit scores and demand keywords.
 *
 * Parsing follows the v1 engine's shape: tolerant at the envelope level
 * (markdown fences, stray prose), strict per entry — one malformed claim
 * becomes a typed drop event, never a discarded pass and never a stored
 * hallucination. Every claim must cite a URL from the crawl registry or
 * carry the explicit assumption flag; the model is told so, and the
 * validator enforces it.
 */

import { z } from "zod";

import {
  BUSINESS_MODELS,
  BUYER_STAGES_V2,
  COMPETITOR_RELATIONS,
  INTENT_CATEGORIES_V2,
  type BusinessModel,
  type CompetitorRelation,
  type Trait,
} from "@intentvisible/core-schema";
import type { BrandProfile, ProductProfile } from "@intentvisible/core-schema";
import type { LandingPageProfile } from "@intentvisible/url-extractor";

import type { Clock } from "../clock.js";
import { LlmError, type LlmAdapter, type LlmRequest } from "../adapter.js";
import { type RetryOptions } from "../generate.js";
import { completeAndParse, ModelOutputError, parseEnvelope } from "./llm.js";
import { validateTrait, type StageADropEvent } from "./evidence.js";

// ---------------------------------------------------------------------------
// Shared prompt furniture
// ---------------------------------------------------------------------------

/** The evidence rules both passes restate — they map onto validateTrait's drop reasons. */
const EVIDENCE_RULES = [
  "Evidence rules you must never break:",
  "- Every claim must either cite at least one URL from the evidence registry (copy URLs exactly) or set \"assumption\": true.",
  "- Never cite a URL that is not in the evidence registry. Never invent a fact the evidence does not show.",
  "- An assumption claim must have an empty evidence_urls array.",
  "- Never invent, estimate, or guess any numeric measurement (volumes, percentages, prices not shown in the evidence).",
].join("\n");

/** Extracts only the page content the modeling passes consume, with its URL for citation. */
interface PageDigest {
  url: string;
  title: string | null;
  description: string | null;
  price: string | null;
  features: string[];
  faqs: string[];
}

const FEATURES_PER_PAGE = 20;
const FAQS_PER_PAGE = 10;
const DIGEST_DESCRIPTION_MAX = 500;

function pageDigest(url: string, page: LandingPageProfile): PageDigest {
  const faqs = page.faqs
    .slice(0, FAQS_PER_PAGE)
    .map((faq) => `${faq.value.question}: ${faq.value.answer}`);
  return {
    url,
    title: page.title?.value ?? null,
    description: page.description === null ? null : page.description.value.slice(0, DIGEST_DESCRIPTION_MAX),
    price: page.price?.value === undefined ? null : JSON.stringify(page.price.value),
    features: page.features.slice(0, FEATURES_PER_PAGE).map((feature) => feature.value),
    faqs,
  };
}

/**
 * Serializes the extracted profiles into the evidence block both modeling
 * prompts show: one PAGE block per crawled page, each headed by its URL —
 * the only URLs the model may cite. Deterministic: pages in crawl order,
 * fields in profile order.
 */
export function serializeProfileEvidence(profiles: StageAProfiles): string {
  const brand = profiles.brand;
  const product = profiles.product;
  const blocks: string[] = [];
  if (brand) {
    blocks.push(
      [
        `BRAND ${brand.name} (brand_id ${brand.brand_id}, domain ${brand.domain})`,
        brand.description ? `Description: ${brand.description}` : "",
        brand.categories.length > 0 ? `Categories: ${brand.categories.join(", ")}` : "",
        brand.competitor_brands.length > 0
          ? `Competitors the site itself names: ${brand.competitor_brands.join(", ")}`
          : "",
        brand.differentiators.length > 0
          ? `Differentiators: ${brand.differentiators.join("; ")}`
          : "",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );
  }
  if (product) {
    blocks.push(
      [
        `PRODUCT ${product.name} (product_id ${product.product_id})`,
        product.description ? `Description: ${product.description}` : "",
        product.price ? `Price: ${JSON.stringify(product.price)}` : "",
        product.features.length > 0 ? `Features: ${product.features.join("; ")}` : "",
        product.compatibility.length > 0 ? `Compatibility: ${product.compatibility.join("; ")}` : "",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );
  }
  for (const page of profiles.landing_pages) {
    const digest = pageDigest(page.url, page);
    blocks.push(
      [
        `PAGE ${digest.url}`,
        digest.title ? `Title: ${digest.title}` : "",
        digest.description ? `Description: ${digest.description}` : "",
        digest.price ? `Price: ${digest.price}` : "",
        digest.features.length > 0 ? `Features: ${digest.features.join("; ")}` : "",
        digest.faqs.length > 0 ? `FAQs: ${digest.faqs.join(" | ")}` : "",
      ]
        .filter((line) => line !== "")
        .join("\n"),
    );
  }
  return blocks.join("\n\n");
}

/** The extracted profiles Stage A models over (the UrlExtractor facade output). */
export interface StageAProfiles {
  brand: BrandProfile | null;
  product: ProductProfile | null;
  landing_pages: LandingPageProfile[];
}

// ---------------------------------------------------------------------------
// Stage A.1 — entity resolution
// ---------------------------------------------------------------------------

export const SPOT_CHECK_PROMPT_COUNT = 10;

export function entityResolutionSystemPrompt(): string {
  return [
    "You are a market-research analyst resolving a brand's entity from the evidence extracted from its own website.",
    "",
    "Produce, as JSON (no prose, no markdown fences):",
    "{",
    '  "business_model": "dtc" | "amazon" | "b2b" | "affiliate",',
    '  "value_proposition": { "text": "...", "assumption": false, "evidence_urls": ["..."] },',
    '  "moats": [{ "text": "...", "assumption": false, "evidence_urls": ["..."] }],',
    '  "competitors": [{ "name": "...", "relation": "direct" | "indirect", "claims": [{ "text": "...", "assumption": false, "evidence_urls": ["..."] }], "evidence_urls": ["..."] }],',
    '  "spot_check_prompts": ["...", ... exactly 10 prompts ...]',
    "}",
    "",
    "Field rules:",
    "- business_model: how the brand sells (dtc = its own web store, amazon = marketplace-first, b2b = business customers, affiliate = content/affiliate monetization).",
    "- value_proposition: the brand's core promise, grounded in the site's own positioning.",
    "- moats: ingredient/technical barriers worth citing in answers (empty array when the site shows none).",
    `- competitors: 5-10 direct and indirect competitors. Ground them in the site's own comparison content or category listings — every competitor's evidence_urls must cite where the site shows it. Never invent a competitor the evidence does not name.`,
    `- spot_check_prompts: exactly ${SPOT_CHECK_PROMPT_COUNT} representative first-person questions a buyer of this category would type into an AI assistant — the visibility probe for this brand.`,
    "",
    EVIDENCE_RULES,
  ].join("\n");
}

export interface EntityResolutionPromptInput {
  brandName: string;
  country: string;
  language: string;
  evidence: string;
}

export function buildEntityResolutionUserPrompt(input: EntityResolutionPromptInput): string {
  return [
    `Brand: ${input.brandName}. Target market: country ${input.country}, language ${input.language}.`,
    "",
    "Evidence extracted from the brand's own website (the evidence registry — cite only these URLs):",
    input.evidence,
  ].join("\n");
}

const RawCompetitorSchema = z.strictObject({
  name: z.string().min(1).max(200),
  relation: z.string().min(1).optional(),
  claims: z.array(z.unknown()).max(20).optional(),
  evidence_urls: z.array(z.string().min(1)).max(100).optional(),
});

const RawEntitySchema = z.strictObject({
  business_model: z.string().min(1),
  value_proposition: z.unknown(),
  moats: z.array(z.unknown()).max(20).optional(),
  competitors: z.array(RawCompetitorSchema).max(20).optional(),
  spot_check_prompts: z.array(z.string().min(10).max(1000)).min(1).max(30),
});

export interface ResolvedCompetitor {
  name: string;
  relation: CompetitorRelation;
  claims: Trait[];
  evidence_urls: string[];
}

export interface ResolvedEntity {
  business_model: BusinessModel;
  value_proposition: Trait;
  moats: Trait[];
  competitors: ResolvedCompetitor[];
  spot_check_prompts: string[];
}

export interface EntityResolutionParse {
  entity: ResolvedEntity;
  dropped: StageADropEvent[];
}

function parseTraitOrDrop(
  raw: unknown,
  registry: ReadonlySet<string>,
  subject: string,
  dropped: StageADropEvent[],
): Trait | null {
  const parsed = RawTraitShapeSchema.safeParse(raw);
  if (!parsed.success) {
    dropped.push({
      subject,
      reason: "schema_invalid",
      detail: "claim is not a {text, assumption?, evidence_urls?} object",
    });
    return null;
  }
  const outcome = validateTrait(parsed.data, registry, subject);
  if (!outcome.ok) {
    dropped.push(outcome.event);
    return null;
  }
  return outcome.trait;
}

const RawTraitShapeSchema = z.strictObject({
  text: z.string().min(1).max(500),
  assumption: z.boolean().optional(),
  evidence_urls: z.array(z.string().min(1)).max(100).optional(),
});

/**
 * Parses and validates one entity-resolution completion. Envelope failures
 * (no JSON, wrong shape, wrong spot-check count) throw ModelOutputError so
 * the retry budget can spend another attempt; per-claim failures become
 * drop events. An invalid value proposition or business model is fatal to
 * the pass — the brand node cannot exist without them.
 */
export function parseEntityResolution(
  text: string,
  registry: ReadonlySet<string>,
): EntityResolutionParse {
  const raw = parseEnvelope(text, RawEntitySchema);
  const dropped: StageADropEvent[] = [];

  if (raw.spot_check_prompts.length !== SPOT_CHECK_PROMPT_COUNT) {
    throw new ModelOutputError(
      `entity resolution returned ${raw.spot_check_prompts.length} spot-check prompts; exactly ${SPOT_CHECK_PROMPT_COUNT} are required`,
    );
  }

  if (!BUSINESS_MODELS.includes(raw.business_model as BusinessModel)) {
    throw new ModelOutputError(
      `entity resolution returned business_model "${raw.business_model}"; expected one of ${BUSINESS_MODELS.join(", ")}`,
    );
  }
  const businessModel = raw.business_model as BusinessModel;

  const valueProposition = parseTraitOrDrop(
    raw.value_proposition,
    registry,
    "value_proposition",
    dropped,
  );
  if (valueProposition === null) {
    throw new ModelOutputError(
      "the value proposition claim was dropped — the brand node cannot be built without a valid one",
    );
  }

  const moats: Trait[] = [];
  for (const [index, entry] of (raw.moats ?? []).entries()) {
    const trait = parseTraitOrDrop(entry, registry, `moats[${index}]`, dropped);
    if (trait !== null) {
      moats.push(trait);
    }
  }

  const competitors: ResolvedCompetitor[] = [];
  for (const [index, entry] of (raw.competitors ?? []).entries()) {
    const subject = `competitors[${index}] (${entry.name})`;
    const claimTraits: Trait[] = [];
    for (const [claimIndex, claim] of (entry.claims ?? []).entries()) {
      const trait = parseTraitOrDrop(claim, registry, `${subject}.claims[${claimIndex}]`, dropped);
      if (trait !== null) {
        claimTraits.push(trait);
      }
    }
    const evidenceUrls = entry.evidence_urls ?? [];
    const unknownUrls = evidenceUrls.filter((url) => !registry.has(url));
    if (unknownUrls.length > 0) {
      dropped.push({
        subject,
        reason: "unevidenced_claim",
        detail: `competitor cites URLs outside the crawl registry: ${unknownUrls.join(", ")}`,
      });
      continue;
    }
    if (evidenceUrls.length === 0) {
      dropped.push({
        subject,
        reason: "missing_evidence",
        detail: "competitor carries no evidence URL — competitors must cite where the site shows them",
      });
      continue;
    }
    const relation =
      entry.relation === undefined
        ? "indirect"
        : COMPETITOR_RELATIONS.includes(entry.relation as CompetitorRelation)
          ? (entry.relation as CompetitorRelation)
          : undefined;
    if (relation === undefined) {
      dropped.push({
        subject,
        reason: "schema_invalid",
        detail: `competitor relation "${entry.relation}" is not one of ${COMPETITOR_RELATIONS.join(", ")}`,
      });
      continue;
    }
    competitors.push({ name: entry.name, relation, claims: claimTraits, evidence_urls: evidenceUrls });
  }

  return {
    entity: {
      business_model: businessModel,
      value_proposition: valueProposition,
      moats,
      competitors,
      spot_check_prompts: raw.spot_check_prompts,
    },
    dropped,
  };
}

// ---------------------------------------------------------------------------
// Stage A.2 — persona & scenario modeling + candidate intent topics
// ---------------------------------------------------------------------------

export function personasSystemPrompt(): string {
  return [
    "You are a buyer-research analyst modeling personas and intent topics for a brand, per the PSI (Persona-Scenario-Intent) framework.",
    "",
    "Produce, as JSON (no prose, no markdown fences):",
    "{",
    '  "personas": [{',
    '    "archetype": "short persona title and archetype",',
    '    "demographics": { "text": "...", "assumption": false, "evidence_urls": ["..."] },',
    '    "core_frustrations": [{ "text": "...", "assumption": false, "evidence_urls": ["..."] }],',
    '    "cognitive_biases": [{ "text": "...", "assumption": false, "evidence_urls": ["..."] }],',
    '    "decision_triggers": [{ "text": "...", "assumption": false, "evidence_urls": ["..."] }],',
    '    "ai_language_fingerprint": { "text": "...", "assumption": false, "evidence_urls": ["..."] },',
    '    "scenarios": [{ "scenario_type": "daily_pain" | "acute_trigger" | "final_shelf_comparison", "description": { "text": "...", "assumption": false, "evidence_urls": ["..."] } }]',
    "  }],",
    '  "intent_topics": [{',
    '    "intent_name": "short stable intent name (2-5 words)",',
    '    "buyer_stage": "Awareness" | "Problem Discovery" | "Solution Research" | "Vendor Evaluation" | "Purchase" | "Expansion",',
    '    "intent_category": "Educational" | "Pain Point" | "Solution Research" | "Vendor Comparison" | "Pricing" | "ROI" | "Implementation" | "Technical" | "Compliance" | "Future Trends",',
    '    "keywords": ["primary demand phrase first, then variants"],',
    '    "fit": { "score": 0.0, "mismatch_reason": "required when score < 0.5", "evidence_urls": ["..."] },',
    '    "evidence_urls": ["pages supporting this topic"]',
    "  }]",
    "}",
    "",
    "Field rules:",
    "- 3-4 personas, mutually exclusive and collectively exhaustive (MECE) for this category.",
    "- The six persona fields are the PSI standard: archetype, demographics, core frustrations, cognitive biases/objections, decision triggers, AI search language fingerprint (the colloquial phrasings such a buyer types into an AI chat).",
    "- Every persona carries exactly one scenario per type: daily_pain (daily routine pain), acute_trigger (the sudden event that sends them to an AI assistant), final_shelf_comparison (the last check before buying).",
    "- 3-10 intent_topics grounded in what the evidence shows buyers ask; fit scores the topic against the brand's value proposition from 0 to 1 — below 0.5 you must name the mismatch.",
    "- keywords: the first keyword is the topic's primary demand phrase (used for demand estimation); add variants after.",
    "",
    EVIDENCE_RULES,
  ].join("\n");
}

export interface PersonasPromptInput {
  brandName: string;
  country: string;
  language: string;
  valueProposition: string;
  competitorNames: string[];
  evidence: string;
}

export function buildPersonasUserPrompt(input: PersonasPromptInput): string {
  return [
    `Brand: ${input.brandName}. Target market: country ${input.country}, language ${input.language}.`,
    `Resolved value proposition: ${input.valueProposition}`,
    input.competitorNames.length > 0
      ? `Resolved competitor set: ${input.competitorNames.join(", ")}.`
      : "No competitors were resolved from the site.",
    "",
    "Evidence extracted from the brand's own website (the evidence registry — cite only these URLs):",
    input.evidence,
  ].join("\n");
}

const RawScenarioSchema = z.strictObject({
  scenario_type: z.string().min(1),
  description: z.unknown(),
});

const RawPersonaSchema = z.strictObject({
  archetype: z.string().min(1).max(200),
  demographics: z.unknown(),
  core_frustrations: z.array(z.unknown()).min(1).max(20),
  cognitive_biases: z.array(z.unknown()).min(1).max(20),
  decision_triggers: z.array(z.unknown()).min(1).max(20),
  ai_language_fingerprint: z.unknown(),
  scenarios: z.array(RawScenarioSchema).min(1).max(10),
});

const RawFitSchema = z.strictObject({
  score: z.number(),
  mismatch_reason: z.string().min(1).max(500).nullable().optional(),
  evidence_urls: z.array(z.string().min(1)).max(100).optional(),
});

const RawIntentTopicSchema = z.strictObject({
  intent_name: z.string().min(1).max(200),
  buyer_stage: z.string().min(1),
  intent_category: z.string().min(1),
  keywords: z.array(z.string().min(1).max(200)).min(1).max(10),
  fit: RawFitSchema,
  evidence_urls: z.array(z.string().min(1)).max(100).optional(),
});

const RawModelingSchema = z.strictObject({
  personas: z.array(RawPersonaSchema).min(1).max(10),
  intent_topics: z.array(RawIntentTopicSchema).min(1).max(30),
});

/** Validated persona fields — ids and brand binding are injected at assembly. */
export interface ModeledPersona {
  archetype: string;
  demographics: Trait;
  core_frustrations: Trait[];
  cognitive_biases: Trait[];
  decision_triggers: Trait[];
  ai_language_fingerprint: Trait;
  scenarios: Array<{ scenario_type: "daily_pain" | "acute_trigger" | "final_shelf_comparison"; description: Trait }>;
}

/** Validated candidate intent topic; volume/gap/priority are attached downstream. */
export interface ModeledIntentTopic {
  intent_name: string;
  buyer_stage: (typeof BUYER_STAGES_V2)[number];
  intent_category: (typeof INTENT_CATEGORIES_V2)[number];
  keywords: string[];
  fit: { score: number; mismatch_reason?: string };
  evidence_urls: string[];
}

export interface PersonasModelingParse {
  personas: ModeledPersona[];
  intent_topics: ModeledIntentTopic[];
  dropped: StageADropEvent[];
}

/** The three scenario types are the MECE set every persona must carry (PSI Skill §2, step 3). */
const SCENARIO_TYPES_REQUIRED = ["daily_pain", "acute_trigger", "final_shelf_comparison"] as const;
type RequiredScenarioType = (typeof SCENARIO_TYPES_REQUIRED)[number];

/**
 * Parses and validates one personas-modeling completion. Envelope failures
 * throw ModelOutputError (the retry budget may spend another attempt);
 * per-persona and per-claim failures become drop events — one broken
 * persona never discards the good ones.
 */
export function parsePersonasModeling(
  text: string,
  registry: ReadonlySet<string>,
): PersonasModelingParse {
  const raw = parseEnvelope(text, RawModelingSchema);
  const dropped: StageADropEvent[] = [];

  const personas: ModeledPersona[] = [];
  for (const [index, entry] of raw.personas.entries()) {
    const subject = `personas[${index}] (${entry.archetype})`;
    const demographics = parseTraitOrDrop(entry.demographics, registry, `${subject}.demographics`, dropped);
    const fingerprint = parseTraitOrDrop(
      entry.ai_language_fingerprint,
      registry,
      `${subject}.ai_language_fingerprint`,
      dropped,
    );
    const frustrations = collectTraits(entry.core_frustrations, `${subject}.core_frustrations`, registry, dropped);
    const biases = collectTraits(entry.cognitive_biases, `${subject}.cognitive_biases`, registry, dropped);
    const triggers = collectTraits(entry.decision_triggers, `${subject}.decision_triggers`, registry, dropped);
    const scenarios = collectScenarios(entry.scenarios, subject, registry, dropped);

    const incomplete =
      demographics === null ||
      fingerprint === null ||
      frustrations.length === 0 ||
      biases.length === 0 ||
      triggers.length === 0 ||
      scenarios.length < SCENARIO_TYPES_REQUIRED.length;
    if (incomplete) {
      dropped.push({
        subject,
        reason: "persona_incomplete",
        detail:
          "persona lost a required PSI field or a scenario type during claim validation — every persona needs all six fields and one scenario per type",
      });
      continue;
    }
    personas.push({
      archetype: entry.archetype,
      demographics,
      core_frustrations: frustrations,
      cognitive_biases: biases,
      decision_triggers: triggers,
      ai_language_fingerprint: fingerprint,
      scenarios,
    });
  }

  const intentTopics: ModeledIntentTopic[] = [];
  for (const [index, entry] of raw.intent_topics.entries()) {
    const subject = `intent_topics[${index}] (${entry.intent_name})`;
    if (!BUYER_STAGES_V2.includes(entry.buyer_stage as never)) {
      dropped.push({
        subject,
        reason: "schema_invalid",
        detail: `buyer_stage "${entry.buyer_stage}" is not one of ${BUYER_STAGES_V2.join(", ")}`,
      });
      continue;
    }
    if (!INTENT_CATEGORIES_V2.includes(entry.intent_category as never)) {
      dropped.push({
        subject,
        reason: "schema_invalid",
        detail: `intent_category "${entry.intent_category}" is not one of ${INTENT_CATEGORIES_V2.join(", ")}`,
      });
      continue;
    }
    const { score, mismatch_reason } = entry.fit;
    if (score < 0 || score > 1) {
      dropped.push({ subject, reason: "schema_invalid", detail: `fit score ${score} is outside [0, 1]` });
      continue;
    }
    if (score < 0.5 && (mismatch_reason === undefined || mismatch_reason === null)) {
      dropped.push({
        subject,
        reason: "schema_invalid",
        detail: "a fit score below 0.5 must name the mismatch",
      });
      continue;
    }
    const evidenceUrls = entry.evidence_urls ?? [];
    const unknownUrls = evidenceUrls.filter((url) => !registry.has(url));
    if (unknownUrls.length > 0) {
      dropped.push({
        subject,
        reason: "unevidenced_claim",
        detail: `topic cites URLs outside the crawl registry: ${unknownUrls.join(", ")}`,
      });
      continue;
    }
    if (evidenceUrls.length === 0) {
      dropped.push({
        subject,
        reason: "missing_evidence",
        detail: "topic carries no evidence URL — topics must cite the pages supporting them",
      });
      continue;
    }
    const fitUrls = (entry.fit.evidence_urls ?? []).filter((url) => !registry.has(url));
    if (fitUrls.length > 0) {
      dropped.push({
        subject,
        reason: "unevidenced_claim",
        detail: `fit cites URLs outside the crawl registry: ${fitUrls.join(", ")}`,
      });
      continue;
    }
    intentTopics.push({
      intent_name: entry.intent_name,
      buyer_stage: entry.buyer_stage as ModeledIntentTopic["buyer_stage"],
      intent_category: entry.intent_category as ModeledIntentTopic["intent_category"],
      keywords: [...entry.keywords],
      fit: mismatch_reason === undefined || mismatch_reason === null ? { score } : { score, mismatch_reason },
      evidence_urls: evidenceUrls,
    });
  }

  return { personas, intent_topics: intentTopics, dropped };
}

function collectTraits(
  entries: unknown[],
  subjectBase: string,
  registry: ReadonlySet<string>,
  dropped: StageADropEvent[],
): Trait[] {
  const traits: Trait[] = [];
  for (const [index, entry] of entries.entries()) {
    const trait = parseTraitOrDrop(entry, registry, `${subjectBase}[${index}]`, dropped);
    if (trait !== null) {
      traits.push(trait);
    }
  }
  return traits;
}

function collectScenarios(
  entries: Array<{ scenario_type: string; description: unknown }>,
  subjectBase: string,
  registry: ReadonlySet<string>,
  dropped: StageADropEvent[],
): Array<{ scenario_type: RequiredScenarioType; description: Trait }> {
  const byType = new Map<RequiredScenarioType, Trait>();
  for (const [index, entry] of entries.entries()) {
    const subject = `${subjectBase}.scenarios[${index}] (${entry.scenario_type})`;
    if (!SCENARIO_TYPES_REQUIRED.includes(entry.scenario_type as RequiredScenarioType)) {
      dropped.push({
        subject,
        reason: "schema_invalid",
        detail: `scenario_type "${entry.scenario_type}" is not one of ${SCENARIO_TYPES_REQUIRED.join(", ")}`,
      });
      continue;
    }
    const type = entry.scenario_type as RequiredScenarioType;
    // MECE: one scenario per type — the first of a duplicated type wins.
    if (byType.has(type)) {
      dropped.push({
        subject,
        reason: "duplicate",
        detail: `a ${type} scenario was already accepted for this persona`,
      });
      continue;
    }
    const description = parseTraitOrDrop(entry.description, registry, `${subject}.description`, dropped);
    if (description !== null) {
      byType.set(type, description);
    }
  }
  return [...byType.entries()].map(([scenarioType, description]) => ({
    scenario_type: scenarioType,
    description,
  }));
}

// ---------------------------------------------------------------------------
// The retry-wrapped pass driver
// ---------------------------------------------------------------------------

/** One modeling pass result: the parsed payload plus the model that produced it. */
export interface ModelingPassResult<T> {
  result: T;
  model: string;
}

/**
 * Drives one modeling LLM call through the retry budget, then hands the
 * text to the pass parser (whose envelope errors are retryable output
 * errors, not transport errors). Transport exhaustion maps to
 * llm_unavailable, output exhaustion to llm_invalid_output — both typed
 * Stage A failures.
 */
export async function runModelingPass<T>(
  deps: {
    adapter: LlmAdapter;
    clock: Clock;
    retry: RetryOptions;
  },
  request: LlmRequest,
  parse: (text: string, registry: ReadonlySet<string>) => T,
  registry: ReadonlySet<string>,
): Promise<ModelingPassResult<T>> {
  const { response, parsed } = await completeAndParse(deps, request, (text) => parse(text, registry));
  return { result: parsed, model: response.model };
}

/** Re-exported so the orchestrator can catch transport errors without importing adapter internals. */
export { LlmError };
