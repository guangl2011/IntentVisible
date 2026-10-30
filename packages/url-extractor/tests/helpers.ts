import * as http from "node:http";
import type { AddressInfo } from "node:net";

import { SystemClock, type Clock } from "../src/index.js";

/** Clock whose time only moves when something sleeps — no real waits. */
export class FakeClock implements Clock {
  private currentMs = 1_700_000_000_000;
  readonly sleptMs: number[] = [];

  nowMs(): number {
    return this.currentMs;
  }

  isoNow(): string {
    return new Date(this.currentMs).toISOString();
  }

  async sleep(ms: number): Promise<void> {
    this.sleptMs.push(ms);
    this.currentMs += ms;
  }
}

export interface FixtureRoute {
  status?: number;
  body: string;
  contentType?: string;
}

export interface FixtureServer {
  baseUrl: string;
  /** Every path actually requested, in order (robots.txt included). */
  requestedPaths: string[];
  close(): Promise<void>;
}

/**
 * In-process HTTP server serving fixture pages. Integration tests exercise
 * the real fetch path (robots.txt lookup, status codes, redirects) against
 * fixture snapshots instead of mocking the world.
 */
export function startFixtureServer(
  routes: Record<string, string | FixtureRoute>,
): Promise<FixtureServer> {
  const requestedPaths: string[] = [];
  const server = http.createServer((request, response) => {
    const path = request.url?.split("?")[0] ?? "/";
    requestedPaths.push(path);
    const route = routes[path];
    const resolved: FixtureRoute | undefined =
      typeof route === "string" ? { body: route } : route;
    if (!resolved) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("fixture not found");
      return;
    }
    response.writeHead(resolved.status ?? 200, {
      "content-type": resolved.contentType ?? "text/html; charset=utf-8",
    });
    response.end(resolved.body);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address() as AddressInfo;
      resolve({
        baseUrl: `http://127.0.0.1:${address.port}`,
        requestedPaths,
        close: () =>
          new Promise((resolveClose) => {
            server.close(() => resolveClose());
          }),
      });
    });
  });
}

export const systemClock = new SystemClock();
