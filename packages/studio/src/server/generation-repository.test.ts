import { describe, expect, test } from "bun:test";

import type { GenerationStatus } from "../schema/generation";
import { canTransitionGeneration } from "./generation-repository";

describe("generation lifecycle", () => {
  test("allows forward active transitions", () => {
    expect(canTransitionGeneration("preparing", "queued")).toBe(true);
    expect(canTransitionGeneration("queued", "generating")).toBe(true);
    expect(canTransitionGeneration("generating", "post_processing")).toBe(true);
  });

  test("rejects backward and same-state transitions", () => {
    expect(canTransitionGeneration("queued", "preparing")).toBe(false);
    expect(canTransitionGeneration("generating", "generating")).toBe(false);
  });

  test("makes every terminal state sticky", () => {
    const terminal: GenerationStatus[] = ["completed", "failed", "cancelled"];
    const all: GenerationStatus[] = [
      "preparing",
      "queued",
      "generating",
      "post_processing",
      ...terminal,
    ];
    for (const from of terminal) {
      for (const to of all) {
        expect(canTransitionGeneration(from, to)).toBe(false);
      }
    }
  });

  test("allows cancellation or another terminal result from active states", () => {
    expect(canTransitionGeneration("preparing", "cancelled")).toBe(true);
    expect(canTransitionGeneration("queued", "failed")).toBe(true);
    expect(canTransitionGeneration("post_processing", "completed")).toBe(true);
  });
});
