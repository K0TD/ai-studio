import { z } from "zod";

import type { StudioClientModel } from "../config/types";
import type { GenerationStatus } from "../schema/generation";
import type { GenerationRow, RealtimeInfo } from "./hooks/use-generations";
import type { StudioResult } from "./types";

const MS_PER_SECOND = 1000;

const ACTIVE_STATUS_RANK = {
  generating: 2,
  post_processing: 3,
  preparing: 0,
  queued: 1,
} as const satisfies Partial<Record<GenerationStatus, number>>;

const activeRank = (status: GenerationStatus): number => {
  switch (status) {
    case "preparing": {
      return ACTIVE_STATUS_RANK.preparing;
    }
    case "queued": {
      return ACTIVE_STATUS_RANK.queued;
    }
    case "generating": {
      return ACTIVE_STATUS_RANK.generating;
    }
    case "post_processing": {
      return ACTIVE_STATUS_RANK.post_processing;
    }
    default: {
      return -1;
    }
  }
};

const TERMINAL_STATUSES = new Set<GenerationStatus>([
  "cancelled",
  "completed",
  "failed",
]);

export const generationRealtimeMetadataSchema = z.object({
  generationId: z.string().optional(),
  runpodJobId: z.string().optional(),
  status: z
    .enum([
      "preparing",
      "queued",
      "generating",
      "post_processing",
      "completed",
      "failed",
      "cancelled",
    ])
    .optional(),
  step: z
    .enum([
      "completed",
      "downloading-inputs",
      "failed",
      "fanning-out",
      "generating",
      "post-processing",
      "processing-prompt",
      "skipped",
      "submitting",
      "cancelled",
    ])
    .optional(),
});

export type GenerationRealtimeMetadata = z.infer<
  typeof generationRealtimeMetadataSchema
>;

const TERMINAL_STEPS = new Set(["cancelled", "completed", "failed", "skipped"]);
const TERMINAL_REALTIME_STATUSES = new Set<GenerationStatus>([
  "cancelled",
  "completed",
  "failed",
]);

export const shouldRefreshGeneration = ({
  isCancelled,
  isCompleted,
  metadata,
}: {
  isCancelled: boolean;
  isCompleted: boolean;
  metadata?: GenerationRealtimeMetadata;
}): boolean =>
  isCompleted ||
  isCancelled ||
  TERMINAL_REALTIME_STATUSES.has(metadata?.status ?? "preparing") ||
  TERMINAL_STEPS.has(metadata?.step ?? "") ||
  Boolean(metadata?.runpodJobId);

export interface GenerationRealtimeEvent {
  generationId: string;
  status: GenerationStatus;
}

export interface OptimisticGeneration {
  requestId?: string;
  result: StudioResult;
}

export interface GenerationProjectionInput {
  models: StudioClientModel[];
  optimistic?: OptimisticGeneration[];
  realtime?: GenerationRealtimeEvent[];
  rows: GenerationRow[];
}

const statusFromMetadata = (
  metadata: GenerationRealtimeMetadata
): GenerationStatus | undefined => metadata.status;

const laterStatus = (
  persisted: GenerationStatus,
  incoming: GenerationStatus
): GenerationStatus => {
  if (TERMINAL_STATUSES.has(persisted)) {
    return persisted;
  }
  if (TERMINAL_STATUSES.has(incoming)) {
    return incoming;
  }
  return activeRank(incoming) > activeRank(persisted) ? incoming : persisted;
};

export class GenerationProjection {
  readonly #models: StudioClientModel[];
  readonly #optimistic: OptimisticGeneration[];
  readonly #realtime: GenerationRealtimeEvent[];
  readonly #rows: GenerationRow[];

  constructor(input: GenerationProjectionInput) {
    this.#models = input.models;
    this.#optimistic = input.optimistic ?? [];
    this.#realtime = input.realtime ?? [];
    this.#rows = input.rows;
  }

  static realtimeEvent(
    metadata: GenerationRealtimeMetadata
  ): GenerationRealtimeEvent | undefined {
    const status = statusFromMetadata(metadata);
    return metadata.generationId && status
      ? { generationId: metadata.generationId, status }
      : undefined;
  }

  results(): StudioResult[] {
    const persistedRequestIds = new Set(
      this.#rows.flatMap((row) => (row.requestId ? [row.requestId] : []))
    );
    const persisted = this.#rows.map((row) => this.#projectRow(row));
    const optimistic = this.#optimistic
      .filter(
        (item) => !item.requestId || !persistedRequestIds.has(item.requestId)
      )
      .map((item) => item.result);
    return [...optimistic, ...persisted];
  }

  #projectRow(row: GenerationRow): StudioResult {
    const model = this.#models.find(
      (candidate) => candidate.id === row.modelId
    );
    const startedAt = new Date(row.createdAt).getTime();
    const elapsed =
      (new Date(row.updatedAt).getTime() - startedAt) / MS_PER_SECOND;
    let realtimeStatus = row.status;
    for (const event of this.#realtime) {
      if (event.generationId === row.id) {
        realtimeStatus = laterStatus(realtimeStatus, event.status);
      }
    }

    return {
      coins: model?.coinCost ?? row.priceCoins,
      durationSeconds: row.durationSeconds ?? undefined,
      enhanced: row.originalPrompt !== null,
      errorCode: row.error ?? undefined,
      id: row.id,
      loras: row.loras,
      mediaType: row.mediaType,
      modelId: row.modelId,
      pose: row.pose ?? undefined,
      prompt: row.prompt,
      ratio: row.ratio,
      referenceImageUrl: row.referenceImageUrl ?? undefined,
      resolution: row.resolution,
      runpodJobId: row.runpodJobId ?? undefined,
      seed: row.seed ?? undefined,
      sourceGenerationId: row.sourceGenerationId ?? undefined,
      src: row.resultUrls[0] ?? "",
      startedAt,
      status: realtimeStatus,
      time: row.status === "completed" ? `${elapsed.toFixed(1)}s` : "",
      title: row.title ?? model?.name ?? row.modelId,
    };
  }
}

export interface GenerationProjectionData {
  realtime: RealtimeInfo | null;
  rows: GenerationRow[];
}
