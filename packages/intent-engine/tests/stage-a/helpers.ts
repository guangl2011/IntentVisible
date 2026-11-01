/**
 * Stage A test fixtures and doubles. The fixture site ("VoltYet", a
 * portable-power-station store) is an in-memory page map the fake fetcher
 * serves — no HTTP, no live LLM, no network. Model outputs are recorded-style
 * JSON in the exact shape the modeling prompts demand: every claim cites a
 * fixture URL or carries the assumption flag.
 */

import { hashHtml } from "@intentvisible/url-extractor";
import type {
  FetchOutcome,
  PageSnapshot,
  SnapshotStore,
  StoredSnapshot,
  UrlFetcher,
} from "@intentvisible/url-extractor";
import type { DemandEstimate, DemandTier } from "@intentvisible/core-schema";

import type { SpotCheckAnswer, SpotCheckRunner } from "../../src/stage-a/spot-check.js";
import type { KeywordVolumeSource } from "../../src/stage-a/demand.js";

export const SITE = "https://voltyet.example";

export const HOME_URL = `${SITE}/`;
export const CATALOG_URL = `${SITE}/pages/portable-power-stations`;
export const PRICING_URL = `${SITE}/pages/pricing`;
export const COMPARE_URL = `${SITE}/pages/compare`;
export const FAQ_URL = `${SITE}/pages/faq`;
export const ABOUT_URL = `${SITE}/pages/about`;

/** The registry the fixture model outputs cite — the happy-path crawl fetches all six. */
export const FIXTURE_URLS = [HOME_URL, CATALOG_URL, PRICING_URL, COMPARE_URL, FAQ_URL, ABOUT_URL];

function page(title: string, body: string, jsonLd = "", links: Array<[string, string]> = []): string {
  const nav = links.map(([href, label]) => `<a href="${href}">${label}</a>`).join("");
  return `<!doctype html>
<html><head>
<title>${title} | VoltYet</title>
<meta name="description" content="${title} from VoltYet, portable power stations for camping.">
${jsonLd ? `<script type="application/ld+json">\n${jsonLd}\n</script>` : ""}
</head>
<body>
<nav>${nav}</nav>
<main>
<h1>${title}</h1>
${body}
</main>
</body></html>`;
}

const ORG_JSON_LD = JSON.stringify({
  "@type": "Organization",
  name: "VoltYet",
  description: "VoltYet builds portable power stations for overlanders and campers.",
});

const PRODUCT_JSON_LD = JSON.stringify({
  "@type": "Product",
  name: "VoltYet 500 Portable Power Station",
  description: "A 518Wh LiFePO4 portable power station for camping and backup power.",
  sku: "VY500",
  brand: { "@type": "Brand", name: "VoltYet" },
  offers: [{ "@type": "Offer", name: "VoltYet 500", sku: "VY500", price: 499.0, priceCurrency: "AUD" }],
});

const FAQ_JSON_LD = JSON.stringify({
  "@type": "FAQPage",
  mainEntity: [
    {
      "@type": "Question",
      name: "Can the VoltYet 500 run a camping fridge overnight?",
      acceptedAnswer: {
        "@type": "Answer",
        text: "Yes. The 518Wh cell runs a 45W fridge for roughly 10 hours.",
      },
    },
  ],
});

/** Five linked content pages plus the home page — enough for the three-page evidence floor. */
export function fixtureSitePages(): Map<string, string> {
  const pages = new Map<string, string>();
  pages.set(
    HOME_URL,
    page(
      "VoltYet Portable Power Stations",
      `<h2>Features</h2><ul><li>518Wh LiFePO4 battery rated for 3000 cycles</li><li>700W pure sine wave inverter</li></ul>
<h2>Use cases</h2><ul><li>Overnight camping fridge power</li><li>Weekend off-grid trips</li></ul>`,
      `{"@graph":[${ORG_JSON_LD},${PRODUCT_JSON_LD}]}`,
      [
        [CATALOG_URL, "Portable Power Stations"],
        [PRICING_URL, "Pricing"],
        [COMPARE_URL, "Compare"],
        [FAQ_URL, "FAQ"],
        [ABOUT_URL, "About"],
      ],
    ),
  );
  pages.set(
    CATALOG_URL,
    page(
      "Portable Power Stations",
      "<p>The full VoltYet catalog: the VoltYet 500 and the VoltYet 1000 portable power stations.</p>",
      "",
      [[HOME_URL, "Home"]],
    ),
  );
  pages.set(
    PRICING_URL,
    page(
      "Pricing",
      "<p>The VoltYet 500 costs 499 AUD with free shipping. The VoltYet 1000 costs 899 AUD.</p>",
    ),
  );
  pages.set(
    COMPARE_URL,
    page(
      "Compare VoltYet with RivalOne and RivalTwo",
      "<p>Why choose VoltYet over RivalOne or RivalTwo? VoltYet ships faster and weighs less than either competitor.</p>",
    ),
  );
  pages.set(
    FAQ_URL,
    page("Frequently Asked Questions", "<p>Shipping is free over 99 AUD. Returns are open for 30 days.</p>", FAQ_JSON_LD),
  );
  pages.set(
    ABOUT_URL,
    page(
      "About VoltYet",
      "<p>VoltYet sells direct to campers and overlanders. Why trust us: every power station is certified and carries a 2-year warranty.</p>",
      ORG_JSON_LD,
    ),
  );
  return pages;
}

