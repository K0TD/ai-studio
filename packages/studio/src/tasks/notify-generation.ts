// Fire-and-forget sidecar to "generation-run": runs
// config.notify off the critical path, so the parent run — which the UI
// watches for completion — never waits on it. Moved from
// trigger/notify-generation.ts.

import { schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

import type { StudioConfig } from "../config/types";

export const notifyGenerationPayloadSchema = z.object({
  executionTimeMs: z.number().optional(),
  generationId: z.uuid(),
  kind: z.enum(["image", "video"]).default("image"),
  modelId: z.string(),
  priceCoins: z.number().int().nonnegative(),
  resultUrls: z.array(z.string()).min(1),
  userId: z.string(),
});

export type NotifyGenerationPayload = z.infer<
  typeof notifyGenerationPayloadSchema
>;

export const createNotifyGenerationTask = (config: StudioConfig) =>
  schemaTask({
    id: "notify-generation",
    machine: "micro",
    retry: { maxAttempts: 2 },
    run: async (payload) => {
      await config.notify?.({
        generation: {
          executionTimeMs: payload.executionTimeMs,
          id: payload.generationId,
          mediaType: payload.kind,
          modelId: payload.modelId,
          priceCoins: payload.priceCoins,
          resultUrls: payload.resultUrls,
          userId: payload.userId,
        },
        type: "completed",
      });
    },
    schema: notifyGenerationPayloadSchema,
  });

export type NotifyGenerationTask = ReturnType<
  typeof createNotifyGenerationTask
>;
