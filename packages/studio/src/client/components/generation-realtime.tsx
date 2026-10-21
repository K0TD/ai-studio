"use client";

import { useQueryClient } from "@tanstack/react-query";
import { useRealtimeRunsWithTag } from "@trigger.dev/react-hooks";
import { useRef } from "react";

import {
  GenerationProjection,
  generationRealtimeMetadataSchema,
  shouldRefreshGeneration,
} from "../generation-projection";
import type { GenerationRealtimeEvent } from "../generation-projection";
import { useInvalidateBalance } from "../hooks/use-balance";
import { GENERATIONS_QUERY_KEY } from "../hooks/use-generations";
import { useStudioStore } from "../store/studio-store";
import { useMountEffect } from "../use-mount-effect";

interface GenerationRealtimeProps {
  requestId: string;
  accessToken: string;
}

// Refetches the generations list + balance once. Mounted (and remounted, via
// a `key`) per newly-terminal run id instead of reacting through useEffect.
const InvalidateOnMount = () => {
  const queryClient = useQueryClient();
  const invalidateBalance = useInvalidateBalance();
  useMountEffect(() => {
    queryClient.invalidateQueries({ queryKey: GENERATIONS_QUERY_KEY });
    invalidateBalance();
  });
  return null;
};

// Writes one run's live step into the store; keyed by `${runId}:${step}` so a
// step change remounts it. Unmounting the subscription clears its entries.
const SyncRealtimeEvent = ({ event }: { event: GenerationRealtimeEvent }) => {
  const addEvent = useStudioStore((s) => s.addGenerationRealtimeEvent);
  const removeEvent = useStudioStore((s) => s.removeGenerationRealtimeEvent);
  useMountEffect(() => {
    addEvent(event);
    return () => removeEvent(event);
  });
  return null;
};

// Headless. Subscribes to every run tagged `req_<requestId>` and:
// - mirrors each child run's `step` metadata into the store as a live status
//   overlay (Preparing → Queued → Generating → Finishing without waiting for
//   a refetch; the run's `generationId` metadata maps it to its card);
// - refreshes the generations list + balance on refetch-worthy transitions:
//   terminal step/state (row done/failed; the orchestrator completing also
//   flips its rows to "Queued…" via their queuedAt stamp), or a child's
//   runpodJobId metadata appearing (the task attaches the id to the DB before
//   setting the metadata, so the refetch always sees it).
// Mounted once per pending request (keyed by requestId in the parent); once
// the invalidated refetch shows no pending row left for the request, the
// parent unmounts it.
export const GenerationRealtime = ({
  requestId,
  accessToken,
}: GenerationRealtimeProps) => {
  // Each list refetch mints a fresh token; keep the first one so refetches
  // don't tear down and re-open the subscription. A remount (new requestId
  // key) captures the then-current token.
  const token = useRef(accessToken).current;

  const { runs } = useRealtimeRunsWithTag(`req_${requestId}`, {
    accessToken: token,
    skipColumns: ["payload", "output"],
  });

  const parsedRuns = runs.map((run) => {
    const parsedMetadata = generationRealtimeMetadataSchema.safeParse(
      run.metadata
    );
    return {
      metadata: parsedMetadata.success ? parsedMetadata.data : undefined,
      run,
    };
  });

  // One key per observed transition. Keys only ever get added, so
  // each mounts its invalidation exactly once. A run turning terminal via
  // metadata and later via isCompleted shares one key, so it fires once.
  const invalidateKeys = parsedRuns.flatMap(({ metadata, run }) =>
    shouldRefreshGeneration({
      isCancelled: run.isCancelled,
      isCompleted: run.isCompleted,
      metadata,
    })
      ? [`${run.id}:${metadata?.status ?? metadata?.step ?? "run"}`]
      : []
  );

  const realtimeEvents = parsedRuns.flatMap(({ metadata, run }) => {
    const event = metadata
      ? GenerationProjection.realtimeEvent(metadata)
      : undefined;
    return event ? [{ event, key: `${run.id}:${event.status}` }] : [];
  });

  return (
    <>
      {invalidateKeys.map((key) => (
        <InvalidateOnMount key={key} />
      ))}
      {realtimeEvents.map((item) => (
        <SyncRealtimeEvent event={item.event} key={item.key} />
      ))}
    </>
  );
};
