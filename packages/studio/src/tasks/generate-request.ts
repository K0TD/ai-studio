// Runs shared prompt work once, then fans out one generation-run per image.

import { logger, metadata, schemaTask } from "@trigger.dev/sdk";
import { z } from "zod";

import { runEnhance } from "../ai/prompt-runners";
import { decodeLoraSelection } from "../config/lora-selection";
import { RATIO_KEYS } from "../config/types";
import type { StorageAdapter, StudioConfig } from "../config/types";
import type { GenerationRepository } from "../server/generation-repository";
import type { GenerateTitleTask } from "./generate-title";
import { resolveGenerationPrompt } from "./generation-intake";
import type {
  GenerationRunTask,
  ImageGenerationRunPayload,
} from "./generation-run";

const generationRowSchema = z.object({
  // Row's createdAt (ISO string), returned by createGeneration at insert
  // time — threaded through to each child for its result image keys.
  createdAt: z.string(),
  generationId: z.uuid(),
  modelId: z.string(),
  priceCoins: z.number().int().nonnegative(),
  seed: z.number().int(),
});

export const generateRequestPayloadSchema = z.object({
  enhance: z.boolean().default(false),
  generations: z.array(generationRowSchema).min(1),
  loras: z.array(z.string()).default([]),
  // Storage object keys the route staged the control images under (too large
  // for a Trigger.dev payload) — e.g. "<generationId>/pose.png".
  poseImageKey: z.string().optional(),
  posePreset: z.string().optional(),
  prompt: z.string().min(1),
  ratio: z.enum(RATIO_KEYS),
  referenceImageKey: z.string().optional(),
  requestId: z.uuid(),
  traceHeaders: z.record(z.string(), z.string()).default({}),
  userId: z.string(),
});

export type GenerateRequestPayload = z.infer<
  typeof generateRequestPayloadSchema
>;

interface ControlImageKeys {
  enhance: boolean;
  poseImageKey?: string;
  referenceImageKey?: string;
}

// Reference images always feed moderation. Pose images only feed prompt
// enhancement, so avoid downloading them when enhancement is disabled.
export const downloadControlImages = async (
  storage: Pick<StorageAdapter, "getBase64">,
  input: ControlImageKeys
): Promise<
  [poseImage: string | undefined, referenceImage: string | undefined]
> =>
  await Promise.all([
    input.enhance && input.poseImageKey
      ? storage.getBase64(input.poseImageKey)
      : undefined,
    input.referenceImageKey
      ? storage.getBase64(input.referenceImageKey)
      : undefined,
  ]);

