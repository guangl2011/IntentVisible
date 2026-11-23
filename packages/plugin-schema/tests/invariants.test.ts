import { beforeEach, describe, expect, it } from "vitest";

import {
  CommissionEntryContract,
  OrderAttributionContract,
  VisibilitySnapshotContract,
  type VisibilitySnapshot,
} from "../src/contracts.js";
import { buildDemoSeed, parseStored, seedPluginDb } from "../src/seed.js";
import {
  aiReferralSessions,
  commissionEntries,
  orders,
  visibilitySnapshots,
} from "../src/schema.js";
import { migratePluginDb, openPluginDb, type PluginDb } from "../src/index.js";

let db: PluginDb;

beforeEach(async () => {
  db = openPluginDb(":memory:");
  await migratePluginDb(db);
  await seedPluginDb(db);
});

describe("measurement boundary (no fabricated numbers)", () => {
  let byIntent: Map<string, VisibilitySnapshot>;

  beforeEach(() => {
    byIntent = new Map<string, VisibilitySnapshot>();
    for (const row of buildDemoSeed().intentUnits) {
      const raw = buildDemoSeed().visibilityByIntent[row.intentId];
      byIntent.set(row.intentId, VisibilitySnapshotContract.parse(raw));
    }
  });

  it("leaves the not_measured unit null across the board", () => {
    const snapshot = byIntent.get("intent_solar_sizing");
    expect(snapshot?.measurement_status).toBe("not_measured");
    expect(snapshot?.measurement_kind).toBeNull();
    expect(snapshot?.source_engines).toBeNull();
    expect(snapshot?.measurement_window_start).toBeNull();
    expect(snapshot?.measurement_window_end).toBeNull();
    expect(snapshot?.visibility_pct).toBeNull();
    expect(snapshot?.measurement_source).toBeNull();
  });

  it("the plugin model has no search-volume field anywhere to fabricate", () => {
    // Schema shape assertion: no table exposes a search-volume column.
    for (const table of [visibilitySnapshots]) {
      expect(Object.keys(table).map((k) => k.toLowerCase())).not.toContain("searchvolume");
    }
    // Contract shape assertion: strictObject rejects a planted field.
    const snapshot = byIntent.get("intent_solar_sizing");
    const planted = { ...snapshot, monthly_search_volume: 1200 };
    expect(VisibilitySnapshotContract.safeParse(planted).success).toBe(false);
  });

  it("rejects measured values on a not_measured snapshot", () => {
    const snapshot = byIntent.get("intent_solar_sizing");
    expect(
      VisibilitySnapshotContract.safeParse({ ...snapshot, visibility_pct: 33.3 }).success,
    ).toBe(false);
  });

  it("rejects an unmeasured snapshot that claims engine provenance", () => {
    const snapshot = byIntent.get("intent_solar_sizing");
    expect(
      VisibilitySnapshotContract.safeParse({ ...snapshot, source_engines: ["chatgpt.com"] })
        .success,
    ).toBe(false);
  });

  it("labels the single-day snapshot so the UI can distinguish it from rolling windows", () => {
    const singleDay = byIntent.get("intent_how_long_fridge");
    expect(singleDay?.measurement_kind).toBe("single_day");
    expect(singleDay?.measurement_window_start).not.toBeNull();
    expect(singleDay?.measurement_window_end).not.toBeNull();
    expect(singleDay?.measurement_window_start).toBe(singleDay?.measurement_window_end);

    for (const [intentId, snapshot] of byIntent) {
      if (snapshot.measurement_kind !== "rolling") {
        continue;
      }
      const { measurement_window_start: start, measurement_window_end: end } = snapshot;
      expect(start !== null && end !== null && start < end, `${intentId} rolling window must span days`).toBe(true);
    }
  });

  it("requires engine provenance and a window on every measured snapshot", () => {
    for (const [intentId, snapshot] of byIntent) {
      if (snapshot.measurement_status === "not_measured") {
        continue;
      }
      expect(snapshot.source_engines?.length ?? 0, `${intentId} must name engines`).toBeGreaterThan(
        0,
      );
      expect(snapshot.measurement_window_start, `${intentId} must have a window`).not.toBeNull();
      expect(snapshot.measurement_window_end, `${intentId} must have a window`).not.toBeNull();
      expect(snapshot.measurement_source, `${intentId} must name its source`).not.toBeNull();
    }
  });
});

describe("commission ledger invariants", () => {
  type LedgerRow = {
    id: number;
    orderId: string;
    payload: string;
  };

  let rows: LedgerRow[];

  beforeEach(async () => {
    const result = await db.select().from(commissionEntries);
    rows = result.map((r) => ({ id: r.id, orderId: r.orderId, payload: r.payload }));
  });

  it("keeps rates inside the locked 5–20% band", () => {
    for (const row of rows) {
      const entry = parseStored(CommissionEntryContract, row.payload);
      expect(entry.rate).toBeGreaterThanOrEqual(0.05);
      expect(entry.rate).toBeLessThanOrEqual(0.2);
    }
  });

  it("records refunds as negative offset rows tied to the original entry", () => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const refunds = rows.filter(
      (r) => parseStored(CommissionEntryContract, r.payload).entry_type === "refund_offset",
    );
    expect(refunds.length).toBeGreaterThanOrEqual(1);
    for (const refund of refunds) {
      const entry = parseStored(CommissionEntryContract, refund.payload);
      expect(entry.amount).toBeLessThan(0);
      expect(entry.offsets_entry_id).not.toBeNull();
      const original = byId.get(entry.offsets_entry_id as number);
      expect(original, "offset must reference an existing commission entry").toBeDefined();
      expect(original?.orderId).toBe(refund.orderId);
      const originalEntry = parseStored(CommissionEntryContract, original?.payload ?? "");
      expect(originalEntry.entry_type).toBe("commission");
      // The offset cancels the original commission exactly.
      expect(entry.amount + originalEntry.amount).toBe(0);
    }
  });

  it("never bills an unattributed order", async () => {
    const allOrders = await db.select().from(orders);
    const unattributed = allOrders.filter(
      (o) =>
        parseStored(OrderAttributionContract, o.attribution).attribution_basis === "unattributed",
    );
    expect(unattributed.length).toBeGreaterThanOrEqual(1);
    for (const order of unattributed) {
      expect(
        rows.some((r) => r.orderId === order.orderId),
        `unattributed order ${order.orderId} must have no commission row`,
      ).toBe(false);
    }
  });

  it("nets to a non-negative total per order", () => {
    const totals = new Map<string, number>();
    for (const row of rows) {
      const entry = parseStored(CommissionEntryContract, row.payload);
      totals.set(row.orderId, (totals.get(row.orderId) ?? 0) + entry.amount);
    }
    for (const [orderId, total] of totals) {
      expect(total, `order ${orderId} ledger must net non-negative`).toBeGreaterThanOrEqual(0);
    }
  });
});

describe("ai-referral session provenance", () => {
  it("marks sessions only with the known engine sources", async () => {
    const sessions = await db.select().from(aiReferralSessions);
    expect(sessions.length).toBeGreaterThanOrEqual(3);
    const known = new Set(["chatgpt.com", "gemini", "perplexity"]);
    for (const session of sessions) {
      expect(known.has(session.source), `unknown source ${session.source}`).toBe(true);
    }
    const distinct = new Set(sessions.map((s) => s.source));
    expect(distinct.size).toBe(3);
  });
});
