/**
 * Client-side review state for the merchant intent library. Until a
 * merchant intent-write API exists (the API's review surface is the
 * separate Prisma-backed agent flow, which these pages must not touch),
 * review decisions are recorded locally and reflected as chips on the
 * intent cards. The mutations below are pure; storage is the only effect.
 */

export interface IntentReviews {
  /** Intent ids the merchant approved. */
  approved: string[];
  /** Intent id → edited prompt list (one prompt per line in the editor). */
  editedPrompts: Record<string, string[]>;
}

const REVIEWS_KEY = "iv.shopify.reviews";

export function loadReviews(): IntentReviews {
  if (typeof window === "undefined") return { approved: [], editedPrompts: {} };
  try {
    const raw = window.localStorage.getItem(REVIEWS_KEY);
    if (raw === null) return { approved: [], editedPrompts: {} };
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      Array.isArray((parsed as IntentReviews).approved)
    ) {
      const candidate = parsed as IntentReviews;
      return {
        approved: candidate.approved,
        editedPrompts: candidate.editedPrompts ?? {},
      };
    }
    return { approved: [], editedPrompts: {} };
  } catch {
    return { approved: [], editedPrompts: {} };
  }
}

export function saveReviews(reviews: IntentReviews): void {
  window.localStorage.setItem(REVIEWS_KEY, JSON.stringify(reviews));
}

export function approveIntent(reviews: IntentReviews, intentId: string): IntentReviews {
  if (reviews.approved.includes(intentId)) return reviews;
  return { ...reviews, approved: [...reviews.approved, intentId] };
}

export function editPrompts(
  reviews: IntentReviews,
  intentId: string,
  prompts: string[],
): IntentReviews {
  return { ...reviews, editedPrompts: { ...reviews.editedPrompts, [intentId]: prompts } };
}

export type ReviewChip = "none" | "approved" | "edited";

/** The chip an intent card shows; an approved intent keeps its chip even if prompts were later edited. */
export function reviewChipFor(reviews: IntentReviews, intentId: string): ReviewChip {
  if (reviews.approved.includes(intentId)) return "approved";
  if (reviews.editedPrompts[intentId] !== undefined) return "edited";
  return "none";
}
