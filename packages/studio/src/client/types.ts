import type { RatioKey, ResolutionKey } from "../config/types";
import type { GenerationStatus } from "../schema/generation";

const ACTIVE_GENERATION_STATUSES = new Set<GenerationStatus>([
  "preparing",
  "queued",
  "generating",
  "post_processing",
]);

export const isActiveGeneration = (status?: GenerationStatus): boolean =>
  status !== undefined && ACTIVE_GENERATION_STATUSES.has(status);

export const isFailedGeneration = (status?: GenerationStatus): boolean =>
  status === "failed" || status === "cancelled";

export interface StudioResult {
  id: string;
  /** Backend job id — present once the background pipeline submitted the run. */
  runpodJobId?: string;
  modelId?: string;
  title: string;
  /** Measured generation duration, e.g. "25.8s". Empty until completion. */
  time: string;
  /** Coins charged for this generation. */
  coins: number;
  ratio: RatioKey;
  resolution: ResolutionKey;
  /** Result media URL once done; empty while a run is active or failed. */
  src: string;
  prompt: string;
  /** Persisted generation lifecycle. Absent on static seed data. */
  status?: GenerationStatus;
  /** Failure code from the row (e.g. "content_policy"), set when failed. */
  errorCode?: string;
  /** Epoch ms the run was kicked off, used to measure elapsed time. */
  startedAt?: number;
  /**
   * Workflow seed the run used (server-generated unless pinned). -1 only on
   * legacy rows where the workflow randomized. Absent on rows predating it.
   */
  seed?: number;
  /** Enabled predefined LoRA ids at submit time. */
  loras?: string[];
  /** True when prompt enhancement rewrote the prompt before submit. */
  enhanced?: boolean;
  /** Public URL of the reference image used, if any. */
  referenceImageUrl?: string;
  /** Pose control: preset URL or an uploaded image URL. */
  pose?: string;
  /** What the row produced; absent means image (legacy rows, optimistic cards). */
  mediaType?: "image" | "video";
  /** Video rows: id of the completed image generation the video animates. */
  sourceGenerationId?: string;
  /** Video rows: requested clip length in seconds. */
  durationSeconds?: number;
}