export const createGenerateRequestTask = (
  config: StudioConfig,
  queries: GenerationRepository,
  generationRun: GenerationRunTask,
  generateTitle: GenerateTitleTask
) => {
  const runRequest = async (payload: GenerateRequestPayload): Promise<void> => {
    const ids = payload.generations.map((row) => row.generationId);

    logger.info("generate-request received", { ...payload });

    // Fire-and-forget: the title generates and saves itself in a sidecar task,
    // concurrent with enhance/moderation. Only the trigger call is awaited —
    // the pipeline never waits for the title itself.
    const titleHandle = await generateTitle.trigger({
      generationIds: ids,
      prompt: payload.prompt,
      traceHeaders: {},
      userId: payload.userId,
    });
    logger.info("generate-title triggered", { runId: titleHandle.id });

    // Reference images feed moderation even when enhancement is off. Pose
    // images only feed enhancement. Children download their own copies later.
    metadata.set("step", "downloading-inputs");
    const shouldDownloadInputs =
      payload.enhance || Boolean(payload.referenceImageKey);
    const [poseImage, referenceImage] = shouldDownloadInputs
      ? await logger.trace("download-control-inputs", async (span) => {
          const images = await downloadControlImages(config.storage, payload);
          span.setAttribute("pose.bytes", images[0]?.length ?? 0);
          span.setAttribute("reference.bytes", images[1]?.length ?? 0);
          return images;
        })
      : [undefined, undefined];

    // Enhancement and moderation run concurrently. The shared generation
    // intake keeps moderation over the user's intent; a rewrite replaces the
    // enhancement because the typed prompt required a policy correction.
    metadata.set("step", "processing-prompt");
    const enhanceSpec = config.prompts?.enhance;
    const enhancePromise: Promise<string> =
      payload.enhance && enhanceSpec
        ? logger.trace("enhance-prompt", async (span) => {
            span.setAttribute("input.prompt", payload.prompt);
            // Searched across every configured model's loras (not just one
            // "control" model) since the config carries no explicit notion of
            // which model a lora id belongs to — mirrors the flat LORAS
            // lookup this replaces.
            const enabledIds = new Set(
              payload.loras.map((value) => decodeLoraSelection(value).id)
            );
            const triggerWords = config.models
              .flatMap((model) => model.loras ?? [])
              .filter((lora) => enabledIds.has(lora.id))
              .map((lora) => lora.triggerWords)
              .filter((words): words is string => Boolean(words));
            const out = await runEnhance(enhanceSpec, payload.prompt, {
              poseImage,
              referenceImage,
              triggerWords,
            });
            span.setAttribute("output.prompt", out);
            span.setAttribute("output.changed", out !== payload.prompt);
            return out;
          })
        : Promise.resolve(payload.prompt);
    let resolved: Awaited<ReturnType<typeof resolveGenerationPrompt>>;
    try {
      resolved = await logger.trace("moderate-prompt", async (span) => {
        span.setAttribute("input.prompt", payload.prompt);
        const result = await resolveGenerationPrompt({
          fallbackPrompt: enhancePromise,
          moderation: config.moderation,
          prompt: payload.prompt,
          referenceImage,
          userId: payload.userId,
        });
        span.setAttribute("output.action", result.action);
        if (result.action === "allow" && result.moderatedPrompt) {
          span.setAttribute("output.rewritten", result.moderatedPrompt);
        }
        if (result.action === "block" && result.reason) {
          span.setAttribute("output.reason", result.reason);
        }
        return result;
      });
    } catch (error) {
      logger.error("moderation failed", { error, prompt: payload.prompt });
      metadata
        .set("step", "failed")
        .set("failReason", "moderation_unavailable");
      await queries.markManyFailed(
        payload.userId,
        ids,
        "moderation_unavailable"
      );
      return;
    }

    if (resolved.action === "block") {
      logger.warn("request blocked by moderation", { prompt: payload.prompt });
      metadata.set("step", "failed").set("failReason", "content_policy");
      // Block audit is the moderation provider's responsibility,
      // so this task doesn't record it directly.
      await queries.markManyFailed(payload.userId, ids, "content_policy");
      return;
    }

    const childItems = payload.generations.map((row) => ({
      // The per-row gen_ tag lets the cancel endpoint find and cancel a single
      // child run without storing its run id.
      options: {
        tags: [`req_${payload.requestId}`, `gen_${row.generationId}`],
      },
      payload: {
        createdAt: row.createdAt,
        generationId: row.generationId,
        kind: "image",
        loras: payload.loras,
        modelId: row.modelId,
        moderatedPrompt: resolved.moderatedPrompt,
        moderationAction: resolved.moderationAction,
        originalPrompt: resolved.originalPrompt,
        poseImageKey: payload.poseImageKey,
        posePreset: payload.posePreset,
        priceCoins: row.priceCoins,
        prompt: resolved.prompt,
        ratio: payload.ratio,
        referenceImageKey: payload.referenceImageKey,
        requestId: payload.requestId,
        seed: row.seed,
        traceHeaders: {},
        userId: payload.userId,
      } satisfies ImageGenerationRunPayload,
    }));

    metadata.set("step", "fanning-out");
    logger.info("final prompt resolved", {
      finalPrompt: resolved.prompt,
      moderatedPrompt: resolved.moderatedPrompt,
      moderationAction: resolved.moderationAction,
      originalPrompt: resolved.originalPrompt,
    });

    const batchHandle = await generationRun.batchTrigger(childItems);

    // Stamped after the batch trigger so the cards flip to "Queued…" when this
    // run's completion invalidates the client's generation list.
    await queries.markManyQueued(payload.userId, ids);

    logger.info("children triggered", {
      batchId: batchHandle.batchId,
      generationIds: ids,
      runCount: batchHandle.runCount,
    });
    metadata.set("step", "generating");
  };

  return schemaTask({
    id: "generate-request",
    onFailure: async ({ payload, error }) => {
      logger.error("generate-request task failed", {
        error,
        requestId: payload.requestId,
      });
      await queries.markManyFailed(
        payload.userId,
        payload.generations.map((row) => row.generationId),
        "task_failed"
      );
    },
    // A retry would re-run enhance/moderate (harmless) but re-batch-trigger
    // children that may already be running their own RunPod jobs (double
    // submit). Every failure path above fails the batch explicitly instead of
    // throwing, so a single attempt is enough.
    retry: { maxAttempts: 1 },
    run: runRequest,
    schema: generateRequestPayloadSchema,
  });
};

export type GenerateRequestTask = ReturnType<typeof createGenerateRequestTask>;
