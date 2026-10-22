"use client";
import type { GenerationItem } from "@/lib/routerai/types";

import { GenerationCard } from "../shell/generation-card";
import { VideoPlayer } from "./video-player";
export const VideoCard = ({
  item,
  onRetry,
}: {
  item: GenerationItem;
  onRetry?: (prompt: string) => void;
  onDelete?: (id: string) => void;
}) => {
  const [url] = item.outputUrls;
  return (
    <GenerationCard
      item={item}
      onRestore={onRetry ? () => onRetry(item.prompt) : undefined}
    >
      {item.status === "completed" && url && (
        <VideoPlayer
          src={url}
          durationSeconds={item.metadata?.durationSeconds}
          resolution={item.metadata?.resolution}
        />
      )}
    </GenerationCard>
  );
};
