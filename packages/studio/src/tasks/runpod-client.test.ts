import { afterEach, describe, expect, test } from "bun:test";

import type {
  RunpodConfig,
  WorkflowGraph,
  WorkflowSpec,
} from "../config/types";
import { WorkflowExecution } from "./runpod-client";
import type { VideoGenerateInput } from "./runpod-client";

const originalFetch = globalThis.fetch;

afterEach(() => {
  globalThis.fetch = originalFetch;
});

const runpod: RunpodConfig = {
  apiKey: "test-key",
  endpoints: { video: "test-endpoint" },
};

const submitAndReadWorkflow = async (
  workflow: WorkflowSpec,
  videoInput: VideoGenerateInput
): Promise<WorkflowGraph> => {
  let requestBody: string | undefined;
  globalThis.fetch = Object.assign(
    (_input: URL | RequestInfo, init?: RequestInit) => {
      requestBody = init?.body?.toString();
      return Promise.resolve(
        Response.json(
          { id: "run-1", status: "IN_QUEUE" },
          {
            status: 200,
          }
        )
      );
    },
    { preconnect: originalFetch.preconnect }
  );

  const execution = new WorkflowExecution({
    models: [],
    runpod,
    video: { durations: [5], fps: 24, id: "video", workflow },
  });
  await execution.submitVideo("video", videoInput);

  // SAFETY: submitVideoRun serializes WorkflowGraph at input.workflow.
  const body = JSON.parse(requestBody ?? "") as {
    input: { workflow: WorkflowGraph };
  };
  return body.input.workflow;
};

const input = {
  durationSeconds: 5,
  fps: 24,
  prompt: "test prompt",
  seed: 42,
  sourceImage: "base64-image",
} satisfies VideoGenerateInput;

describe("WorkflowExecution", () => {
  test("preserves explicit frame input for frame-based workflows", async () => {
    const built = await submitAndReadWorkflow(
      {
        graph: {
          frames: { class_type: "PrimitiveInt", inputs: { value: 1 } },
          source: {
            class_type: "LoadImage",
            inputs: { image: "example.png" },
          },
        },
        nodes: {
          framesNode: { input: "value", node: "frames" },
          sourceImage: { input: "image", node: "source" },
        },
      },
      {
        frames: 120,
        prompt: "test prompt",
        seed: 42,
        sourceImage: "base64-image",
      }
    );

    expect(built.frames.inputs.value).toBe(120);
    expect(built.source.inputs.image).toBe("source.png");
  });

  test("calculates frame count from duration for frame workflows", async () => {
    const built = await submitAndReadWorkflow(
      {
        graph: {
          frames: { class_type: "PrimitiveInt", inputs: { value: 1 } },
          source: { class_type: "LoadImage", inputs: { image: "example.png" } },
        },
        nodes: {
          framesNode: { input: "value", node: "frames" },
          sourceImage: { input: "image", node: "source" },
        },
      },
      input
    );

    expect(built.frames.inputs.value).toBe(120);
  });

  test("injects duration and fps for direct-duration workflows", async () => {
    const built = await submitAndReadWorkflow(
      {
        graph: {
          duration: { class_type: "PrimitiveFloat", inputs: { value: 1 } },
          fps: { class_type: "CreateVideo", inputs: { fps: 1 } },
          source: { class_type: "LoadImage", inputs: { image: "example.png" } },
        },
        nodes: {
          durationNode: { input: "value", node: "duration" },
          fpsNode: { input: "fps", node: "fps" },
          sourceImage: { input: "image", node: "source" },
        },
      },
      input
    );

    expect(built.duration.inputs.value).toBe(5);
    expect(built.fps.inputs.fps).toBe(24);
    expect(built.source.inputs.image).toBe("source.png");
  });

  test("rejects missing mapped nodes during initialization", () => {
    expect(
      () =>
        new WorkflowExecution({
          models: [
            {
              id: "image",
              name: "Image",
              ratios: ["1:1"],
              resolutions: ["Standard"],
              workflow: {
                graph: {},
                nodes: { prompt: { input: "text", node: "missing" } },
              },
            },
          ],
          runpod: {
            apiKey: "test-key",
            endpoints: { image: "image-endpoint" },
          },
        })
    ).toThrow('workflow "image" maps prompt to missing node "missing"');
  });

  test("rejects missing mapped inputs during initialization", () => {
    expect(
      () =>
        new WorkflowExecution({
          models: [
            {
              id: "image",
              name: "Image",
              ratios: ["1:1"],
              resolutions: ["Standard"],
              workflow: {
                graph: { prompt: { inputs: { value: "" } } },
                nodes: { prompt: { input: "text", node: "prompt" } },
              },
            },
          ],
          runpod: {
            apiKey: "test-key",
            endpoints: { image: "image-endpoint" },
          },
        })
    ).toThrow(
      'workflow "image" maps prompt to missing input "text" on node "prompt"'
    );
  });
});
