/**
 * Human document rendition (blueprint Stage C.4): the Export Spec v2
 * grouped template — Data Mode header, Industry / Brand / Competitors
 * front matter, then one block per intent with its metadata stated once
 * and prompts split into Revenue Expansion (≥50%) and Market Expansion
 * (30–49%). A deterministic projection of the same structured lib as the
 * YAML export — neither can diverge from the stored metrics because
 * neither recomputes anything.
 */

import type { RunDataMode } from "@intentvisible/core-schema";

import { LibValidationError } from "./errors.js";
import type { BuyerIntentLib, LibIntent } from "./types.js";

export const DOCUMENT_SEPARATOR = "------------------------------------------------";

/** The prominent Data Mode header every export must carry (Verification #7). */
export function documentDataModeHeader(dataMode: RunDataMode): string[] {
  const lines = [`Data Mode: ${dataMode}`];
  if (dataMode === "llm_simulated") {
    // Blueprint Stage C.3: a simulated lib is a directional research
    // artifact, and the upgrade path to measured mode is stated in the
    // export itself.
    lines.push(
      "(Directional research artifact — LLM-simulated answers, not measured visibility. Connect a measured data provider to re-baseline in provider_measured mode.)",
    );
  }
  return lines;
}

/** The Monthly Search Volume line: tier only in lightweight mode — never a copyable estimate. */
export function monthlySearchVolumeLine(intent: LibIntent): string {
  const { tier, monthlyVolume } = intent.monthlySearchVolume;
  if (monthlyVolume !== null) {
    return `Monthly Search Volume: ${monthlyVolume} (provider_measured)`;
  }
  return `Monthly Search Volume: ${tier} tier`;
}

function promptList(prompts: LibIntent["revenueExpansion"]): string[] {
  return prompts.map((prompt) => `- ${prompt.text}`);
}

/** One intent block: metadata once, then the two expansion sections. */
export function renderIntentBlock(intent: LibIntent): string[] {
  const lines: string[] = [
    intent.intentName,
    "",
    monthlySearchVolumeLine(intent),
    `Buyer Stage: ${intent.buyerStage}`,
    `Intent Category: ${intent.intentCategory}`,
  ];
  if (intent.revenueExpansion.length > 0) {
    lines.push("", "Revenue Expansion (Visibility ≥50%)", "", ...promptList(intent.revenueExpansion));
  }
  if (intent.marketExpansion.length > 0) {
    lines.push("", "Market Expansion (Visibility 30%–49%)", "", ...promptList(intent.marketExpansion));
  }
  lines.push(
    "",
    "Recommended Content",
    "",
    intent.revenueExpansion[0]?.recommendedContent ??
      intent.marketExpansion[0]?.recommendedContent ??
      "(none)",
    "",
    "Recommended CTA",
    "",
    intent.revenueExpansion[0]?.recommendedCta ??
      intent.marketExpansion[0]?.recommendedCta ??
      "(none)",
  );
  return lines;
}

/** Render the grouped human document export, Export Spec v2 template order. */
export function renderDocumentExport(lib: BuyerIntentLib): string {
  const lines: string[] = [...documentDataModeHeader(lib.dataMode), ""];
  if (lib.industry !== null) {
    lines.push("Industry", "", lib.industry, "");
  }
  lines.push("Brand", "", lib.brandId, "");
  lines.push("Competitors");
  for (const competitor of lib.competitors) {
    lines.push(`- ${competitor.name}`); // copied from the graph, unranked, unassociated (Rule 8)
  }
  for (const intent of lib.intents) {
    lines.push("", DOCUMENT_SEPARATOR, "", ...renderIntentBlock(intent), "", DOCUMENT_SEPARATOR);
  }
  return `${lines.join("\n")}\n`;
}

/**
 * Validate a human document export: the first line must be the Data Mode
 * header with a measurement-side mode. A simulated lib without its header
 * fails validation (Verification #7).
 */
export function validateDocumentExport(text: string): { dataMode: RunDataMode } {
  const firstLine = text.split("\n", 1)[0] ?? "";
  const match = /^Data Mode: (.+)$/.exec(firstLine);
  const dataMode = match?.[1];
  if (
    dataMode === undefined ||
    (dataMode !== "llm_simulated" && dataMode !== "provider_measured")
  ) {
    throw new LibValidationError(
      `document export is missing its Data Mode header — expected first line "Data Mode: llm_simulated" or "Data Mode: provider_measured"`,
    );
  }
  return { dataMode: dataMode as RunDataMode };
}
