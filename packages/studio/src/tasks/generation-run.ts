import { logger, metadata, schemaTask, wait } from "@trigger.dev/sdk";
import { z } from "zod";

import {
  decodeLoraSelection,
  resolveLoraStrength,
} from "../config/lora-selection";
import { RATIO_KEYS } from "../config/types";
import type { StudioConfig } from "../config/types";
import type {
  AttachRunpodJobInput,
  GenerationRepository,
  RunMetrics,
} from "../server/generation-repository";
import { resolveGenerationPrompt } from "./generation-intake";
import type { NotifyGenerationTask } from "./notify-generation";
import { postProcessImages } from "./post-process";
import { RATIO_TO_ASPECT_RATIO } from "./runpod-client";
import type { RunpodStatus, WorkflowExecution } from "./runpod-client";
import { isTerminal, metricsOf, TERMINAL_FAILURES } from "./runpod-status";

const commonPayloadSchema = z.object({
  createdAt: z.string(),
  generationId: z.uuid(),
  modelId: z.string(),
  priceCoins: z.number().int().nonnegative(),
  prompt: z.string().min(1),
  requestId: z.uuid(),
  seed: z.number().int(),
  userId: z.string(),
});

const imagePayloadSchema = commonPayloadSchema.extend({
  kind: z.literal("image"),
  loras: z.array(z.string()).default([]),
  moderatedPrompt: z.string().optional(),
  moderationAction: z.enum(["allow", "rewrite"]),
  originalPrompt: z.string().optional(),
  poseImageKey: z.string().optional(),
  posePreset: z.string().optional(),
  ratio: z.enum(RATIO_KEYS),
  referenceImageKey: z.string().optional(),
  traceHeaders: z.record(z.string(), z.string()).default({}),
});

const videoPayloadSchema = commonPayloadSchema.extend({
  durationSeconds: z.number().int().positive(),
  kind: z.literal("video"),
  sourceImageKeys: z.array(z.string()).min(1),
});

export const generationRunPayloadSchema = z.discriminatedUnion("kind", [
  imagePayloadSchema,
  videoPayloadSchema,
]);

export type GenerationRunPayload = z.infer<typeof generationRunPayloadSchema>;
export type ImageGenerationRunPayload = z.infer<typeof imagePayloadSchema>;
export type VideoGenerationRunPayload = z.infer<typeof videoPayloadSchema>;

export interface PreparedGeneration {
  attach: Omit<AttachRunpodJobInput, "runpodJobId">;
  submit(webhookUrl: string): Promise<{ id: string }>;
}

export interface GenerationAdapter {
  readonly kind: GenerationRunPayload["kind"];
  readonly timeout: "10m" | "20m";
  prepare(payload: GenerationRunPayload): Promise<PreparedGeneration>;
  storeOutput(
    payload: GenerationRunPayload,
    status: RunpodStatus
  ): Promise<string[]>;
}

export interface GenerationRunRuntime {
  createToken(timeout: "10m" | "20m"): Promise<{
    id: string;
    url: string;
    wait(): Promise<boolean>;
  }>;
  flushMetadata(): Promise<void>;
  setMetadata(key: string, value: string): void;
  waitForPoll(): Promise<void>;
}

export interface GenerationRunQueries {
  attachRunpodJob(
    userId: string,
    id: string,
    input: AttachRunpodJobInput
  ): Promise<boolean>;
  getOwned(
    userId: string,
    id: string
  ): Promise<{ deletedAt: Date | null; status: string } | undefined>;
  markCompleted(
    userId: string,
    id: string,
    urls: string[],
    metrics?: RunMetrics
  ): Promise<{ modelId: string; runpodJobId: string | null } | undefined>;
  markFailed(
    userId: string,
    id: string,
    reason: string,
    metrics?: RunMetrics
  ): Promise<{ modelId: string; runpodJobId: string | null } | undefined>;
  markGenerating(userId: string, id: string): Promise<boolean>;
  markPostProcessing(userId: string, id: string): Promise<boolean>;
}

export interface GenerationRunDependencies {
  adapters: ReadonlyMap<GenerationRunPayload["kind"], GenerationAdapter>;
  billing: Pick<StudioConfig["billing"], "charge" | "refund">;
  notify: {
    trigger(payload: Parameters<NotifyGenerationTask["trigger"]>[0]): Promise<{
      id: string;
    }>;
  };
  queries: GenerationRunQueries;
  runtime: GenerationRunRuntime;
  workflowExecution: Pick<WorkflowExecution, "cancel" | "getStatus">;
}

const inputError = (reason: string): Error & { reason: string } =>
  Object.assign(new Error(reason), { reason });

