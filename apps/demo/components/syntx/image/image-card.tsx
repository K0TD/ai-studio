"use client";
import Image from "next/image";
import { useState } from "react";
import { toast } from "sonner";

import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import type { GenerationItem } from "@/lib/routerai/types";
import { useSyntxStore } from "@/lib/store/syntx-store";

import { GenerationCard } from "../shell/generation-card";
export const ImageCard = ({
  item,
}: {
  item: GenerationItem;
  onRetry?: (prompt: string) => void;
  onDelete?: (id: string) => void;
}) => {
  const [zoom, setZoom] = useState<string | null>(null);
  const restore = () => {
    const state = useSyntxStore.getState();
    state.setPrompt(item.prompt);
    state.updateImageSettings({
      aspectRatio: item.metadata?.aspectRatio ?? "auto",
      modelId: item.modelId,
      resolution: item.metadata?.resolution ?? "1K",
    });
    toast.success("Промпт, модель, формат и разрешение восстановлены");
  };
  return (
    <GenerationCard item={item} onRestore={restore}>
      {item.status === "completed" && (
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {item.outputUrls.map((url, index) => (
            <button
              type="button"
              key={url}
              className="relative aspect-square overflow-hidden rounded-xl bg-muted"
              aria-label={`Увеличить изображение ${index + 1}`}
              onClick={() => setZoom(url)}
            >
              <Image
                alt={item.prompt}
                src={url}
                fill
                unoptimized
                sizes="(min-width:640px) 400px,90vw"
                className="object-cover"
              />
            </button>
          ))}
        </div>
      )}
      <Dialog
        open={zoom !== null}
        onOpenChange={(open) => {
          if (!open) {
            setZoom(null);
          }
        }}
      >
        <DialogContent
          className="max-h-[90dvh] sm:max-w-5xl"
          aria-describedby={undefined}
        >
          <DialogTitle className="sr-only">Просмотр изображения</DialogTitle>
          {zoom && (
            <div className="relative h-[75dvh]">
              <Image
                alt={item.prompt}
                src={zoom}
                fill
                unoptimized
                sizes="90vw"
                className="object-contain"
              />
            </div>
          )}
        </DialogContent>
      </Dialog>
    </GenerationCard>
  );
};
