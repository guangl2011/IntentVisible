"use client";

import { useCallback, useEffect, useState } from "react";

import {
  clearBinding,
  loadBinding,
  resolveBinding,
  saveBinding,
  type LoadResult,
  type StoreBinding,
} from "../../../lib/shopify/binding";
import type { StoreStatus } from "@intentvisible/client";
import { getShopifyClient } from "../../../lib/shopify/client";
import { loadPage } from "../../../lib/shopify/loaders";
import { ConnectCard } from "./components/connect-card";
import {
  ErrorPanel,
  FailurePanel,
  JobPanel,
  LoadingPanel,
  ShopifyNav,
  StatCards,
} from "./components/panels";

/**
 * Merchant overview: connection state, library counts, and the last job
 * of each kind (spec D4). Data comes only through the Shopify client.
 */
export default function ShopifyOverviewPage() {
  const [binding, setBinding] = useState<StoreBinding | null>(null);
  const [hydrated, setHydrated] = useState(false);
  const [status, setStatus] = useState<LoadResult<StoreStatus> | null>(null);
  const [connectBusy, setConnectBusy] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [installUrl, setInstallUrl] = useState<string | null>(null);

  useEffect(() => {
    setBinding(loadBinding());
    setHydrated(true);
  }, []);

  const refresh = useCallback(async (bound: StoreBinding) => {
    setStatus(null);
    setStatus(await loadPage(() => getShopifyClient().storeStatus(bound.storeId)));
  }, []);

  useEffect(() => {
    if (binding !== null) void refresh(binding);
  }, [binding, refresh]);

  const connect = async (input: string) => {
    setConnectBusy(true);
    setConnectError(null);
    const result = await resolveBinding(input);
    setConnectBusy(false);
    if (!result.ok) {
      setConnectError(result.error.message);
      return;
    }
    saveBinding(result.data);
    setInstallUrl(null);
    setBinding(result.data);
  };

  const beginDomainInstall = async (shopDomain: string) => {
    setConnectBusy(true);
    setConnectError(null);
    const result = await loadPage(() => getShopifyClient().beginInstall(shopDomain));
    setConnectBusy(false);
    if (!result.ok) {
      setConnectError(result.error.message);
      return;
    }
    setInstallUrl(result.data.install_url);
  };

  const disconnect = () => {
    clearBinding();
    setBinding(null);
    setStatus(null);
  };

  if (!hydrated) {
    return (
      <>
        <ShopifyNav active="overview" />
        <LoadingPanel label="store binding" />
      </>
    );
  }

  if (binding === null) {
    return (
      <>
        <ShopifyNav active="overview" />
        <ConnectCard onSubmit={connect} busy={connectBusy} error={connectError} />
        {installUrl !== null && (
          <p className="muted install-note">
            Continue in Shopify to grant access:{" "}
            <a href={installUrl} target="_blank" rel="noreferrer">
              open the install page
            </a>
            . The dashboard binds the store id and shows live status once consent completes.
          </p>
        )}
      </>
    );
  }

  if (status === null) {
    return (
      <>
        <ShopifyNav active="overview" />
        <LoadingPanel label="store status" />
      </>
    );
  }

  if (!status.ok) {
    return (
      <>
        <ShopifyNav active="overview" />
        {status.error.kind === "not_found" ? (
          <ConnectCard
            onSubmit={connect}
            busy={connectBusy}
            error={connectError ?? status.error.message}
          />
        ) : (
          <ErrorPanel message={status.error.message} />
        )}
      </>
    );
  }

  const store = status.data;
  if (!store.connected) {
    return (
      <>
        <ShopifyNav active="overview" />
        <ConnectCard
          onSubmit={connect}
          busy={connectBusy}
          error={connectError}
          title={`${store.shop_domain} is disconnected`}
          hint="The Shopify access for this store is no longer valid. Reconnect to restore sync and generation."
        />
      </>
    );
  }

  const lastSync = store.last_sync;
  const lastGeneration = store.last_generation;
  return (
    <>
      <ShopifyNav active="overview" />
      <div className="shopify-head">
        <h1 className="page-title">{store.shop_domain}</h1>
        <button type="button" onClick={disconnect}>
          Use a different store
        </button>
      </div>
      <StatCards status={store} />
      <div className="job-grid">
        <JobPanel label="Last catalog sync" job={lastSync} />
        <JobPanel label="Last intent generation" job={lastGeneration} />
      </div>
      {lastSync?.status === "failed" && lastSync.error !== null && (
        <FailurePanel
          reason={lastSync.error.reason}
          detail={lastSync.error.detail}
          onReconnect={async () => {
            await beginDomainInstall(binding.shopDomain);
          }}
          onSync={undefined}
        />
      )}
      {lastGeneration?.status === "failed" && lastGeneration.error !== null && (
        <FailurePanel
          reason={lastGeneration.error.reason}
          detail={lastGeneration.error.detail}
          onReconnect={async () => {
            await beginDomainInstall(binding.shopDomain);
          }}
        />
      )}
      {lastSync === null && (
        <p className="muted">
          No sync has run yet — head to <a href="/shopify/catalog">Catalog</a> to sync your
          products.
        </p>
      )}
    </>
  );
}
