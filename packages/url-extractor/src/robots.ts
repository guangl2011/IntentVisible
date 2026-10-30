import robotsParserModule from "robots-parser";

import type { FetchLike } from "./types.js";

/**
 * robots.txt gate (spec Flow, Fetch row: "Never guess past a denial").
 *
 * robots-parser ships an ambient untyped declaration that does not resolve
 * under NodeNext; the untyped boundary is confined to the single cast below
 * — nothing else in this package touches the raw module.
 */

interface UntypedRobot {
  isAllowed(url: string, ua?: string): boolean | undefined;
  getCrawlDelay(ua?: string): number | undefined;
}

type RobotsParserFactory = (robotsUrl: string, body: string) => UntypedRobot;

const robotsParser = robotsParserModule as unknown as RobotsParserFactory;

/** Typed view over the parsed robots.txt of one origin. */
export interface RobotsFile {
  isAllowed(pageUrl: string, userAgent: string): boolean;
  crawlDelaySeconds(userAgent: string): number | null;
}

function parseRobotsFile(robotsUrl: string, body: string): RobotsFile {
  const parser: UntypedRobot = robotsParser(robotsUrl, body);
  return {
    isAllowed(pageUrl, userAgent) {
      // `undefined` means no rule matched — allowed under RFC 9309.
      return parser.isAllowed(pageUrl, userAgent) !== false;
    },
    crawlDelaySeconds(userAgent) {
      const delay = parser.getCrawlDelay(userAgent);
      return typeof delay === "number" && delay > 0 ? delay : null;
    },
  };
}

export type RobotsDecision =
  | { allowed: true; crawlDelaySeconds: number | null }
  | { allowed: false; detail: string };

export interface RobotsGate {
  check(pageUrl: string): Promise<RobotsDecision>;
}

/** What load() caches per origin — the file, not a per-page decision. */
type LoadedRobots =
  | { kind: "file"; file: RobotsFile }
  | { kind: "allowAll" }
  | { kind: "disallowAll"; detail: string };

export class HttpRobotsGate implements RobotsGate {
  private readonly cache = new Map<string, Promise<LoadedRobots>>();

  constructor(
    private readonly deps: {
      fetchImpl: FetchLike;
      timeoutMs: number;
      userAgent: string;
    },
  ) {}

  /** The robots.txt is cached per origin; per-page rules evaluate fresh. */
  check(pageUrl: string): Promise<RobotsDecision> {
    const origin = new URL(pageUrl).origin;
    const cached = this.cache.get(origin);
    if (cached) {
      return cached.then((loaded) => this.decide(loaded, pageUrl));
    }
    const pending = this.load(origin);
    this.cache.set(origin, pending);
    return pending.then((loaded) => this.decide(loaded, pageUrl));
  }

  private decide(loaded: LoadedRobots, pageUrl: string): RobotsDecision {
    if (loaded.kind === "disallowAll") {
      return { allowed: false, detail: loaded.detail };
    }
    if (loaded.kind === "allowAll") {
      return { allowed: true, crawlDelaySeconds: null };
    }
    if (!loaded.file.isAllowed(pageUrl, this.deps.userAgent)) {
      return { allowed: false, detail: `robots.txt disallows ${pageUrl}` };
    }
    return { allowed: true, crawlDelaySeconds: loaded.file.crawlDelaySeconds(this.deps.userAgent) };
  }

  private async load(origin: string): Promise<LoadedRobots> {
    const robotsUrl = `${origin}/robots.txt`;
    try {
      const response = await this.deps.fetchImpl(robotsUrl, {
        signal: AbortSignal.timeout(this.deps.timeoutMs),
        headers: { "user-agent": this.deps.userAgent },
      });
      // RFC 9309: 404/410 = full allow; 401/403 or server error = full
      // disallow. We extend the same conservatism to network errors.
      if (response.status === 404 || response.status === 410) {
        return { kind: "allowAll" };
      }
      if (!response.ok) {
        return {
          kind: "disallowAll",
          detail: `robots.txt returned HTTP ${response.status}; refusing to crawl without permission`,
        };
      }
      return { kind: "file", file: parseRobotsFile(robotsUrl, await response.text()) };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return {
        kind: "disallowAll",
        detail: `robots.txt could not be fetched (${message}); refusing to crawl without permission`,
      };
    }
  }
}
