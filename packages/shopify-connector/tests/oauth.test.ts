import { describe, expect, it } from "vitest";

import type { ShopifyConnectorError } from "../src/errors.js";
import { isShopifyConnectorError } from "../src/errors.js";
import {
  buildInstallUrl,
  exchangeCodeForToken,
  verifyOAuthCallback,
  type PostJson,
} from "../src/oauth.js";
import { signCallbackQuery, TEST_STORE } from "./helpers.js";

/** Callback params as Shopify sends them (before the hmac is appended). */
function callbackQuery(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    code: "authorization_code_fixture",
    host: "admin.shopify.com/store/acme-fixtures",
    shop: TEST_STORE.shopDomain,
    state: "nonce_fixture_1",
    timestamp: "1730000000",
    ...overrides,
  };
}

function signedCallbackQuery(overrides: Record<string, string> = {}): Record<string, string> {
  const query = callbackQuery(overrides);
  return { ...query, hmac: signCallbackQuery(query, TEST_STORE.clientSecret) };
}

describe("buildInstallUrl", () => {
  it("builds the authorize URL with the locked least-privilege scopes", () => {
    const { installUrl, state } = buildInstallUrl(TEST_STORE, "nonce_abc");

    const url = new URL(installUrl);
    expect(url.origin).toBe(`https://${TEST_STORE.shopDomain}`);
    expect(url.pathname).toBe("/admin/oauth/authorize");
    expect(url.searchParams.get("client_id")).toBe(TEST_STORE.clientId);
    // Least privilege is structural: exactly the locked scopes, no way to widen.
    expect(url.searchParams.get("scope")).toBe(
      "read_products,read_online_store_pages",
    );
    expect(url.searchParams.get("redirect_uri")).toBe(TEST_STORE.redirectUri);
    expect(url.searchParams.get("state")).toBe("nonce_abc");
    expect(state).toBe("nonce_abc");
  });

  it("generates a nonce when none is provided", () => {
    const { state } = buildInstallUrl(TEST_STORE);
    expect(state).not.toBe("");
  });

  it("rejects a shop domain that is not a myshopify domain", () => {
    const badConfig = { ...TEST_STORE, shopDomain: "https://evil.example.com" };
    expect(() => buildInstallUrl(badConfig, "nonce_abc")).toThrowError(
      /myshopify\.com/,
    );
  });
});

describe("verifyOAuthCallback", () => {
  it("accepts a legitimate callback (valid state nonce and HMAC)", () => {
    const verified = verifyOAuthCallback(TEST_STORE, {
      query: signedCallbackQuery(),
      expectedState: "nonce_fixture_1",
    });
    expect(verified.code).toBe("authorization_code_fixture");
    expect(verified.shopDomain).toBe(TEST_STORE.shopDomain);
    expect(verified.state).toBe("nonce_fixture_1");
  });

  it("matches the docs' canonical HMAC construction (golden vector)", () => {
    // Independent vector: message "code=abc&shop=x.myshopify.com&state=y",
    // secret "s" — locks the sort/exclude/join rules against drift.
    const query = { code: "abc", shop: "x.myshopify.com", state: "y", hmac: "PLACEHOLDER" };
    const expected = "d661d2aa51fcbaf22974d61aa078d3ce8efe55bf7c6410b66491c806a91469fd";
    expect(signCallbackQuery(query, "s")).toBe(expected);
  });

  it("rejects a tampered state with state_mismatch", () => {
    try {
      verifyOAuthCallback(TEST_STORE, {
        query: signedCallbackQuery({ state: "attacker_state" }),
        expectedState: "nonce_fixture_1",
      });
      expect.unreachable("expected state_mismatch");
    } catch (error) {
      expect(isShopifyConnectorError(error)).toBe(true);
      expect((error as ShopifyConnectorError).code).toBe("state_mismatch");
    }
  });

  it("rejects a callback with no state parameter", () => {
    const query = signedCallbackQuery();
    delete query.state;
    try {
      verifyOAuthCallback(TEST_STORE, { query, expectedState: "nonce_fixture_1" });
      expect.unreachable("expected state_mismatch");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("state_mismatch");
    }
  });

  it("rejects a replayed callback with state_mismatch", () => {
    const query = signedCallbackQuery();
    // First verification consumes the caller's single-use nonce...
    verifyOAuthCallback(TEST_STORE, { query, expectedState: "nonce_fixture_1" });
    // ...a replay finds no pending nonce and must be rejected, typed.
    try {
      verifyOAuthCallback(TEST_STORE, { query, expectedState: undefined });
      expect.unreachable("expected state_mismatch");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("state_mismatch");
      expect((error as ShopifyConnectorError).message).toMatch(/replay/i);
    }
  });

  it("rejects a bad HMAC with hmac_rejected", () => {
    const query = signedCallbackQuery();
    const hmac = query.hmac;
    if (hmac === undefined) throw new Error("fixture callback must carry an hmac");
    const flipped = hmac.endsWith("0") ? `${hmac.slice(0, -1)}1` : `${hmac.slice(0, -1)}0`;
    try {
      verifyOAuthCallback(TEST_STORE, {
        query: { ...query, hmac: flipped },
        expectedState: "nonce_fixture_1",
      });
      expect.unreachable("expected hmac_rejected");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("hmac_rejected");
    }
  });

  it("rejects a missing hmac parameter with hmac_rejected", () => {
    const query = callbackQuery();
    try {
      verifyOAuthCallback(TEST_STORE, { query, expectedState: "nonce_fixture_1" });
      expect.unreachable("expected hmac_rejected");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("hmac_rejected");
    }
  });

  it("rejects injected extra parameters (all params are covered by the digest)", () => {
    // Attacker appends a parameter to an otherwise validly signed callback.
    const query = signedCallbackQuery();
    const injected = { ...query, attacker_param: "injected" };
    try {
      verifyOAuthCallback(TEST_STORE, { query: injected, expectedState: "nonce_fixture_1" });
      expect.unreachable("expected hmac_rejected");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("hmac_rejected");
    }
  });

  it("rejects a callback for a different shop (re-signed, so HMAC-valid)", () => {
    const query = signedCallbackQuery({ shop: "other-store.myshopify.com" });
    try {
      verifyOAuthCallback(TEST_STORE, { query, expectedState: "nonce_fixture_1" });
      expect.unreachable("expected state_mismatch");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("state_mismatch");
    }
  });

  it("rejects a non-myshopify shop value", () => {
    const query = signedCallbackQuery({ shop: "phish.example.com" });
    try {
      verifyOAuthCallback(TEST_STORE, { query, expectedState: "nonce_fixture_1" });
      expect.unreachable("expected state_mismatch");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("state_mismatch");
    }
  });

  it("rejects a signed callback that carries no authorization code", () => {
    // The merchant declined consent: Shopify signs a callback without a code.
    const query = callbackQuery();
    delete query.code;
    const signed = { ...query, hmac: signCallbackQuery(query, TEST_STORE.clientSecret) };
    try {
      verifyOAuthCallback(TEST_STORE, { query: signed, expectedState: "nonce_fixture_1" });
      expect.unreachable("expected oauth_failed");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("oauth_failed");
    }
  });
});