/**
 * A fixture site whose catalog page links `count` additional item pages —
 * the cap-enforcement fixture (with count 60, the 50-cap crawl must stop
 * at 50 fetched pages and never attempt the 51st).
 */
export function cappedSite(itemCount: number): Map<string, string> {
  const pages = fixtureSitePages();
  const links: Array<[string, string]> = [];
  for (let index = 1; index <= itemCount; index += 1) {
    const url = `${SITE}/catalog/item-${index}`;
    links.push([url, `Item ${index}`]);
    pages.set(url, page(`Catalog Item ${index}`, `<p>Portable power station number ${index}.</p>`));
  }
  const catalogBody =
    "<p>The full VoltYet catalog: the VoltYet 500 and the VoltYet 1000 portable power stations.</p>";
  pages.set(CATALOG_URL, page("Portable Power Stations", catalogBody, "", links));
  return pages;
}

export interface FakeCrawlFetcherOptions {
  pages: ReadonlyMap<string, string>;
  /** URL substrings the fixture robots.txt disallows. */
  disallowed?: string[];
  /** Seed-page final URL after a redirect (simulates off-domain redirect-follow). */
  redirect?: ReadonlyMap<string, string>;
}

/** Stand-in for the v1 UrlFetcher: same fetchPage contract, in-memory pages, full attempt log. */
export class FakeCrawlFetcher implements Pick<UrlFetcher, "fetchPage"> {
  readonly attempted: string[] = [];

  constructor(private readonly options: FakeCrawlFetcherOptions) {}

  async fetchPage(url: string): Promise<FetchOutcome> {
    this.attempted.push(url);
    if (this.options.disallowed?.some((fragment) => url.includes(fragment))) {
      return {
        ok: false,
        failure: { reason: "fetch_robots_disallowed", url, detail: "disallowed by fixture robots.txt" },
      };
    }
    const html = this.options.pages.get(url);
    if (html === undefined) {
      return { ok: false, failure: { reason: "fetch_unreachable", url, detail: "HTTP 404" } };
    }
    const finalUrl = this.options.redirect?.get(url) ?? url;
    const snapshot: PageSnapshot = {
      url: finalUrl,
      status: 200,
      fetched_at: "2026-11-01T00:00:00.000Z",
      content_hash: hashHtml(html),
      raw_html: html,
    };
    return { ok: true, snapshot };
  }
}

/** In-memory SnapshotStore — content-addressed like the local-file driver, no disk. */
export class InMemorySnapshotStore implements SnapshotStore {
  readonly saved: StoredSnapshot[] = [];

  async save(snapshot: PageSnapshot): Promise<StoredSnapshot> {
    const stored: StoredSnapshot = {
      url: snapshot.url,
      content_hash: snapshot.content_hash,
      fetched_at: snapshot.fetched_at,
      storage_ref: `${snapshot.content_hash}.html`,
    };
    this.saved.push(stored);
    return stored;
  }

  async read(storageRef: string): Promise<string> {
    throw new Error(`no fixture snapshot stored under ${storageRef}`);
  }
}

/** Deterministic spot-check double: one scripted answer per prompt index. */
export class FakeSpotCheckRunner implements SpotCheckRunner {
  readonly data_mode = "simulated" as const;
  readonly platform = "fixture-assistant";

  constructor(private readonly answerFor: (index: number) => string) {}

  async run(prompts: string[]): Promise<SpotCheckAnswer[]> {
    return prompts.map((prompt, index) => ({ prompt, answer: this.answerFor(index) }));
  }
}

/**
 * The default probe script: prompts 0-2 recommend the competitor RivalOne,
 * 3-5 recommend VoltYet itself, 6-9 name nobody. Pooled result —
 * visibility 30%, void rate 70% (no competitor recommended in 7 answers),
 * gap open.
 */
