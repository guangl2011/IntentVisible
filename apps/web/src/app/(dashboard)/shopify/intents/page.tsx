"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  IntentCategory,
  IntentLibraryFilters,
  IntentRecord,
  Scope,
} from "@intentvisible/client";

import { loadBinding, type StoreBinding } from "../../../../lib/shopify/binding";
import { getShopifyClient } from "../../../../lib/shopify/client";
import { loadPage } from "../../../../lib/shopify/loaders";
import {
  approveIntent,
  editPrompts,
  loadReviews,
  reviewChipFor,
  saveReviews,
  type IntentReviews,
} from "../../../../lib/shopify/review";
import { ConnectCard } from "../components/connect-card";
import { useJobPoll } from "../components/use-job-poll";
import {
  EmptyPanel,
  ErrorPanel,
  FailurePanel,
  LoadingPanel,
  ShopifyNav,
} from "../components/panels";
import { IntentReviewCard } from "../components/intent-review-card";

const SCOPES: Scope[] = ["brand", "product"];
const CATEGORIES: IntentCategory[] = [
  "Category Question",
  "Solution Research",
  "Comparison",
  "Scenario",
  "Price",
  "Risk & Trust",
  "Feature",
  "Compatibility",
  "Purchase Conditions",
  "After-sales",
  "Technical",
];

type IntentsState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "loaded"; intents: IntentRecord[]; reviews: IntentReviews };

/**
 * Merchant intent library (spec D4): list filtered by scope and category,
 * regenerate from the latest sync, and per-intent review actions
 * (approve, edit prompts). Review state is local — see lib/shopify/review.
 */
export default function ShopifyIntentsPage() {
  const [binding, setBinding] = useState<StoreBinding | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [scope, setScope] = useState<Scope | "">("");
  const [category, setCategory] = useState<IntentCategory | "">("");
  const [state, setState] = useState<IntentsState>({ phase: "loading" });
  const [generateBusy, setGenerateBusy] = useState(false);

  useEffect(() => {
    setBinding(loadBinding());
    setHydrated(true);
  }, []);

  const reload = useCallback(
    async (bound: StoreBinding, filters: IntentLibraryFilters) => {
      const reviews = loadReviews();
      const intents = await loadPage(() => getShopifyClient().listIntents(bound.storeId, filters));
      if (!intents.ok) {
        setState({ phase: "error", message: intents.error.message });
        return;
      }
      setState({ phase: "loaded", intents: intents.data.intents, reviews });
    },
    [],
  );

  useEffect(() => {
    if (binding !== null) void reload(binding, {});
  }, [binding, reload]);

  const applyFilters = (nextScope: Scope | "", nextCategory: IntentCategory | "") => {
    if (binding === null) return;
    setScope(nextScope);
    setCategory(nextCategory);
    const filters: IntentLibraryFilters = {};
    if (nextScope !== "") filters.scope = nextScope;
    if (nextCategory !== "") filters.intent_category = nextCategory;
    void reload(binding, filters);
  };

  const poll = useJobPoll(getShopifyClient(), () => {
    if (binding !== null) {
      const filters: IntentLibraryFilters = {};
      if (scope !== "") filters.scope = scope;
      if (category !== "") filters.intent_category = category;
      void reload(binding, filters);
    }
  });

  const triggerGeneration = async () => {
    if (binding === null || generateBusy) return;
    setGenerateBusy(true);
    const result = await loadPage(() => getShopifyClient().triggerGeneration(binding.storeId));
    setGenerateBusy(false);
    if (!result.ok) {
      setState({ phase: "error", message: result.error.message });
      return;
    }
    poll.trackJob(result.data.job_id);
  };

  const approve = (intentId: string) => {
    if (state.phase !== "loaded") return;
    const reviews = saveAndRefresh(approveIntent(state.reviews, intentId));
    setState({ ...state, reviews });
  };

  const savePrompts = (intentId: string, prompts: string[]) => {
    if (state.phase !== "loaded") return;
    const reviews = saveAndRefresh(editPrompts(state.reviews, intentId, prompts));
    setState({ ...state, reviews });
  };

  if (!hydrated || binding === null) {
    return (
      <>
        <ShopifyNav active="intents" />
        {hydrated ? (
          <ConnectCard
            onSubmit={() => undefined}
            busy={false}
            error="Connect your store on the overview page first."
          />
        ) : (
          <LoadingPanel label="store binding" />
        )}
      </>
    );
  }

  const generateFailedJob = poll.job?.status === "failed" ? poll.job : null;

  return (
    <>
      <ShopifyNav active="intents" />
      <div className="shopify-head">
        <h1 className="page-title">Intent library</h1>
        <button
          type="button"
          className="primary"
          disabled={generateBusy || poll.job !== null}
          onClick={() => void triggerGeneration()}
        >
          {poll.job === null ? "Regenerate intents" : `Generating… (${poll.job.status})`}
        </button>
      </div>
      {generateFailedJob?.error !== null && generateFailedJob?.error !== undefined && (
        <FailurePanel
          reason={generateFailedJob.error.reason}
          detail={generateFailedJob.error.detail}
        />
      )}
      <div className="filters">
        <label>
          <span className="muted">Scope</span>
          <select
            value={scope}
            onChange={(event) => applyFilters(event.target.value as Scope | "", category)}
          >
            <option value="">All scopes</option>
            {SCOPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label>
          <span className="muted">Category</span>
          <select
            value={category}
            onChange={(event) => applyFilters(scope, event.target.value as IntentCategory | "")}
          >
            <option value="">All categories</option>
            {CATEGORIES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
      </div>
      {state.phase === "loading" && <LoadingPanel label="intents" />}
      {state.phase === "error" && <ErrorPanel message={state.message} />}
      {state.phase === "loaded" &&
        (state.intents.length === 0 ? (
          <EmptyPanel
            title="No intents in the library"
            hint="Regenerate intents to derive them from your latest synced catalog."
          />
        ) : (
          state.intents.map((intent) => (
            <IntentReviewCard
              key={`${intent.intent_id}:${intent.intent_version}`}
              intent={intent}
              chip={reviewChipFor(state.reviews, intent.intent_id)}
              prompts={state.reviews.editedPrompts[intent.intent_id] ?? intent.prompts}
              onApprove={() => approve(intent.intent_id)}
              onSavePrompts={(prompts) => savePrompts(intent.intent_id, prompts)}
            />
          ))
        ))}
    </>
  );
}

/** Pure mutation + persistence together at the container edge. */
function saveAndRefresh(reviews: IntentReviews): IntentReviews {
  saveReviews(reviews);
  return reviews;
}
