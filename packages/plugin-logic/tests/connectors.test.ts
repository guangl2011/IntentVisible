import { describe, expect, it } from "vitest";

import { ConnectorStubError, PrivateDataRoutingError } from "../src/errors.js";
import { DeterministicNangoStub } from "../src/connectors/nango.js";
import {
  DeterministicTregtoStub,
  assertNotMerchantPrivate,
} from "../src/connectors/tregto.js";

describe("Nango stub (merchant-private OAuth, nango.proxy())", () => {
  const stub = new DeterministicNangoStub([
    {
      request: {
        providerConfigKey: "google-ga4",
        connectionId: "conn_123",
        method: "GET",
        path: "/reports/overview",
      },
      response: { status: 200, data: { sessions: 1234 } },
    },
    {
      request: {
        providerConfigKey: "meta-ads",
        connectionId: "conn_123",
        method: "POST",
        path: "/campaigns/42",
      },
      response: { status: 200, data: { paused: true } },
    },
  ]);

  it("serves recorded private-report fixtures through proxy()", async () => {
    const response = await stub.proxy({
      providerConfigKey: "google-ga4",
      connectionId: "conn_123",
      method: "GET",
      path: "/reports/overview",
    });
    expect(response.status).toBe(200);
    expect(response.data).toEqual({ sessions: 1234 });
  });

  it("serves authorized write actions through authorizedWrite()", async () => {
    const response = await stub.authorizedWrite({
      providerConfigKey: "meta-ads",
      connectionId: "conn_123",
      method: "POST",
      path: "/campaigns/42",
    });
    expect(response.data).toEqual({ paused: true });
  });

  it("refuses authorizedWrite with a GET", async () => {
    await expect(
      stub.authorizedWrite({
        providerConfigKey: "meta-ads",
        connectionId: "conn_123",
        method: "GET",
        path: "/campaigns/42",
      }),
    ).rejects.toThrow(ConnectorStubError);
  });

  it("throws on unrecorded paths instead of fabricating provider data", async () => {
    await expect(
      stub.proxy({
        providerConfigKey: "google-ga4",
        connectionId: "conn_123",
        method: "GET",
        path: "/reports/unknown",
      }),
    ).rejects.toThrow(ConnectorStubError);
  });

  it("is deterministic — repeated calls return identical payloads", async () => {
    const request = {
      providerConfigKey: "google-ga4",
      connectionId: "conn_123",
      method: "GET" as const,
      path: "/reports/overview",
    };
    const [a, b] = await Promise.all([stub.proxy(request), stub.proxy(request)]);
    expect(b).toEqual(a);
  });
});

describe("treg.to stub (public intelligence, developer key, pay-per-call)", () => {
  const makeStub = () =>
    new DeterministicTregtoStub("dev_key_phase1", [
      {
        request: { kind: "meta_ad_library", query: "portable power station" },
        payload: { active_creatives: 37 },
      },
    ]);

  it("requires a developer key", () => {
    expect(() => new DeterministicTregtoStub("", [])).toThrow(ConnectorStubError);
  });

  it("serves recorded public-intel fixtures labeled simulated", async () => {
    const result = await makeStub().fetchIntel({
      kind: "meta_ad_library",
      query: "portable power station",
    });
    expect(result.payload).toEqual({ active_creatives: 37 });
    expect(result.data_mode).toBe("simulated");
  });

  it("throws on unrecorded queries instead of fabricating intel", async () => {
    await expect(
      makeStub().fetchIntel({ kind: "google_trends", query: "never recorded" }),
    ).rejects.toThrow(ConnectorStubError);
  });

  it("meters calls for pay-per-call accounting", async () => {
    const stub = makeStub();
    const request = { kind: "meta_ad_library" as const, query: "portable power station" };
    expect(stub.getCallsMade()).toBe(0);
    await stub.fetchIntel(request);
    await stub.fetchIntel(request);
    expect(stub.getCallsMade()).toBe(2);
  });
});

describe("treg.to isolation — private merchant data never routes through it (design §1.5)", () => {
  it("rejects a public-intel request carrying a shop id", async () => {
    const stub = new DeterministicTregtoStub("dev_key", [
      { request: { kind: "meta_ad_library", query: "x" }, payload: null },
    ]);
    // A caller trying to smuggle merchant tenancy into the public path:
    await expect(
      stub.fetchIntel({
        kind: "meta_ad_library",
        // A caller bypassing the type to smuggle merchant tenancy into the
        // public path:
        query: { shop_id: "shop_demo", note: "orders" } as unknown as string,
      }),
    ).rejects.toThrow(PrivateDataRoutingError);
  });

  it("assertNotMerchantPrivate rejects nested tenancy markers", () => {
    expect(() =>
      assertNotMerchantPrivate({ kind: "keyword_intel", nested: { connectionId: "conn_1" } }),
    ).toThrow(PrivateDataRoutingError);
    expect(() => assertNotMerchantPrivate({ shopDomain: "demo.myshopify.com" })).toThrow(
      PrivateDataRoutingError,
    );
  });

  it("lets genuinely public requests through", () => {
    expect(() =>
      assertNotMerchantPrivate({ kind: "google_trends", query: "solar generator" }),
    ).not.toThrow();
  });

  it("rejects a Nango-shaped private request at the treg.to boundary", () => {
    // The Nango proxy request shape carries connectionId — a tenancy
    // marker — so even a mistyped hand-off cannot cross the boundary.
    expect(() =>
      assertNotMerchantPrivate({
        providerConfigKey: "google-ga4",
        connectionId: "conn_123",
        method: "GET",
        path: "/reports/overview",
      }),
    ).toThrow(PrivateDataRoutingError);
  });
});
