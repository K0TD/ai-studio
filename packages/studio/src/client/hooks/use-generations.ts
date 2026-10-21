"use client";

import { useQuery } from "@tanstack/react-query";

import type { RatioKey, ResolutionKey } from "../../config/types";
import { GENERATIONS_QUERY_KEY } from "../../query-keys";
import type { GenerationStatus } from "../../schema/generation";
import { GenerationProjection } from "../generation-projection";
import { useStudioStore } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import { useStudioHttp } from "../studio-http-context";
import type { StudioResult } from "../types";

export { GENERATIONS_QUERY_KEY } from "../../query-keys";

// Fallback for pending rows the realtime subscription can't cover (legacy
// rows with no requestId): plain fast polling.
const LEGACY_FALLBACK_POLL_MS = 5000;
// Safety net while a realtime subscription is active: catches an expired
// token (runs pending past its 15m lifetime) or a silently dropped socket.
const REALTIME_SAFETY_POLL_MS = 60_000;

// The persisted generation row as serialized by the API (timestamps are ISO
// strings over the wire).
export interface GenerationRow {
  id: string;
  /** Null while the background pipeline hasn't submitted the job yet. */
  runpodJobId: string | null;
  /** Orchestrator batch id (runs tagged `req_<requestId>`); null on legacy rows. */
  requestId: string | null;
  /** Set once the orchestrator batch-triggered the children; null while the
   * prompt pipeline runs, and forever on legacy/failed-early rows. */
  queuedAt: string | null;
  modelId: string;
  mediaType: "image" | "video";
  /** Video rows: the completed image generation the video animates. */
  sourceGenerationId: string | null;
  /** Video rows: requested clip length in seconds. */
  durationSeconds: number | null;
  prompt: string;
  title: string | null;
  priceCoins: number;
  ratio: RatioKey;
  resolution: ResolutionKey;
  status: GenerationStatus;
  resultUrls: string[];
  error: string | null;
  seed: number | null;
  loras: string[];
  originalPrompt: string | null;
  referenceImageUrl: string | null;
  pose: string | null;
  createdAt: string;
  updatedAt: string;
}

// Present when the list has pending rows: the batches to subscribe to and a
// token scoped to their `req_<requestId>` tags, minted fresh on every fetch.
export interface RealtimeInfo {
  requestIds: string[];
  publicAccessToken: string;
}

export interface GenerationsData {
  realtime: RealtimeInfo | null;
  rows: GenerationRow[];
}

// The user's generation history, newest first. Source of truth for the
// gallery; pending rows are resumed by the realtime subscriptions the
// response's `realtime` info drives (see <GenerationRealtime>), which
// invalidate this query as runs finish — so this also survives a reload.
export const useGenerations = () => {
  const http = useStudioHttp();
  return useQuery({
    queryFn: async (): Promise<GenerationsData> => {
      const { generations, realtime } = await http.get("generations").json<{
        generations: GenerationRow[];
        realtime: RealtimeInfo | null;
      }>();
      return {
        realtime,
        rows: generations,
      };
    },
    queryKey: GENERATIONS_QUERY_KEY,
    refetchInterval: (query) => {
      const { data } = query.state;
      const hasPending = data?.rows.some(
        (row) =>
          row.status === "preparing" ||
          row.status === "queued" ||
          row.status === "generating" ||
          row.status === "post_processing"
      );
      if (!hasPending) {
        return false;
      }
      return data?.realtime ? REALTIME_SAFETY_POLL_MS : LEGACY_FALLBACK_POLL_MS;
    },
  });
};

// The generation list with the realtime metadata steps overlaid: in-flight
// cards take whichever status is furthest along; terminal rows ignore the
// overlay entirely.
export const useLiveResults = (): StudioResult[] => {
  const { data } = useGenerations();
  const config = useStudioConfig();
  const optimistic = useStudioStore((state) => state.optimisticGenerations);
  const realtime = useStudioStore((state) => state.generationRealtimeEvents);
  return new GenerationProjection({
    models: config.models,
    optimistic,
    realtime,
    rows: data?.rows ?? [],
  }).results();
};