const canStart = (
  row: Awaited<ReturnType<GenerationRunQueries["getOwned"]>>
): boolean => Boolean(row && row.status === "queued" && !row.deletedAt);

export class GenerationRun {
  readonly #dependencies: GenerationRunDependencies;

  constructor(dependencies: GenerationRunDependencies) {
    this.#dependencies = dependencies;
  }

  // Lifecycle branches stay here so ordering remains visible and testable.
  // eslint-disable-next-line complexity
  async execute(payload: GenerationRunPayload): Promise<void> {
    const { queries, runtime } = this.#dependencies;
    runtime.setMetadata("generationId", payload.generationId);

    const existing = await queries.getOwned(
      payload.userId,
      payload.generationId
    );
    if (!canStart(existing)) {
      runtime.setMetadata("step", "skipped");
      return;
    }

    const adapter = this.#dependencies.adapters.get(payload.kind);
    if (!adapter) {
      await this.#failBeforeCharge(payload, "unknown_media_type");
      return;
    }

    let prepared: PreparedGeneration;
    try {
      prepared = await adapter.prepare(payload);
    } catch (error) {
      const reason =
        error instanceof Error && "reason" in error
          ? String(error.reason)
          : "input_failed";
      logger.error("generation input preparation failed", { error, reason });
      await this.#failBeforeCharge(payload, reason);
      return;
    }

    const token = await runtime.createToken(adapter.timeout);
    runtime.setMetadata("step", "submitting");
    let jobId: string;
    try {
      const submitted = await prepared.submit(token.url);
      jobId = submitted.id;
    } catch (error) {
      logger.error("provider submit failed", {
        error,
        modelId: payload.modelId,
      });
      await this.#failBeforeCharge(payload, "submit_failed");
      return;
    }

    const attached = await queries.attachRunpodJob(
      payload.userId,
      payload.generationId,
      { ...prepared.attach, runpodJobId: jobId }
    );
    if (!attached) {
      await this.#cancelProvider(payload.modelId, jobId);
      runtime.setMetadata("step", "skipped");
      return;
    }
    runtime.setMetadata("runpodJobId", jobId);

    const charged = await this.#dependencies.billing.charge(
      payload.userId,
      payload.priceCoins,
      jobId
    );
    if (charged !== "ok") {
      await this.#cancelProvider(payload.modelId, jobId);
      await this.#failBeforeCharge(payload, "insufficient_coins");
      return;
    }

    if (!(await queries.markGenerating(payload.userId, payload.generationId))) {
      await this.#cancelProvider(payload.modelId, jobId);
      await this.#dependencies.billing.refund(payload.userId, jobId);
      runtime.setMetadata("step", "cancelled");
      return;
    }