describe("exchangeCodeForToken", () => {
  const successResponse = {
    status: 200,
    text: JSON.stringify({
      access_token: "shpat_fixture_token",
      scope: "read_products,read_online_store_pages",
    }),
  };

  function postJsonFixture(response: { status: number; text: string }): {
    postJson: PostJson;
    calls: { url: string; body: Record<string, unknown> }[];
  } {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    return {
      postJson: async (url, body) => {
        calls.push({ url, body: JSON.parse(body) as Record<string, unknown> });
        return response;
      },
      calls,
    };
  }

  it("exchanges the code for an offline token and parses granted scopes", async () => {
    const { postJson, calls } = postJsonFixture(successResponse);
    const token = await exchangeCodeForToken(TEST_STORE, "authorization_code_fixture", {
      postJson,
    });

    expect(token.accessToken).toBe("shpat_fixture_token");
    expect(token.scopes).toEqual(["read_products", "read_online_store_pages"]);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe(
      `https://${TEST_STORE.shopDomain}/admin/oauth/access_token`,
    );
    // The request carries the required OAuth fields; the secret's VALUE is
    // never asserted or logged — only its key's presence.
    expect(Object.keys(calls[0]?.body ?? {})).toEqual(
      expect.arrayContaining(["client_id", "client_secret", "code"]),
    );
    expect(calls[0]?.body["code"]).toBe("authorization_code_fixture");
  });

  it("surfaces a rejected exchange as oauth_failed", async () => {
    const { postJson } = postJsonFixture({
      status: 400,
      text: JSON.stringify({ error: "invalid_request", error_description: "code already redeemed" }),
    });
    try {
      await exchangeCodeForToken(TEST_STORE, "authorization_code_fixture", { postJson });
      expect.unreachable("expected oauth_failed");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("oauth_failed");
      expect((error as ShopifyConnectorError).message).toMatch(/already redeemed/);
    }
  });

  it("surfaces a transport failure as oauth_failed", async () => {
    try {
      await exchangeCodeForToken(TEST_STORE, "authorization_code_fixture", {
        postJson: async () => {
          throw new Error("ECONNREFUSED");
        },
      });
      expect.unreachable("expected oauth_failed");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("oauth_failed");
      expect((error as ShopifyConnectorError).message).toMatch(/ECONNREFUSED/);
    }
  });

  it("rejects a 200 response without an access token", async () => {
    const { postJson } = postJsonFixture({
      status: 200,
      text: JSON.stringify({ scope: "read_products" }),
    });
    try {
      await exchangeCodeForToken(TEST_STORE, "authorization_code_fixture", { postJson });
      expect.unreachable("expected oauth_failed");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("oauth_failed");
    }
  });
});
