import { expect, mock, test } from "bun:test";

import ky from "ky";

import { startGeneration } from "./generate-api";

test("does not time out while generation intake is pending", async () => {
  const response = {
    generations: ["generation-1"],
    requestId: "request-1",
  };
  const post = mock(() => ({ json: () => response }));
  const http = Object.assign(ky.create(), { post });
  const input = {
    enhance: false,
    modelIds: ["model-1"],
    prompt: "test prompt",
    ratio: "1:1" as const,
    resolutionTier: "Standard" as const,
  };

  await expect(startGeneration(http, input)).resolves.toEqual(response);
  expect(post).toHaveBeenCalledWith("generate/run", {
    json: input,
    timeout: false,
  });
});