export const DEFAULT_SPOT_CHECK_ANSWERS = (index: number): string => {
  if (index % 10 < 3) {
    return "For that I recommend RivalOne — it is the most established option in this space.";
  }
  if (index % 10 < 6) {
    return "I recommend VoltYet — great value for a portable power station.";
  }
  return "You could start with a power station from any large outdoor retailer.";
};

/** Deterministic keyword provider: tier chosen per primary keyword fragment. */
export class FakeKeywordProvider implements KeywordVolumeSource {
  readonly calls: Array<{ keywords: string[]; country: string; language: string }> = [];

  constructor(private readonly tierFor: (keyword: string) => DemandTier) {}

  async aiSearchVolume(
    keywords: string[],
    country: string,
    language: string,
  ): Promise<DemandEstimate[]> {
    this.calls.push({ keywords, country, language });
    return keywords.map((keyword) => ({
      keyword,
      tier: this.tierFor(keyword),
      monthly_volume: null,
      data_mode: "llm_estimated",
      provenance: {
        source: "fixture-keyword-provider",
        retrieved_at: "2026-11-01T00:00:00.000Z",
      },
    }));
  }
}

const SPOT_CHECK_PROMPTS = [
  "What is the best portable power station for camping?",
  "Which power station can run a camping fridge overnight?",
  "What should I look for in a portable power station?",
  "Which brand makes the most reliable power station?",
  "What power station do overlanders use?",
  "Best budget power station for weekend trips?",
  "How do I size a power station for my fridge?",
  "Are portable power stations worth the price?",
  "What is the lightest power station with a 700W inverter?",
  "Which power station brands ship free in Australia?",
];

/** Entity-resolution output in the exact shape the modeling prompt demands — fully cited. */
export function entityResolutionJson(): string {
  return JSON.stringify({
    business_model: "dtc",
    value_proposition: {
      text: "LiFePO4 portable power stations rated for 3000 cycles.",
      evidence_urls: [HOME_URL],
      assumption: false,
    },
    moats: [
      {
        text: "In-house LiFePO4 cell assembly rated for 3000 cycles.",
        evidence_urls: [ABOUT_URL],
        assumption: false,
      },
    ],
    competitors: [
      {
        name: "RivalOne",
        relation: "direct",
        claims: [{ text: "RivalOne is the incumbent brand campers compare us with.", evidence_urls: [COMPARE_URL] }],
        evidence_urls: [COMPARE_URL],
      },
      {
        name: "RivalTwo",
        relation: "direct",
        claims: [{ text: "RivalTwo competes on price in the same catalog.", evidence_urls: [COMPARE_URL] }],
        evidence_urls: [COMPARE_URL],
      },
      {
        name: "BigBox Power",
        relation: "indirect",
        claims: [{ text: "Big-box retailers sell generic power stations.", evidence_urls: [COMPARE_URL] }],
        evidence_urls: [COMPARE_URL],
      },
      {
        name: "EcoFlow",
        relation: "direct",
        claims: [{ text: "EcoFlow is frequently mentioned in camping forums.", evidence_urls: [FAQ_URL] }],
        evidence_urls: [FAQ_URL],
      },
      {
        name: "Jackery",
        relation: "direct",
        claims: [{ text: "Jackery leads shelf presence at outdoor retailers.", evidence_urls: [FAQ_URL] }],
        evidence_urls: [FAQ_URL],
      },
      {
        name: "Anker Solix",
        relation: "direct",
        claims: [{ text: "Anker Solix bundles solar panels at big-box retailers.", evidence_urls: [CATALOG_URL] }],
        evidence_urls: [CATALOG_URL],
      },
    ],
    spot_check_prompts: SPOT_CHECK_PROMPTS,
  });
}

