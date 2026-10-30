import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, afterEach, describe, expect, it } from "vitest";

import {
  BrandProfileSchema,
  ProductProfileSchema,
} from "@intentvisible/core-schema";

import { UrlExtractor } from "../src/analyze.js";
import { extractProfiles } from "../src/extract/profiles.js";
import { LandingPageProfileSchema, type Evidenced, type LandingPageProfile } from "../src/landing-page.js";
import { LocalFileSnapshotStore } from "../src/snapshot.js";
import type { StoredSnapshot } from "../src/types.js";

import { FakeClock, startFixtureServer, type FixtureRoute, type FixtureServer } from "./helpers.js";

// ---------------------------------------------------------------------------
// Fixture pages (spec: integration tests against fixture snapshots)
// ---------------------------------------------------------------------------

const JSON_LD_PRODUCT_PAGE = `<!doctype html>
<html><head>
<title>BlueYet 500 Portable Power Station | VoltYet</title>
<meta name="description" content="The BlueYet 500 powers fridges, laptops and camping gear overnight.">
<script type="application/ld+json">
{
  "@graph": [
    {
      "@type": "Organization",
      "name": "VoltYet",
      "description": "VoltYet builds portable power stations for overlanders."
    },
    {
      "@type": "BreadcrumbList",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home" },
        { "@type": "ListItem", "position": 2, "name": "Portable Power Stations" }
      ]
    },
    {
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Can the BlueYet 500 run a camping fridge overnight?",
          "acceptedAnswer": { "@type": "Answer", "text": "Yes. The 518Wh cell runs a 45W fridge for roughly 10 hours." }
        }
      ]
    },
    {
      "@type": "Product",
      "name": "BlueYet 500 Portable Power Station",
      "description": "A 518Wh LiFePO4 portable power station for camping and backup power.",
      "sku": "BY500",
      "category": "Portable Power Stations",
      "brand": { "@type": "Brand", "name": "VoltYet" },
      "offers": [
        {
          "@type": "Offer", "name": "BlueYet 500 Light", "sku": "BY500-LIGHT",
          "price": 499.00, "priceCurrency": "AUD", "url": "/products/blueyet-500?variant=light"
        },
        {
          "@type": "Offer", "name": "BlueYet 500 Solar", "sku": "BY500-SOLAR",
          "price": 649.00, "priceCurrency": "AUD", "url": "/products/blueyet-500?variant=solar"
        }
      ],
      "additionalProperty": [
        { "@type": "PropertyValue", "name": "Cell Capacity", "value": 518 },
        { "@type": "PropertyValue", "name": "Cell Chemistry", "value": "LiFePO4" },
        { "@type": "PropertyValue", "name": "Weight", "value": "6.5 kg" }
      ]
    }
  ]
}
</script>
</head>
<body>
<nav><a href="/">Home</a></nav>
<main>
  <h1>BlueYet 500 Portable Power Station</h1>
  <h2>Features</h2>
  <ul>
    <li>518Wh LiFePO4 battery rated for 3000 cycles</li>
    <li>700W pure sine wave inverter</li>
  </ul>
  <h2>Use cases</h2>
  <ul><li>Overnight camping fridge power</li></ul>
  <h2>Compatibility</h2>
  <ul><li>Fits all 12V camping fridges</li></ul>
  <h2>Shipping &amp; Returns</h2>
  <ul><li>Free AU shipping over $99, 30-day returns</li></ul>
  <table>
    <tbody>
      <tr><th>Charge time</th><td>0-80% in 1.5 hours</td></tr>
      <tr><th>Warranty</th><td>5 years</td></tr>
    </tbody>
  </table>
  <details>
    <summary>Does it support solar charging?</summary>
    <p>Yes. Pair it with any 12V panel up to 220W.</p>
  </details>
  <a href="/contact"><button>Check compatibility</button></a>
  <a href="/support"><button>Contact us</button></a>
</main>
</body></html>`;

const META_TAGS_ONLY_PAGE = `<!doctype html>
<html><head>
<title>BlueYet 200 | VoltYet</title>
<meta name="description" content="Compact 210Wh power station for day trips.">
<meta property="og:site_name" content="VoltYet">
<meta property="og:title" content="BlueYet 200">
<meta property="product:price:amount" content="299.00">
<meta property="product:price:currency" content="AUD">
</head>
<body><p>No structured data on this page.</p></body></html>`;

const EMPTY_PAGE = "<!doctype html><html><head></head><body></body></html>";

