"use client";
import { Copy, Download, RotateCw } from "lucide-react";
import type { ReactNode } from "react";
import { toast } from "sonner";

import type { GenerationItem } from "@/lib/routerai/types";

import { GenerationStatus } from "./generation-status";
const downloadResult = (url: string, id: string) => {
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `generation-${id}`;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
};
export const GenerationCard = ({
  item,
  children,
  onRestore,
}: {
  item: GenerationItem;
  children: ReactNode;
  onRestore?: () => void;
}) => {
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(item.prompt);
      toast.success("Промпт скопирован");
    } catch {
      toast.error("Не удалось скопировать промпт");
    }
  };
  const [url] = item.outputUrls;
  return (
    <article className="flex flex-col gap-3 rounded-2xl border border-black/5 bg-white/70 p-4 shadow-sm backdrop-blur-md dark:border-white/10 dark:bg-[#18181b]/70">
      <header className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[11px] text-[#f05138]">{item.modelId}</p>
          <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed">
            {item.prompt}
          </p>
        </div>
        <time
          className="shrink-0 text-right font-mono text-[11px] text-muted-foreground"
          dateTime={item.createdAt}
        >
          {new Date(item.createdAt).toLocaleString("ru-RU")}
        </time>
      </header>
      {children}
      <GenerationStatus item={item} />
      <footer className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded-md bg-[#f05138]/10 px-2 py-1 text-[#f05138]">
            {item.pricingSource === "actual" ? "Списано" : "Оценка"}:{" "}
            {item.costRub.toFixed(2)} ₽
          </span>
          {item.metadata?.aspectRatio && (
            <span>{item.metadata.aspectRatio}</span>
          )}
          {item.metadata?.resolution && <span>{item.metadata.resolution}</span>}
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="Скопировать промпт"
            onClick={copy}
            className="rounded-lg p-2 hover:bg-muted"
          >
            <Copy className="size-3.5" />
          </button>
          {onRestore && (
            <button
              type="button"
              aria-label="Восстановить промпт и параметры"
              onClick={onRestore}
              className="rounded-lg p-2 hover:bg-muted"
            >
              <RotateCw className="size-3.5" />
            </button>
          )}
          {url && (
            <button
              type="button"
              aria-label="Скачать результат"
              className="rounded-lg p-2 hover:bg-muted"
              onClick={() => downloadResult(url, item.id)}
            >
              <Download className="size-3.5" />
            </button>
          )}
        </div>
      </footer>
    </article>
  );
};
