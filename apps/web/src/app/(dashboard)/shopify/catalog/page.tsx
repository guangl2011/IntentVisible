"use client";

import { useCallback, useEffect, useState } from "react";

import type { ProductListItem } from "@intentvisible/client";

import { loadBinding, type StoreBinding } from "../../../../lib/shopify/binding";
import { getShopifyClient } from "../../../../lib/shopify/client";
import { loadPage } from "../../../../lib/shopify/loaders";
import { ConnectCard } from "../components/connect-card";
import { useJobPoll } from "../components/use-job-poll";
import {
  EmptyPanel,
  ErrorPanel,
  FailurePanel,
  LoadingPanel,
  ShopifyNav,
  JobPanel,
} from "../components/panels";
import { ProductTable } from "../components/tables";

type CatalogState =
  | { phase: "loading" }
  | { phase: "error"; message: string }
  | { phase: "loaded"; products: ProductListItem[] };

/**
 * Merchant catalog: the synced product list plus the sync trigger
 * (spec D4). Reads only through the Shopify client; the sync job runs on
 * the API and is polled to its terminal state.
 */
export default function ShopifyCatalogPage() {
  const [binding, setBinding] = useState<StoreBinding | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [catalog, setCatalog] = useState<CatalogState>({ phase: "loading" });
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    setBinding(loadBinding());
    setHydrated(true);
  }, []);

  const reload = useCallback(async (bound: StoreBinding) => {
    const products = await loadPage(() => getShopifyClient().listProducts(bound.storeId));
    if (!products.ok) {
      setCatalog({ phase: "error", message: products.error.message });
      return;
    }
    setCatalog({ phase: "loaded", products: products.data.products });
  }, []);

  useEffect(() => {
    if (binding !== null) void reload(binding);
  }, [binding, reload]);

  const poll = useJobPoll(getShopifyClient(), () => {
    if (binding !== null) void reload(binding);
  });

  const triggerSync = async () => {
    if (binding === null || syncBusy) return;
    setSyncBusy(true);
    const result = await loadPage(() => getShopifyClient().triggerSync(binding.storeId));
    if (!result.ok) {
      setSyncBusy(false);
      setCatalog({ phase: "error", message: result.error.message });
      return;
    }
    poll.trackJob(result.data.job_id);
  };

  if (!hydrated || binding === null) {
    return (
      <>
        <ShopifyNav active="catalog" />
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

  const syncFailedJob = poll.job?.status === "failed" ? poll.job : null;
  const jobTerminal =
    poll.job?.status === "complete" || poll.job?.status === "failed";

  return (
    <>
      <ShopifyNav active="catalog" />
      <div className="shopify-head">
        <h1 className="page-title">Catalog</h1>
        <button
          type="button"
          className="primary"
          disabled={syncBusy || (poll.job !== null && !jobTerminal)}
          onClick={() => void triggerSync()}
        >
          {poll.job === null
            ? "Sync catalog"
            : jobTerminal
              ? `Last sync ${poll.job.status}`
              : `Syncing… (${poll.job.status})`}
        </button>
      </div>
      {poll.job !== null && <JobPanel label="Last catalog sync" job={poll.job} />}
      {syncFailedJob?.error !== null && syncFailedJob?.error !== undefined && (
        <FailurePanel
          reason={syncFailedJob.error.reason}
          detail={syncFailedJob.error.detail}
          onSync={() => void triggerSync()}
        />
      )}
      {catalog.phase === "loading" && <LoadingPanel label="catalog" />}
      {catalog.phase === "error" && <ErrorPanel message={catalog.message} />}
      {catalog.phase === "loaded" &&
        (catalog.products.length === 0 ? (
          <EmptyPanel
            title="No products synced yet"
            hint="Run a catalog sync to pull your Shopify products into the intent library."
          />
        ) : (
          <ProductTable products={catalog.products} />
        ))}
    </>
  );
}