const BRAND_HOME_PAGE = `<!doctype html>
<html><head>
<title>VoltYet | Portable power for the outdoors</title>
<meta name="description" content="VoltYet builds portable power stations for overlanders.">
<meta property="og:site_name" content="VoltYet">
</head>
<body>
<main><a href="/products/blueyet-500">BlueYet 500 Portable Power Station</a></main>
</body></html>`;

const ROBOTS_DISALLOW_PRODUCTS = "User-agent: *\nDisallow: /products/\n";
const ROBOTS_DISALLOW_ALL = "User-agent: *\nDisallow: /\n";

// ---------------------------------------------------------------------------
// Shared fixture-analysis helpers
// ---------------------------------------------------------------------------

interface AnalyzeFixture {
  server: FixtureServer;
  store: LocalFileSnapshotStore;
  clock: FakeClock;
  extractor: UrlExtractor;
}

async function startExtractor(
  routes: Record<string, string | FixtureRoute>,
  rootDir: string,
): Promise<AnalyzeFixture> {
  const server = await startFixtureServer(routes);
  const store = new LocalFileSnapshotStore(rootDir);
  const clock = new FakeClock();
  const extractor = new UrlExtractor(
    { minRequestIntervalMs: 0, timeoutMs: 2000, maxDepth: 1, maxPages: 5 },
    { clock, fetchImpl: fetch, snapshotStore: store },
  );
  return { server, store, clock, extractor };
}

/** Raw HTML of the fetched page whose snapshot url matches. */
async function rawHtmlFor(store: LocalFileSnapshotStore, refs: StoredSnapshot[], url: string): Promise<string> {
  const match = refs.find((ref) => ref.url === url);
  expect(match, `no snapshot stored for ${url}`).toBeDefined();
  return store.read(match!.storage_ref);
}

/**
 * The no-hallucination property, asserted field by field: every extracted
 * value's text must literally appear in the page snapshot it cites.
 */
function expectValuesAppearInHtml(landingPage: LandingPageProfile, rawHtml: string): void {
  const values: string[] = [];
  const push = (evidenced: Evidenced<unknown> | null): void => {
    if (evidenced) values.push(String(evidenced.value));
  };
  push(landingPage.title);
  push(landingPage.description);
  if (landingPage.price) values.push(String(landingPage.price.value.amount));
  for (const spec of landingPage.specifications) {
    values.push(spec.value.name, spec.value.value);
  }
  for (const faq of landingPage.faqs) {
    values.push(faq.value.question, faq.value.answer);
  }
  for (const cta of landingPage.ctas) values.push(cta.value);
  for (const list of [
    landingPage.features,
    landingPage.use_cases,
    landingPage.compatibility,
    landingPage.shipping_and_returns,
  ]) {
    for (const item of list) values.push(item.value);
  }
  expect(values.length).toBeGreaterThan(0);
  for (const value of values) {
    expect(rawHtml).toContain(value);
  }
}

/** Every evidence URL cites a page the crawl actually fetched. */
function expectEvidenceUrlsWereFetched(profile: { evidence_urls: string[] }, fetchedUrls: string[]): void {
  expect(profile.evidence_urls.length).toBeGreaterThan(0);
  for (const url of profile.evidence_urls) {
    expect(fetchedUrls).toContain(url);
  }
}

// ---------------------------------------------------------------------------
// JSON-LD product page
// ---------------------------------------------------------------------------