/** Personas-modeling output: three MECE personas and three fully-cited topics. */
export function personasModelingJson(): string {
  return JSON.stringify({
    personas: [
      {
        archetype: "The Weekend Overlander",
        demographics: {
          text: "Camps most weekends near country AU, ages 30-45.",
          evidence_urls: [CATALOG_URL],
        },
        core_frustrations: [
          { text: "Advertised runtime claims never survive a real camping fridge.", evidence_urls: [FAQ_URL] },
        ],
        cognitive_biases: [
          { text: "Distrusts watt-hour numbers that look rounded and unrealistically large.", evidence_urls: [CATALOG_URL] },
        ],
        decision_triggers: [
          { text: "A failed fridge battery on a trip sends them shopping the next morning.", evidence_urls: [FAQ_URL] },
        ],
        ai_language_fingerprint: {
          text: "Asks in plain, urgent English about runtime and weight.",
          evidence_urls: [CATALOG_URL],
        },
        scenarios: [
          {
            scenario_type: "daily_pain",
            description: { text: "Recharges phones and the camp fridge every evening off one unit.", evidence_urls: [CATALOG_URL] },
          },
          {
            scenario_type: "acute_trigger",
            description: { text: "The 12V fridge kills the car battery on night one.", evidence_urls: [FAQ_URL] },
          },
          {
            scenario_type: "final_shelf_comparison",
            description: { text: "Compares the VoltYet 500 and RivalOne side by side on weight.", evidence_urls: [COMPARE_URL] },
          },
        ],
      },
      {
        archetype: "The Tradesite Foreman",
        demographics: {
          text: "Runs small crews on sites without grid power.",
          evidence_urls: [ABOUT_URL],
        },
        core_frustrations: [
          { text: "Generators are loud, banned on some sites, and need fuel runs.", evidence_urls: [ABOUT_URL] },
        ],
        cognitive_biases: [
          { text: "Trusts warranty length as a proxy for durability.", evidence_urls: [ABOUT_URL] },
        ],
        decision_triggers: [
          { text: "A noise complaint from a site manager forces a quieter option.", evidence_urls: [ABOUT_URL] },
        ],
        ai_language_fingerprint: {
          text: "Asks about certifications, warranty, and tool compatibility.",
          evidence_urls: [ABOUT_URL],
        },
        scenarios: [
          {
            scenario_type: "daily_pain",
            description: { text: "Runs a kettle and charge packs through a full shift.", evidence_urls: [PRICING_URL] },
          },
          {
            scenario_type: "acute_trigger",
            description: { text: "A generator ban on site lands the week before a deadline.", evidence_urls: [PRICING_URL] },
          },
          {
            scenario_type: "final_shelf_comparison",
            description: { text: "Weighs warranty terms against RivalTwo's cheaper unit.", evidence_urls: [PRICING_URL] },
          },
        ],
      },
      {
        archetype: "The Backup-Prepared Homeowner",
        demographics: {
          text: "Suburban household preparing for summer blackouts.",
          evidence_urls: [FAQ_URL],
        },
        core_frustrations: [
          { text: "Blackouts spoil fridge food two or three times a summer.", evidence_urls: [FAQ_URL] },
        ],
        cognitive_biases: [
          { text: "Assumes bigger brands mean safer charging electronics.", evidence_urls: [FAQ_URL] },
        ],
        decision_triggers: [
          { text: "The first blackout of the season triggers same-week research.", evidence_urls: [FAQ_URL] },
        ],
        ai_language_fingerprint: {
          text: "Asks about blackout runtime and home-device compatibility.",
          evidence_urls: [FAQ_URL],
        },
        scenarios: [
          {
            scenario_type: "daily_pain",
            description: { text: "Keeps the unit on a trickle charger in the garage.", evidence_urls: [CATALOG_URL] },
          },
          {
            scenario_type: "acute_trigger",
            description: { text: "A storm blackout knocks the fridge out at dinner time.", evidence_urls: [CATALOG_URL] },
          },
          {
            scenario_type: "final_shelf_comparison",
            description: { text: "Compares capacity per dollar across the VoltYet and BigBox Power lines.", evidence_urls: [COMPARE_URL] },
          },
        ],
      },
    ],
    intent_topics: [
      {
        intent_name: "portable power station for camping",
        buyer_stage: "Solution Research",
        intent_category: "Solution Research",
        keywords: ["portable power station for camping", "camping power station"],
        fit: { score: 0.85, evidence_urls: [CATALOG_URL] },
        evidence_urls: [CATALOG_URL, HOME_URL],
      },
      {
        intent_name: "power station price comparison",
        buyer_stage: "Vendor Evaluation",
        intent_category: "Pricing",
        keywords: ["power station price comparison", "cheapest portable power station"],
        fit: { score: 0.6, evidence_urls: [PRICING_URL] },
        evidence_urls: [PRICING_URL, COMPARE_URL],
      },
      {
        intent_name: "quiet generator alternative for campsites",
        buyer_stage: "Problem Discovery",
        intent_category: "Pain Point",
        keywords: ["quiet generator alternative", "generator ban campsites"],
        fit: { score: 0.45, mismatch_reason: "VoltYet does not market against generators on the site today.", evidence_urls: [FAQ_URL] },
        evidence_urls: [FAQ_URL, ABOUT_URL],
      },
    ],
  });
}
