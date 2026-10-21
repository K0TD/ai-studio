import { describe, expect, mock, test } from "bun:test";

import { GenerationRun } from "./generation-run";
import type {
  GenerationAdapter,
  GenerationRunDependencies,
  GenerationRunPayload,
} from "./generation-run";

const payload: GenerationRunPayload = {
  createdAt: "2026-01-01T00:00:00.000Z",
  generationId: "00000000-0000-4000-8000-000000000001",
  kind: "image",
  loras: [],
  modelId: "image-model",
  moderationAction: "allow",
  priceCoins: 10,
  prompt: "portrait",
  ratio: "1:1",
  requestId: "00000000-0000-4000-8000-000000000002",
  seed: 42,
  traceHeaders: {},
  userId: "user-1",
};

interface HarnessOptions {
  charge?: "ok" | "insufficient";
  markGenerating?: boolean;
  status?: "COMPLETED" | "FAILED";
  submitError?: Error;
}

const createHarness = (options: HarnessOptions = {}) => {
  const events: string[] = [];
  const adapter: GenerationAdapter = {
    kind: "image",
    prepare() {
      events.push("prepare");
      return Promise.resolve({
        attach: { moderationAction: "allow", prompt: payload.prompt },
        submit() {
          events.push("submit");
          if (options.submitError) {
            return Promise.reject(options.submitError);
          }
          return Promise.resolve({ id: "job-1" });
        },
      });
    },
    storeOutput() {
      events.push("store-output");
      return Promise.resolve(["https://cdn.test/result.png"]);
    },
    timeout: "10m",
  };
  const refund = mock(() => {
    events.push("refund");
    return Promise.resolve();
  });
  const cancel = mock(() => {
    events.push("cancel-provider");
    return Promise.resolve();
  });
  const dependencies = {
    adapters: new Map([["image", adapter]]),
    billing: {
      charge() {
        events.push("charge");
        return Promise.resolve(options.charge ?? "ok");
      },
      refund,
    },
    notify: {
      trigger() {
        events.push("notify");
        return Promise.resolve({ id: "notify-run" });
      },
    },
    queries: {
      attachRunpodJob() {
        events.push("attach");
        return Promise.resolve(true);
      },
      getOwned() {
        events.push("guard");
        return Promise.resolve({ deletedAt: null, status: "queued" });
      },
      markCompleted() {
        events.push("complete");
        return Promise.resolve({
          modelId: payload.modelId,
          runpodJobId: "job-1",
        });
      },
      markFailed() {
        events.push("fail");
        return Promise.resolve({
          modelId: payload.modelId,
          runpodJobId: "job-1",
        });
      },
      markGenerating() {
        events.push("generating");
        return Promise.resolve(options.markGenerating ?? true);
      },
      markPostProcessing() {
        events.push("post-processing");
        return Promise.resolve(true);
      },
    },
    runtime: {
      createToken() {
        return Promise.resolve({
          id: "token-1",
          url: "https://webhook.test",
          wait: () => Promise.resolve(true),
        });
      },
      flushMetadata: () => Promise.resolve(),
      setMetadata() {},
      waitForPoll: () => Promise.resolve(),
    },
    workflowExecution: {
      cancel,
      getStatus() {
        events.push("status");
        return Promise.resolve({ status: options.status ?? "COMPLETED" });
      },
    },
  } satisfies GenerationRunDependencies;
  return { cancel, events, refund, run: new GenerationRun(dependencies) };
};

describe("GenerationRun", () => {
  test("owns lifecycle ordering through one interface", async () => {
    const harness = createHarness();
    await harness.run.execute(payload);
    expect(harness.events).toEqual([
      "guard",
      "prepare",
      "submit",
      "attach",
      "charge",
      "generating",
      "status",
      "post-processing",
      "store-output",
      "complete",
      "notify",
    ]);
  });

  test("submit failure neither charges nor refunds", async () => {
    const harness = createHarness({ submitError: new Error("offline") });
    await harness.run.execute(payload);
    expect(harness.events).toEqual(["guard", "prepare", "submit", "fail"]);
    expect(harness.refund).not.toHaveBeenCalled();
  });

  test("failed charge cancels provider job without refund", async () => {
    const harness = createHarness({ charge: "insufficient" });
    await harness.run.execute(payload);
    expect(harness.events).toEqual([
      "guard",
      "prepare",
      "submit",
      "attach",
      "charge",
      "cancel-provider",
      "fail",
    ]);
    expect(harness.refund).not.toHaveBeenCalled();
  });

  test("terminal provider failure marks failed before refund", async () => {
    const harness = createHarness({ status: "FAILED" });
    await harness.run.execute(payload);
    expect(harness.events.slice(-2)).toEqual(["fail", "refund"]);
  });

  test("cancellation race after charge cancels and refunds", async () => {
    const harness = createHarness({ markGenerating: false });
    await harness.run.execute(payload);
    expect(harness.events.slice(-3)).toEqual([
      "generating",
      "cancel-provider",
      "refund",
    ]);
  });
});
