import { expect, test } from "bun:test";

import type { GenerationItem } from "../routerai/types";
import {
  generationPollDelay,
  hasActiveGenerations,
  mergeGenerationItems,
} from "./generation-sync";

const item = (
  id: string,
  status: GenerationItem["status"],
  updatedAt: string
): GenerationItem => ({
  chatId: "chat-1",
  costRub: 0,
  createdAt: "2026-10-23T10:00:00.000Z",
  id,
  maxCostRub: "10.00",
  modelId: "fixture/model",
  outputUrls: [],
  prompt: "fixture",
  stage: status === "pending" ? "running" : status,
  status,
  tab: "image",
  updatedAt,
});

test("active generation polling is fast, backs off, and slows while idle", () => {
  expect(generationPollDelay(true, 0)).toBe(3000);
  expect(generationPollDelay(false, 0)).toBe(15_000);
  expect(generationPollDelay(true, 1)).toBe(6000);
  expect(generationPollDelay(true, 2)).toBe(12_000);
  expect(generationPollDelay(true, 5)).toBe(30_000);
});

test("reconciling work remains active until a terminal state arrives", () => {
  expect(
    hasActiveGenerations([
      item("one", "reconciling", "2026-10-23T10:00:01.000Z"),
    ])
  ).toBe(true);
  expect(
    hasActiveGenerations([item("one", "completed", "2026-10-23T10:00:01.000Z")])
  ).toBe(false);
});

test("generation history ignores stale responses and merges new active jobs", () => {
  const completed = item("one", "completed", "2026-10-23T10:00:03.000Z");
  const merged = mergeGenerationItems(
    [completed],
    [
      item("one", "pending", "2026-10-23T10:00:02.000Z"),
      item("two", "pending", "2026-10-23T10:00:02.000Z"),
    ]
  );
  expect(merged.map(({ id, status }) => [id, status])).toEqual([
    ["one", "completed"],
    ["two", "pending"],
  ]);
});
