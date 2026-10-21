import { describe, expect, test } from "bun:test";

import {
  GenerationProjection,
  shouldRefreshGeneration,
} from "./generation-projection";
import type { GenerationRow } from "./hooks/use-generations";

const row = (overrides: Partial<GenerationRow> = {}): GenerationRow => ({
  createdAt: "2026-08-19T00:00:00.000Z",
  durationSeconds: null,
  error: null,
  id: "generation-1",
  loras: [],
  mediaType: "image",
  modelId: "model-1",
  originalPrompt: null,
  pose: null,
  priceCoins: 4,
  prompt: "portrait",
  queuedAt: null,
  ratio: "1:1",
  referenceImageUrl: null,
  requestId: "request-1",
  resolution: "Standard",
  resultUrls: [],
  runpodJobId: null,
  seed: 42,
  sourceGenerationId: null,
  status: "preparing",
  title: null,
  updatedAt: "2026-08-19T00:00:01.000Z",
  ...overrides,
});

const project = (
  rows: GenerationRow[],
  realtime: ConstructorParameters<
    typeof GenerationProjection
  >[0]["realtime"] = []
) => new GenerationProjection({ models: [], realtime, rows }).results();

describe("GenerationProjection", () => {
  test.each([
    ["preparing", "preparing"],
    ["queued", "queued"],
    ["generating", "generating"],
    ["post_processing", "post_processing"],
    ["completed", "completed"],
    ["failed", "failed"],
    ["cancelled", "cancelled"],
  ] as const)("maps persisted %s lifecycle", (status, expected) => {
    expect(project([row({ status })])[0]?.status).toBe(expected);
  });

  test("replaces optimistic cards after request rows arrive", () => {
    const optimistic = {
      requestId: "request-1",
      result: {
        coins: 4,
        id: "optimistic-1",
        prompt: "portrait",
        ratio: "1:1" as const,
        resolution: "Standard" as const,
        src: "",
        status: "preparing" as const,
        time: "",
        title: "Model",
      },
    };
    const results = new GenerationProjection({
      models: [],
      optimistic: [optimistic],
      rows: [row()],
    }).results();

    expect(results.map((result) => result.id)).toEqual(["generation-1"]);
  });

  test("keeps later persisted state when realtime is stale", () => {
    const results = project(
      [row({ status: "post_processing" })],
      [{ generationId: "generation-1", status: "generating" }]
    );
    expect(results[0]?.status).toBe("post_processing");
  });

  test("keeps terminal persisted state", () => {
    const results = project(
      [row({ status: "completed" })],
      [
        { generationId: "generation-1", status: "generating" },
        { generationId: "generation-1", status: "failed" },
      ]
    );
    expect(results[0]?.status).toBe("completed");
  });

  test("projects cancellation metadata and persisted cancellation", () => {
    expect(
      GenerationProjection.realtimeEvent({
        generationId: "generation-1",
        status: "cancelled",
        step: "cancelled",
      })
    ).toEqual({ generationId: "generation-1", status: "cancelled" });
    expect(project([row({ status: "cancelled" })])[0]?.status).toBe(
      "cancelled"
    );
  });

  test("refreshes immediately from persisted terminal realtime status", () => {
    expect(
      shouldRefreshGeneration({
        isCancelled: false,
        isCompleted: false,
        metadata: { generationId: "generation-1", status: "completed" },
      })
    ).toBe(true);
  });
});
