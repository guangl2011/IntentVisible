import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { isShopifyConnectorError } from "../src/errors.js";
import type { ShopifyConnectorError } from "../src/errors.js";
import {
  isSupportedWebhookTopic,
  verifyWebhook,
  WEBHOOK_TOPICS,
  type WebhookVerificationInput,
} from "../src/webhooks.js";
import { TEST_STORE } from "./helpers.js";

const BODY = JSON.stringify({
  id: 98765432100,
  title: "Tungsten Weighted Blanket",
  handle: "tungsten-weighted-blanket",
});

/** Independent from the implementation under test: the documented
 * webhook signature — base64 HMAC-SHA256 of the raw body bytes. */
function expectedSignature(body: string | Buffer, secret = TEST_STORE.clientSecret): string {
  return createHmac("sha256", secret).update(body).digest("base64");
}

function delivery(overrides: Partial<WebhookVerificationInput> = {}): WebhookVerificationInput {
  return {
    clientSecret: TEST_STORE.clientSecret,
    headers: {
      "X-Shopify-Topic": "products/update",
      "X-Shopify-Shop-Domain": TEST_STORE.shopDomain,
      "X-Shopify-Webhook-Id": "b9c4dfg7-1111-2222-3333-444455556666",
      "X-Shopify-Hmac-Sha256": expectedSignature(BODY),
    },
    rawBody: BODY,
    ...overrides,
  };
}

describe("verifyWebhook", () => {
  it("lets a correctly signed webhook reach processing with its envelope", () => {
    const verified = verifyWebhook(delivery());

    expect(verified.topic).toBe("products/update");
    expect(verified.shopDomain).toBe(TEST_STORE.shopDomain);
    expect(verified.webhookId).toBe("b9c4dfg7-1111-2222-3333-444455556666");
    expect(verified.payload).toEqual(JSON.parse(BODY));
  });

  it("verifies over raw body bytes with non-ASCII content (UTF-8 fidelity)", () => {
    const body = Buffer.from(
      JSON.stringify({ id: 1, title: "Tungsten Blanket — café résumé ⑤" }),
      "utf8",
    );
    const verified = verifyWebhook(delivery({ rawBody: body, headers: { ...delivery().headers, "X-Shopify-Hmac-Sha256": expectedSignature(body) } }));
    expect((verified.payload as { title: string }).title).toContain("café");
  });

  it("rejects a mutated body with hmac_rejected", () => {
    const tampered = BODY.replace("Tungsten", "Tungstun");
    try {
      verifyWebhook(delivery({ rawBody: tampered }));
      expect.unreachable("expected hmac_rejected");
    } catch (error) {
      expect(isShopifyConnectorError(error)).toBe(true);
      expect((error as ShopifyConnectorError).code).toBe("hmac_rejected");
      expect((error as ShopifyConnectorError).message).toMatch(/HMAC mismatch/);
    }
  });

  it("rejects a missing HMAC header with hmac_rejected", () => {
    const unsigned: Record<string, string> = { ...delivery().headers };
    delete unsigned["X-Shopify-Hmac-Sha256"];
    try {
      verifyWebhook(delivery({ headers: unsigned }));
      expect.unreachable("expected hmac_rejected");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("hmac_rejected");
      expect((error as ShopifyConnectorError).message).toMatch(/no x-shopify-hmac-sha256 header/i);
    }
  });

  it("rejects an empty HMAC header with hmac_rejected", () => {
    try {
      verifyWebhook(delivery({ headers: { ...delivery().headers, "X-Shopify-Hmac-Sha256": "  " } }));
      expect.unreachable("expected hmac_rejected");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("hmac_rejected");
    }
  });

  it("rejects a signature from a different secret with hmac_rejected", () => {
    try {
      verifyWebhook(
        delivery({ headers: { ...delivery().headers, "X-Shopify-Hmac-Sha256": expectedSignature(BODY, "another-app-secret") } }),
      );
      expect.unreachable("expected hmac_rejected");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("hmac_rejected");
    }
  });

  it("rejects a body whose re-serialization no longer matches the signature", () => {
    // Same data, different bytes (pretty-printed) — proof the HMAC binds
    // the exact body, not the JSON value.
    const reserialized = JSON.stringify(JSON.parse(BODY), null, 2);
    expect(reserialized).not.toBe(BODY);
    try {
      verifyWebhook(delivery({ rawBody: reserialized }));
      expect.unreachable("expected hmac_rejected");
    } catch (error) {
      expect((error as ShopifyConnectorError).code).toBe("hmac_rejected");
    }
  });

  it("verifies deliveries signed for Buffer bodies (raw-byte HMAC, not string)", () => {
    const body = Buffer.from(BODY, "utf8");
    const verified = verifyWebhook(delivery({ rawBody: body }));
    expect(verified.payload).toEqual(JSON.parse(BODY));
  });

  it("does no body processing before the HMAC verifies (no parse of tampered JSON)", () => {
    // Invalid JSON, valid signature for those bytes: the verification error
    // is the JSON parse error, NOT hmac_rejected — proof the parse only
    // happens after the signature check passed.
    const invalidJson = "{not json";
    const hmac = expectedSignature(invalidJson);
    expect(() =>
      verifyWebhook(delivery({ rawBody: invalidJson, headers: { ...delivery().headers, "X-Shopify-Hmac-Sha256": hmac } })),
    ).toThrowError(SyntaxError);
  });

  it("looks up headers case-insensitively", () => {
    const verified = verifyWebhook(delivery({ headers: { ...delivery().headers, "x-shopify-topic": "products/delete" } }));
    expect(verified.topic).toBe("products/delete");
  });

  it("rejects an empty client secret as a caller invariant violation", () => {
    expect(() => verifyWebhook(delivery({ clientSecret: "" }))).toThrowError(/client secret/);
  });
});

describe("isSupportedWebhookTopic", () => {
  it("accepts exactly the spec's three topics and nothing else", () => {
    expect([...WEBHOOK_TOPICS]).toEqual(["app/uninstalled", "products/update", "products/delete"]);
    for (const topic of WEBHOOK_TOPICS) {
      expect(isSupportedWebhookTopic(topic)).toBe(true);
    }
    expect(isSupportedWebhookTopic("products/create")).toBe(false);
    expect(isSupportedWebhookTopic("shop/redact")).toBe(false);
    expect(isSupportedWebhookTopic("")).toBe(false);
  });
});