describe("extraction from a JSON-LD product page", () => {
  let fixture: AnalyzeFixture;
  let pdpUrl: string;

  beforeEach(async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "url-extractor-jsonld-"));
    fixture = await startExtractor(
      {
        "/robots.txt": "User-agent: *\nAllow: /\n",
        "/": BRAND_HOME_PAGE,
        "/products/blueyet-500": JSON_LD_PRODUCT_PAGE,
      },
      rootDir,
    );
    pdpUrl = `${fixture.server.baseUrl}/products/blueyet-500`;
  });
  afterEach(async () => {
    await fixture.server.close();
  });

  it("produces schema-valid brand, product, and landing profiles with evidence", async () => {
    const outcome = await fixture.extractor.analyzeUrl(`${fixture.server.baseUrl}/`);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // Contract conformance: the core-schema records parse as-is.
    expect(outcome.brand).not.toBeNull();
    expect(outcome.product).not.toBeNull();
    const brand = BrandProfileSchema.parse(outcome.brand);
    const product = ProductProfileSchema.parse(outcome.product);

    expect(brand.name).toBe("VoltYet");
    expect(brand.categories).toContain("Portable Power Stations");
    expect(brand.domain).toBe(new URL(fixture.server.baseUrl).hostname);
    expectEvidenceUrlsWereFetched(brand, [
      `${fixture.server.baseUrl}/`,
      pdpUrl,
    ]);

    expect(product.name).toBe("BlueYet 500 Portable Power Station");
    expect(product.product_id).toBe("product_by500");
    expect(product.url).toBe(pdpUrl);
    // Variants are SKUs; a multi-offer page has no single product price.
    expect(product.skus.map((sku) => sku.sku_id)).toEqual([
      "sku_by500_light",
      "sku_by500_solar",
    ]);
    expect(product.skus[0]?.price).toEqual({ amount: 499, currency: "AUD" });
    expect(product.price).toBeUndefined();
    expect(product.specifications.map((spec) => spec.name)).toEqual([
      "Cell Capacity",
      "Cell Chemistry",
      "Weight",
      "Charge time",
      "Warranty",
    ]);
    // Deterministic extraction never invents these: no page states them.
    expect(brand.personas).toEqual([]);
    expect(brand.pain_points).toEqual([]);
    expect(brand.purchase_barriers).toEqual([]);
    expect(brand.competitor_brands).toEqual([]);
  });

  it("extracts every landing-page field from the page it cites", async () => {
    const outcome = await fixture.extractor.analyzeUrl(`${fixture.server.baseUrl}/`);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const pdpLanding = outcome.landing_pages.find((page) => page.url === pdpUrl);
    expect(pdpLanding).toBeDefined();
    // Contract conformance: the package-local profile parses as-is.
    const landingPage = LandingPageProfileSchema.parse(pdpLanding);

    // The PDP landing page links to both profiles; the home page does not.
    expect(landingPage.product_id).toBe("product_by500");
    expect(landingPage.brand_id).toBe("brand_127_0_0_1");

    expect(landingPage.title?.value).toContain("BlueYet 500");
    expect(landingPage.title?.evidence_url).toBe(pdpUrl);
    expect(landingPage.faqs.length).toBe(2); // FAQPage JSON-LD + <details>
    expect(landingPage.ctas).toEqual([
      expect.objectContaining({ value: "Check compatibility" }),
      expect.objectContaining({ value: "Contact us" }),
    ]);
    expect(landingPage.features.length).toBe(2);
    expect(landingPage.compatibility.length).toBe(1);
    expect(landingPage.shipping_and_returns.length).toBe(1);
    // No product:price meta on the PDP and offers are variants: no price.
    expect(landingPage.price).toBeNull();

    expectValuesAppearInHtml(
      landingPage,
      await rawHtmlFor(fixture.store, outcome.snapshots, pdpUrl),
    );
  });

  it("keeps extraction failures separate from fetch failures", async () => {
    const outcome = await fixture.extractor.analyzeUrl(`${fixture.server.baseUrl}/`);
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // The crawl had zero fetch failures on this fixture.
    expect(outcome.failures).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// Meta-tags-only page
// ---------------------------------------------------------------------------

describe("extraction from a meta-tags-only page", () => {
  let fixture: AnalyzeFixture;

  beforeEach(async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "url-extractor-meta-"));
    fixture = await startExtractor(
      {
        "/robots.txt": "User-agent: *\nAllow: /\n",
        "/products/blueyet-200": META_TAGS_ONLY_PAGE,
      },
      rootDir,
    );
  });
  afterEach(async () => {
    await fixture.server.close();
  });

  it("builds landing + brand evidence from meta tags and no product record", async () => {
    const pdpUrl = `${fixture.server.baseUrl}/products/blueyet-200`;
    const outcome = await fixture.extractor.analyzeUrl(pdpUrl, "product");

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.product).toBeNull();
    expect(outcome.brand).not.toBeNull();
    const brand = BrandProfileSchema.parse(outcome.brand);
    expect(brand.name).toBe("VoltYet"); // og:site_name
    expect(brand.domain).toBe(new URL(fixture.server.baseUrl).hostname);

    const [landingPage] = outcome.landing_pages;
    expect(landingPage).toBeDefined();
    const landing = landingPage!;
    // Page <title> wins over og:title (documented precedence).
    expect(landing.title?.value).toBe("BlueYet 200 | VoltYet");
    expect(landing.description?.value).toContain("day trips");
    expect(landing.price?.value).toEqual({ amount: 299, currency: "AUD" });
    expect(landing.specifications).toEqual([]);
    expect(landing.faqs).toEqual([]);

    expectValuesAppearInHtml(
      landing,
      await rawHtmlFor(fixture.store, outcome.snapshots, pdpUrl),
    );
  });
});