    runtime.setMetadata("status", "generating");
    runtime.setMetadata("step", "generating");
    const webhookFired = await token.wait();
    let status: RunpodStatus;
    try {
      status = await this.#readTerminalStatus(
        payload.modelId,
        jobId,
        webhookFired
      );
    } catch (error) {
      logger.error("provider status check failed", { error, jobId });
      await this.#failAfterCharge(payload, jobId, "status_check_failed");
      return;
    }

    const metrics = metricsOf(status);
    if (TERMINAL_FAILURES.has(status.status ?? "")) {
      await this.#failAfterCharge(
        payload,
        jobId,
        status.error || `run_${(status.status ?? "").toLowerCase()}`,
        metrics
      );
      return;
    }
    if (status.status !== "COMPLETED") {
      await this.#failAfterCharge(payload, jobId, "timed_out", metrics);
      return;
    }

    if (
      !(await queries.markPostProcessing(payload.userId, payload.generationId))
    ) {
      runtime.setMetadata("step", "cancelled");
      return;
    }
    runtime.setMetadata("status", "post_processing");
    runtime.setMetadata("step", "post-processing");

    let urls: string[];
    try {
      urls = await adapter.storeOutput(payload, status);
    } catch (error) {
      logger.error("generation output processing failed", { error, jobId });
      await this.#failAfterCharge(payload, jobId, "output_failed", metrics);
      return;
    }
    if (urls.length === 0) {
      await this.#failAfterCharge(
        payload,
        jobId,
        payload.kind === "image" ? "no_images" : "no_videos",
        metrics
      );
      return;
    }

    const completed = await queries.markCompleted(
      payload.userId,
      payload.generationId,
      urls,
      metrics
    );
    if (completed) {
      runtime.setMetadata("status", "completed");
      runtime.setMetadata("step", "completed");
    }
    await runtime.flushMetadata();
    if (completed) {
      await this.#dependencies.notify.trigger({
        executionTimeMs: status.executionTime,
        generationId: payload.generationId,
        kind: payload.kind,
        modelId: payload.modelId,
        priceCoins: payload.priceCoins,
        resultUrls: urls,
        userId: payload.userId,
      });
    }
  }

  async onFailure(payload: GenerationRunPayload): Promise<void> {
    const won = await this.#dependencies.queries.markFailed(
      payload.userId,
      payload.generationId,
      "task_failed"
    );
    if (won?.runpodJobId) {
      await this.#dependencies.billing.refund(payload.userId, won.runpodJobId);
    }
  }

  async #cancelProvider(modelId: string, jobId: string): Promise<void> {
    await this.#dependencies.workflowExecution
      .cancel(modelId, jobId)
      .catch((error) =>
        logger.warn("provider cancel failed", { error, jobId })
      );
  }

  async #failAfterCharge(
    payload: GenerationRunPayload,
    jobId: string,
    reason: string,
    metrics?: RunMetrics
  ): Promise<void> {
    this.#dependencies.runtime.setMetadata("step", "failed");
    this.#dependencies.runtime.setMetadata("failReason", reason);
    const failed = await this.#dependencies.queries.markFailed(
      payload.userId,
      payload.generationId,
      reason,
      metrics
    );
    if (failed) {
      this.#dependencies.runtime.setMetadata("status", "failed");
      await this.#dependencies.billing.refund(payload.userId, jobId);
    }
    await this.#dependencies.runtime.flushMetadata();
  }

  async #failBeforeCharge(
    payload: GenerationRunPayload,
    reason: string
  ): Promise<void> {
    this.#dependencies.runtime.setMetadata("step", "failed");
    this.#dependencies.runtime.setMetadata("failReason", reason);
    const failed = await this.#dependencies.queries.markFailed(
      payload.userId,
      payload.generationId,
      reason
    );
    if (failed) {
      this.#dependencies.runtime.setMetadata("status", "failed");
    }
    await this.#dependencies.runtime.flushMetadata();
  }

  async #readTerminalStatus(
    modelId: string,
    jobId: string,
    webhookFired: boolean
  ): Promise<RunpodStatus> {
    let status = await this.#dependencies.workflowExecution.getStatus(
      modelId,
      jobId
    );
    if (webhookFired) {
      for (let attempt = 1; !isTerminal(status) && attempt <= 5; attempt += 1) {
        await this.#dependencies.runtime.waitForPoll();
        status = await this.#dependencies.workflowExecution.getStatus(
          modelId,
          jobId
        );
      }
    }
    return status;
  }
}

// Two adapters form the real media seam; GenerationRun owns shared lifecycle.
// eslint-disable-next-line max-classes-per-file
class ImageGenerationAdapter implements GenerationAdapter {
  readonly kind = "image" as const;
  readonly timeout = "10m" as const;
  readonly #config: StudioConfig;
  readonly #workflowExecution: WorkflowExecution;

  constructor(config: StudioConfig, workflowExecution: WorkflowExecution) {
    this.#config = config;
    this.#workflowExecution = workflowExecution;
  }

  async prepare(payload: GenerationRunPayload): Promise<PreparedGeneration> {
    if (payload.kind !== "image") {
      throw inputError("invalid_image_payload");
    }
    const model = this.#config.models.find(
      (candidate) => candidate.id === payload.modelId
    );
    if (!model) {
      throw inputError("unknown_model");
    }
    const [poseImage, referenceImage] = await Promise.all([
      payload.poseImageKey
        ? this.#config.storage.getBase64(payload.poseImageKey)
        : undefined,
      payload.referenceImageKey
        ? this.#config.storage.getBase64(payload.referenceImageKey)
        : undefined,
    ]);
    const loras = payload.loras.flatMap((value) => {
      const selection = decodeLoraSelection(value);
      const spec = model.loras?.find((lora) => lora.id === selection.id);
      return spec
        ? [
            {
              file: spec.file,
              strength: resolveLoraStrength(spec, selection.strength),
            },
          ]
        : [];
    });
    return {
      attach: {
        moderatedPrompt: payload.moderatedPrompt,
        moderationAction: payload.moderationAction,
        originalPrompt: payload.originalPrompt,
        pose:
          payload.posePreset ??
          (payload.poseImageKey
            ? this.#config.storage.publicUrl(payload.poseImageKey)
            : undefined),
        prompt: payload.prompt,
        referenceImageUrl: payload.referenceImageKey
          ? this.#config.storage.publicUrl(payload.referenceImageKey)
          : undefined,
      },
      submit: async (webhookUrl) =>
        await this.#workflowExecution.submitImage(
          payload.modelId,
          {
            aspect_ratio: RATIO_TO_ASPECT_RATIO[payload.ratio],
            loras,
            poseImage,
            prompt: payload.prompt,
            referenceImage,
            seed: payload.seed,
          },
          webhookUrl
        ),
    };
  }

  async storeOutput(
    payload: GenerationRunPayload,
    status: RunpodStatus
  ): Promise<string[]> {
    const images = await postProcessImages(
      this.#config,
      status.output?.images ?? [],
      payload.generationId,
      new Date(payload.createdAt)
    );
    return images.flatMap((image) => (image.url ? [image.url] : []));
  }
}

