import type { LoadError, LoadResult } from "./loaders.js";
import { loadPage } from "./loaders.js";
import { getShopifyClient } from "./client.js";

/**
 * Which store the merchant pages operate on. Picked once on the overview
 * page (connect card) and remembered in localStorage; the other pages read
 * the same binding so the store choice survives navigation.
 */
export interface StoreBinding {
  storeId: string;
  shopDomain: string;
}

const BINDING_KEY = "iv.shopify.binding";

export function loadBinding(): StoreBinding | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(BINDING_KEY);
    if (raw === null) return null;
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed === "object" &&
      parsed !== null &&
      typeof (parsed as StoreBinding).storeId === "string" &&
      typeof (parsed as StoreBinding).shopDomain === "string"
    ) {
      return parsed as StoreBinding;
    }
    return null;
  } catch {
    return null;
  }
}

export function saveBinding(binding: StoreBinding): void {
  window.localStorage.setItem(BINDING_KEY, JSON.stringify(binding));
}

export function clearBinding(): void {
  window.localStorage.removeItem(BINDING_KEY);
}

export type BindingInput =
  | { kind: "shop_domain"; shop: string }
  | { kind: "store_id"; id: string }
  | { kind: "invalid" };

/** Accepts either `{slug}.myshopify.com` (install) or a store id (re-bind). */
export function parseBindingInput(input: string): BindingInput {
  const trimmed = input.trim().toLowerCase();
  if (/^[a-z0-9][a-z0-9-]*\.myshopify\.com$/.test(trimmed)) {
    return { kind: "shop_domain", shop: trimmed };
  }
  if (/^store_[a-z0-9_]+$/.test(trimmed)) {
    return { kind: "store_id", id: trimmed };
  }
  return { kind: "invalid" };
}

/**
 * Resolves the connect card's submit into a binding: a myshopify domain
 * starts the install (OAuth) and binds the returned store id; a store id
 * is verified against the status read before binding. Failures surface as
 * connect-card errors — nothing is bound unless the API confirmed it.
 */
export async function resolveBinding(input: string): Promise<LoadResult<StoreBinding>> {
  const parsed = parseBindingInput(input);
  if (parsed.kind === "invalid") {
    return {
      ok: false,
      error: {
        kind: "invalid_input",
        message: "Enter your store’s {slug}.myshopify.com domain or a store id.",
      },
    };
  }
  const client = getShopifyClient();
  if (parsed.kind === "shop_domain") {
    return loadPage(async () => {
      const start = await client.beginInstall(parsed.shop);
      return { storeId: start.store_id, shopDomain: parsed.shop };
    });
  }
  return loadPage(async () => {
    const status = await client.storeStatus(parsed.id);
    return { storeId: status.store_id, shopDomain: status.shop_domain };
  });
}

export type { LoadError, LoadResult };