// ---------------------------------------------------------------------------
// Typed failures
// ---------------------------------------------------------------------------

describe("typed pipeline failures", () => {
  let fixture: AnalyzeFixture;

  beforeEach(async () => {
    const rootDir = await mkdtemp(join(tmpdir(), "url-extractor-fail-"));
    fixture = await startExtractor(
      {
        "/robots.txt": ROBOTS_DISALLOW_PRODUCTS,
        "/": BRAND_HOME_PAGE,
        "/products/blueyet-500": JSON_LD_PRODUCT_PAGE,
      },
      rootDir,
    );
  });
  afterEach(async () => {
    await fixture.server.close();
  });

  it("fails with fetch_robots_disallowed when the seed is disallowed, fetching nothing", async () => {
    const allDenied = await startExtractor(
      { "/robots.txt": ROBOTS_DISALLOW_ALL, "/": BRAND_HOME_PAGE },
      await mkdtemp(join(tmpdir(), "url-extractor-denied-")),
    );
    try {
      const outcome = await allDenied.extractor.analyzeUrl(`${allDenied.server.baseUrl}/`);
      expect(outcome).toMatchObject({ ok: false, reason: "fetch_robots_disallowed" });
      if (!outcome.ok) {
        expect(outcome.detail).toContain("robots.txt disallows");
        expect(outcome.snapshots).toEqual([]);
      }
      expect(allDenied.server.requestedPaths).toEqual(["/robots.txt"]);
    } finally {
      await allDenied.server.close();
    }
  });

  it("keeps the brand when a linked PDP is robots-denied mid-crawl", async () => {
    const outcome = await fixture.extractor.analyzeUrl(`${fixture.server.baseUrl}/`);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.failures).toHaveLength(1);
    expect(outcome.failures[0]).toMatchObject({
      reason: "fetch_robots_disallowed",
      url: `${fixture.server.baseUrl}/products/blueyet-500`,
    });
    expect(outcome.product).toBeNull(); // never fetched, never profiled
    expect(outcome.landing_pages.map((page) => page.url)).toEqual([
      `${fixture.server.baseUrl}/`,
    ]);
    // No evidence cites a page that was never fetched.
    if (outcome.brand) {
      expectEvidenceUrlsWereFetched(outcome.brand, [`${fixture.server.baseUrl}/`]);
    }
  });

  it("fails with fetch_unreachable when the seed errors, with no snapshots", async () => {
    const broken = await startExtractor(
      { "/robots.txt": "User-agent: *\nAllow: /\n", "/": { status: 500, body: "boom" } },
      await mkdtemp(join(tmpdir(), "url-extractor-500-")),
    );
    try {
      const outcome = await broken.extractor.analyzeUrl(`${broken.server.baseUrl}/`);
      expect(outcome).toMatchObject({ ok: false, reason: "fetch_unreachable", detail: "HTTP 500" });
      if (!outcome.ok) {
        expect(outcome.snapshots).toEqual([]);
      }
    } finally {
      await broken.server.close();
    }
  });

  it("fails with extraction_empty on an empty page but keeps the snapshot for diagnosis", async () => {
    const blank = await startExtractor(
      { "/robots.txt": "User-agent: *\nAllow: /\n", "/": EMPTY_PAGE },
      await mkdtemp(join(tmpdir(), "url-extractor-empty-")),
    );
    try {
      const outcome = await blank.extractor.analyzeUrl(`${blank.server.baseUrl}/`);
      expect(outcome).toMatchObject({ ok: false, reason: "extraction_empty" });
      if (!outcome.ok) {
        expect(outcome.snapshots).toHaveLength(1);
        const stored = outcome.snapshots[0];
        expect(stored).toBeDefined();
        await expect(blank.store.read(stored!.storage_ref)).resolves.toContain("<html");
      }
    } finally {
      await blank.server.close();
    }
  });
});

// ---------------------------------------------------------------------------
// Pure extraction guard
// ---------------------------------------------------------------------------

describe("extractProfiles", () => {
  it("reports extraction_empty when given no pages", () => {
    const outcome = extractProfiles([], new FakeClock());
    expect(outcome).toMatchObject({ ok: false, reason: "extraction_empty" });
  });
});
