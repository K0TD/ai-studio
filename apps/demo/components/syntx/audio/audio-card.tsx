"use client";
import type { GenerationItem } from "@/lib/routerai/types";

import { GenerationCard } from "../shell/generation-card";
import { AudioPlayer } from "./audio-player";
export const AudioCard = ({
  item,
}: {
  item: GenerationItem;
  onDelete?: (id: string) => void;
}) => {
  const [url] = item.outputUrls;
  return (
    <GenerationCard item={item}>
      {item.status === "completed" && url && (
        <AudioPlayer
          src={url}
          title={item.metadata?.sunoTitle ?? "Озвучка"}
          subtitle={item.metadata?.audioVoice}
        />
      )}
    </GenerationCard>
  );
};