// eslint-disable-next-line max-classes-per-file
class VideoGenerationAdapter implements GenerationAdapter {
  readonly kind = "video" as const;
  readonly timeout = "20m" as const;
  readonly #config: StudioConfig;
  readonly #workflowExecution: WorkflowExecution;

  constructor(config: StudioConfig, workflowExecution: WorkflowExecution) {
    this.#config = config;
    this.#workflowExecution = workflowExecution;
  }

  async prepare(payload: GenerationRunPayload): Promise<PreparedGeneration> {
    if (payload.kind !== "video") {
      throw inputError("invalid_video_payload");
    }
    if (!this.#config.video) {
      throw inputError("unknown_model");
    }
    let sourceImage: string | undefined;
    for (const key of payload.sourceImageKeys) {
      try {
        sourceImage = await this.#config.storage.getBase64(key);
        break;
      } catch {
        // Try clean source first, then public fallback.
      }
    }
    if (!sourceImage) {
      throw inputError("source_missing");
    }
    const resolved = await resolveGenerationPrompt({
      moderation: this.#config.moderation,
      prompt: payload.prompt,
      referenceImage: sourceImage,
      userId: payload.userId,
    });
    if (resolved.action === "block") {
      throw inputError("content_policy");
    }
    const { video } = this.#config;
    return {
      attach: {
        moderatedPrompt: resolved.moderatedPrompt,
        moderationAction: resolved.moderationAction,
        originalPrompt: resolved.originalPrompt,
        prompt: resolved.prompt,
      },
      submit: async (webhookUrl) =>
        await this.#workflowExecution.submitVideo(
          payload.modelId,
          {
            durationSeconds: payload.durationSeconds,
            fps: video.fps,
            prompt: resolved.prompt,
            seed: payload.seed,
            sourceImage,
          },
          webhookUrl
        ),
    };
  }

  async storeOutput(
    payload: GenerationRunPayload,
    status: RunpodStatus
  ): Promise<string[]> {
    const data = status.output?.videos?.find((video) => video.data)?.data;
    if (!data) {
      return [];
    }
    const stem = `${new Date(payload.createdAt).getTime()}-1`;
    const key = `${payload.generationId}/${stem}.mp4`;
    await this.#config.storage.upload(
      key,
      Buffer.from(data, "base64"),
      "video/mp4"
    );
    return [this.#config.storage.publicUrl(key)];
  }
}

const triggerRuntime: GenerationRunRuntime = {
  async createToken(timeout) {
    const token = await wait.createToken({ timeout });
    return {
      id: token.id,
      url: token.url,
      wait: async () => {
        const result = await wait.forToken(token);
        return result.ok;
      },
    };
  },
  async flushMetadata() {
    await metadata
      .flush()
      .catch((error) => logger.warn("metadata flush failed", { error }));
  },
  setMetadata(key, value) {
    metadata.set(key, value);
  },
  async waitForPoll() {
    await wait.for({ seconds: 6 });
  },
};

export const createGenerationRunTask = (
  config: StudioConfig,
  queries: GenerationRepository,
  notify: NotifyGenerationTask,
  workflowExecution: WorkflowExecution
) => {
  const adapters = [
    new ImageGenerationAdapter(config, workflowExecution),
    new VideoGenerationAdapter(config, workflowExecution),
  ];
  const generationRun = new GenerationRun({
    adapters: new Map(adapters.map((adapter) => [adapter.kind, adapter])),
    billing: config.billing,
    notify,
    queries,
    runtime: triggerRuntime,
    workflowExecution,
  });
  return schemaTask({
    id: "generation-run",
    onFailure: async ({ payload, error }) => {
      logger.error("generation-run task failed", {
        error,
        generationId: payload.generationId,
      });
      await generationRun.onFailure(payload);
    },
    retry: { maxAttempts: 1 },
    run: async (payload) => await generationRun.execute(payload),
    schema: generationRunPayloadSchema,
  });
};

export type GenerationRunTask = ReturnType<typeof createGenerationRunTask>;
