import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { IntentReviewCard } from "../src/app/(dashboard)/shopify/components/intent-review-card";
import { ConnectCard } from "../src/app/(dashboard)/shopify/components/connect-card";
import {
  EmptyPanel,
  ErrorPanel,
  FailurePanel,
  JobPanel,
  LoadingPanel,
  ShopifyNav,
  StatCards,
} from "../src/app/(dashboard)/shopify/components/panels";
import { MappingTable, ProductTable } from "../src/app/(dashboard)/shopify/components/tables";
import {
  DELETED_PRODUCT,
  INTENT_RECORD,
  INVALIDATED_MAPPING,
  MAPPING,
  PRODUCT,
  STORE_STATUS,
} from "./shopify-fixtures";

/**
 * Presentational component states, rendered with react-dom/server: no
 * DOM, no network — the client data path is stubbed at the props
 * boundary with the same wire shapes the API serves (see
 * shopify-fixtures.ts, which the mocked loader tests also reuse).
 */

describe("ShopifyNav", () => {
  it("marks the active page and links the others", () => {
    const html = renderToStaticMarkup(<ShopifyNav active="catalog" />);
    expect(html).toContain("shopify-nav-active");
    expect(html).toContain("Catalog");
    expect(html).toContain('href="/shopify/intents"');
  });
});

describe("states", () => {
  it("loading renders a busy skeleton", () => {
    const html = renderToStaticMarkup(<LoadingPanel label="catalog" />);
    expect(html).toContain('aria-busy="true"');
    expect(html).toContain("skeleton");
  });

  it("empty renders title and hint", () => {
    const html = renderToStaticMarkup(
      <EmptyPanel title="No products synced yet" hint="Run a catalog sync." />,
    );
    expect(html).toContain("No products synced yet");
    expect(html).toContain("Run a catalog sync.");
  });

  it("error renders an alert", () => {
    const html = renderToStaticMarkup(<ErrorPanel message="API unreachable" />);
    expect(html).toContain('role="alert"');
    expect(html).toContain("API unreachable");
  });
});

describe("FailurePanel", () => {
  it("token_expired offers the re-connect recovery", () => {
    const html = renderToStaticMarkup(
      <FailurePanel reason="token_expired" detail="token rejected" onReconnect={() => {}} />,
    );
    expect(html).toContain("Shopify access expired");
    expect(html).toContain("Re-connect store");
  });

  it("no_snapshot offers the sync recovery", () => {
    const html = renderToStaticMarkup(
      <FailurePanel reason="no_snapshot" detail="run a sync first" onSync={() => {}} />,
    );
    expect(html).toContain("Nothing synced yet");
    expect(html).toContain("Run a sync");
  });

  it("generation_empty explains the empty derivation", () => {
    const html = renderToStaticMarkup(<FailurePanel reason="generation_empty" detail="nothing derivable" />);
    expect(html).toContain("Nothing derivable found");
  });
});

describe("JobPanel", () => {
  it("shows never-run when there is no job", () => {
    expect(renderToStaticMarkup(<JobPanel label="Last catalog sync" job={null} />)).toContain(
      "Never run.",
    );
  });

  it("summarizes a complete sync result", () => {
    const html = renderToStaticMarkup(
      <JobPanel label="Last catalog sync" job={STORE_STATUS.last_sync} />,
    );
    expect(html).toContain("badge-APPROVED");
    expect(html).toContain("2 products, 2 pages");
  });

  it("maps a failed generation to its typed copy", () => {
    const html = renderToStaticMarkup(
      <JobPanel
        label="Last intent generation"
        job={{
          ...STORE_STATUS.last_generation!,
          status: "failed",
          error: { reason: "no_snapshot", detail: "no synced catalog snapshots" },
        }}
      />,
    );
    expect(html).toContain("badge-DENIED");
    expect(html).toContain("Nothing synced yet");
  });
});

describe("StatCards", () => {
  it("renders the four counts", () => {
    const html = renderToStaticMarkup(<StatCards status={STORE_STATUS} />);
    expect(html).toContain("Connected");
    expect(html).toContain("2");
    expect(html).toContain("Library intents");
  });

  it("shows Disconnected for an unlinked store", () => {
    const html = renderToStaticMarkup(
      <StatCards status={{ ...STORE_STATUS, connected: false }} />,
    );
    expect(html).toContain("Disconnected");
  });
});

describe("ProductTable", () => {
  it("renders live and deleted rows", () => {
    const html = renderToStaticMarkup(
      <ProductTable products={[PRODUCT, DELETED_PRODUCT]} />,
    );
    expect(html).toContain("SunBeam 1000 Portable Power Station");
    expect(html).toContain("live");
    expect(html).toContain("deleted");
    expect(html).toContain("Discontinued Camp Stove");
  });
});

describe("MappingTable", () => {
  it("renders landing and evidence links plus invalidation state", () => {
    const html = renderToStaticMarkup(
      <MappingTable mappings={[MAPPING, INVALIDATED_MAPPING]} />,
    );
    expect(html).toContain('href="https://www.acme-fixtures-outfitters.com/products/sunbeam-1000-portable-power-station"');
    expect(html).toContain("active");
    expect(html).toContain("invalidated");
  });
});

describe("IntentReviewCard", () => {
  it("renders the intent name, prompts, and not-measured evidence note", () => {
    const html = renderToStaticMarkup(
      <IntentReviewCard
        intent={INTENT_RECORD}
        chip="none"
        prompts={INTENT_RECORD.prompts}
        onApprove={() => {}}
        onSavePrompts={() => {}}
      />,
    );
    expect(html).toContain("LiFePO4 battery runtime");
    expect(html).toContain("how long does a 993wh lifepo4 power station run a fridge");
    expect(html).toContain("not measured");
    expect(html).toContain("Approve");
  });

  it("shows the approved chip and hides the approve button", () => {
    const html = renderToStaticMarkup(
      <IntentReviewCard
        intent={INTENT_RECORD}
        chip="approved"
        prompts={INTENT_RECORD.prompts}
        onApprove={() => {}}
        onSavePrompts={() => {}}
      />,
    );
    expect(html).toContain("badge-APPROVED");
    expect(html).toContain("approved");
    expect(html).not.toContain(">Approve<");
  });
});

describe("ConnectCard", () => {
  it("renders the input and busy state", () => {
    const html = renderToStaticMarkup(
      <ConnectCard onSubmit={() => {}} busy={false} error={null} />,
    );
    expect(html).toContain("Connect your Shopify store");
    expect(html).toContain("myshopify.com");
  });

  it("surfaces a connect error", () => {
    const html = renderToStaticMarkup(
      <ConnectCard onSubmit={() => {}} busy={false} error="No store matches that id" />,
    );
    expect(html).toContain('role="alert"');
    expect(html).toContain("No store matches that id");
  });
});
