/**
 * JSON body parsing that keeps the raw bytes (Fastify docs pattern for
 * webhook HMAC verification): the parser hands routes the parsed object
 * AND stashes the untouched request buffer, so a webhook route can verify
 * the signature over exactly the bytes Shopify sent.
 *
 * Register once per Fastify instance, before routes (buildApp and
 * buildShopifyApp each own their instance's registration).
 */

import type { FastifyInstance, FastifyRequest } from "fastify";

/** A request whose parsed-JSON body retained its raw bytes. */
export interface RawBodyRequest extends FastifyRequest {
  rawBody?: Buffer;
}

export function registerRawBodyParser(app: FastifyInstance): void {
  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    (request as RawBodyRequest).rawBody = body as Buffer;
    try {
      const text = (body as Buffer).toString("utf8");
      done(null, text === "" ? undefined : JSON.parse(text));
    } catch (error) {
      // Parser errors route through the app's error handler with a 400 —
      // a malformed body is a client problem, never a 500.
      (error as { statusCode?: number }).statusCode = 400;
      done(error as Error, undefined);
    }
  });
}
