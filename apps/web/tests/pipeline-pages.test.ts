import { NotFoundError } from "@intentvisible/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { PipelineClient } from "@intentvisible/client";

/**
 * Container-side flow tests with the packages/client data path mocked —
 * per the repo rule, no test reaches a real API. Covers onboarding defaults
 * at the API boundary (Verification #10), the market save, and the gate
 * decision flow (approve / reject-with-note), plus the loadPipeline error
 * mapping the pages render.
 */

vi.mock("../src/lib/pipeline/client", async () => {
  const { NotFoundError } = await import("@intentvisible/client");
  return {
    getPipelineClient: vi.fn(),
    NotFoundError,
  };
});

import { getPipelineClient } from "../src/lib/pipeline/client";
import { canRejectWithNote, decideReview } from "../src/lib/pipeline/gates";
import { saveMarket, startPipeline } from "../src/lib/pipeline/onboarding";
import { PIPELINE_PROJECT, gateReview, pipelineRun } from "./pipeline-fixtures";

const mockedGet = vi.mocked(getPipelineClient);

function fakeClient(overrides: Partial<PipelineClient> = {}): PipelineClient {
  return {
    createProject: vi.fn().mockResolvedValue({
      project: PIPELINE_PROJECT,
      pipeline: pipelineRun("crawling"),
    }),
    updateProject: vi.fn().mockResolvedValue({ ...PIPELINE_PROJECT, country: "DE", language: "de" }),
    getProject: vi.fn().mockResolvedValue({
      project: PIPELINE_PROJECT,
      pipeline: pipelineRun("crawling"),
      schedule: null,
      cycles: [],
      gates: [gateReview(1, "pending")],
      published: [],
    }),
    decideGate: vi.fn().mockResolvedValue(gateReview(1, "approved")),
    getGraph: vi.fn(),
    listPrompts: vi.fn(),
    listMetrics: vi.fn(),
    getLibPreview: vi.fn(),
    listPublished: vi.fn(),
    ...overrides,
  } as unknown as PipelineClient;
}

beforeEach(() => {
  vi.restoreAllMocks();
});

describe("startPipeline (onboarding defaults, Verification #10)", () => {
  it("creates the project with the USA/English, llm, monthly defaults", async () => {
    const client = fakeClient();
    mockedGet.mockReturnValue(client);

    const result = await startPipeline("https://www.example.com", "site_url");
    expect(result.ok).toBe(true);
    expect(client.createProject).toHaveBeenCalledWith({
      site_url: "https://www.example.com",
      trigger: "site_url",
      country: "US",
      language: "en",
      data_mode: "llm",
      cadence: "monthly",
    });
  });

  it("trims the site URL", async () => {
    const client = fakeClient();
    mockedGet.mockReturnValue(client);

    await startPipeline("  https://www.example.com  ", "script_install");
    expect(client.createProject).toHaveBeenCalledWith(
      expect.objectContaining({ site_url: "https://www.example.com", trigger: "script_install" }),
    );
  });

  it("rejects a blank URL without calling the API", async () => {
    const client = fakeClient();
    mockedGet.mockReturnValue(client);

    const result = await startPipeline("   ", "site_url");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("invalid_input");
      expect(result.error.message).toContain("site URL is required");
    }
    expect(client.createProject).not.toHaveBeenCalled();
  });

  it("maps a not-found API error to the not_found wording", async () => {
    const client = fakeClient({
      createProject: vi
        .fn()
        .mockRejectedValue(new NotFoundError(404, "project_not_found", {}, "unknown project")),
    });
    mockedGet.mockReturnValue(client);

    const result = await startPipeline("https://www.example.com", "site_url");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("not_found");
      expect(result.error.message).toContain("start onboarding again");
    }
  });
});

describe("saveMarket (editable market, re-baseline at the API)", () => {
  it("sends the chosen market to the update endpoint", async () => {
    const client = fakeClient();
    mockedGet.mockReturnValue(client);

    const result = await saveMarket(PIPELINE_PROJECT.project_id, { country: "DE", language: "de" });
    expect(result.ok).toBe(true);
    expect(client.updateProject).toHaveBeenCalledWith(PIPELINE_PROJECT.project_id, {
      country: "DE",
      language: "de",
    });
  });
});

describe("decideReview (gate flows)", () => {
  it("sends approve with an optional note", async () => {
    const client = fakeClient();
    mockedGet.mockReturnValue(client);

    const result = await decideReview("rev_gate_1_pending", "approved");
    expect(result.ok).toBe(true);
    expect(client.decideGate).toHaveBeenCalledWith("rev_gate_1_pending", "approved", undefined);
  });

  it("sends reject with the required feedback note", async () => {
    const client = fakeClient();
    mockedGet.mockReturnValue(client);

    const result = await decideReview(
      "rev_gate_1_pending",
      "rejected",
      "Swap the fridge prompt to the overnight scenario.",
    );
    expect(result.ok).toBe(true);
    expect(client.decideGate).toHaveBeenCalledWith(
      "rev_gate_1_pending",
      "rejected",
      "Swap the fridge prompt to the overnight scenario.",
    );
  });

  it("maps API failures so the page can render the error state", async () => {
    const client = fakeClient({
      decideGate: vi.fn().mockRejectedValue(new Error("connection refused")),
    });
    mockedGet.mockReturnValue(client);

    const result = await decideReview("rev_gate_1_pending", "approved");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.kind).toBe("unavailable");
      expect(result.error.message).toContain("connection refused");
    }
  });
});

describe("reject requires a note", () => {
  it("blocks blank or whitespace-only feedback", () => {
    expect(canRejectWithNote("")).toBe(false);
    expect(canRejectWithNote("   ")).toBe(false);
    expect(canRejectWithNote("Rework the fridge prompts.")).toBe(true);
  });
});
