"use client";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import type { GenerationItem } from "@/lib/routerai/types";
import {
  apiErrorSchema,
  generationResponseSchema,
  quoteResponseSchema,
} from "@/lib/store/client-contracts";
import { useSyntxStore } from "@/lib/store/syntx-store";

const elapsedTime = (createdAt: string) => {
  const elapsed = Math.max(0, Date.now() - new Date(createdAt).getTime());
  const seconds = Math.floor(elapsed / 1000);
  if (seconds < 60) {
    return `${seconds} сек.`;
  }
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) {
    return `${minutes} мин. ${seconds % 60} сек.`;
  }
  return `${Math.floor(minutes / 60)} ч. ${minutes % 60} мин.`;
};

const stageLabels = {
  completed: "Генерация завершена.",
  failed: "Генерация завершилась ошибкой.",
  persisting: "Получаем результат и сохраняем файл.",
  queued: "Задание в очереди.",
  reconciling: "Сверяем результат генерации.",
  running: "Провайдер выполняет генерацию.",
  submitting: "Отправляем запрос провайдеру и ждём подтверждение.",
} satisfies Record<GenerationItem["stage"], string>;

const statusMessage = (item: GenerationItem) => {
  if (item.status === "reconciling") {
    return `Результат пока не подтверждён. Система сохраняет задачу для сверки и не отправляет повторный платный запрос. ${item.reserveCostRub ? `Резерв ${item.reserveCostRub} ₽ сохранён, списания пока нет.` : "Средства пока остаются в резерве."} Номер задания: ${item.id}`;
  }
  if (item.status === "failed") {
    const alternatives = item.metadata?.providerOptions
      ?.filter((provider) => provider.tag !== item.metadata?.provider?.tag)
      .map((provider) => `${provider.name} — ${provider.estimatedCostRub} ₽`);
    return `${item.metadata?.error ?? "Не удалось завершить генерацию."} Резерв возвращён.${alternatives?.length ? ` Доступны другие тарифы: ${alternatives.join("; ")}. Ниже можно пересчитать стоимость и запустить новое задание.` : ""}`;
  }
  return `${stageLabels[item.stage] ?? "Задание выполняется."} ${item.reserveCostRub ? `Резерв ${item.reserveCostRub} ₽ сохранён; итоговое списание будет по фактическому расходу RouterAI.` : "Средства зарезервированы до завершения."}`;
};
export const GenerationStatus = ({ item }: { item: GenerationItem }) => {
  const [providerTag, setProviderTag] = useState("");
  const [quote, setQuote] = useState<{
    id: string;
    estimatedCostRub: string;
    reserveCostRub: string;
    provider: { tag: string; name: string; estimatedCostRub: string };
  } | null>(null);
  const [working, setWorking] = useState(false);
  const retryIdempotency = useRef<{ quoteId: string; key: string } | null>(
    null
  );
  const store = useSyntxStore();
  const availableRub = Number(store.user?.availableRub ?? "0.00");
  const alternativeProviders = (item.metadata?.providerOptions ?? []).filter(
    (provider) => provider.tag !== item.metadata?.provider?.tag
  );
  const firstAlternativeTag = alternativeProviders[0]?.tag ?? "";
  useEffect(() => {
    setProviderTag(firstAlternativeTag);
    setQuote(null);
    retryIdempotency.current = null;
  }, [firstAlternativeTag, item.id]);
  const requestRetryQuote = async () => {
    if (!providerTag || working) {
      return;
    }
    setQuote(null);
    retryIdempotency.current = null;
    setWorking(true);
    try {
      const response = await fetch(`/api/k0td-ai/jobs/${item.id}/retry-quote`, {
        body: JSON.stringify({ providerTag }),
        headers: { "Content-Type": "application/json" },
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        const parsedError = apiErrorSchema.safeParse(body);
        throw new Error(
          parsedError.success
            ? parsedError.data.error
            : "Не удалось пересчитать цену"
        );
      }
      setQuote(quoteResponseSchema.parse(body).quote);
      retryIdempotency.current = null;
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось пересчитать цену"
      );
    } finally {
      setWorking(false);
    }
  };
  const retryWithQuote = async () => {
    if (!quote || working) {
      return;
    }
    setWorking(true);
    try {
      if (retryIdempotency.current?.quoteId !== quote.id) {
        retryIdempotency.current = {
          key: crypto.randomUUID(),
          quoteId: quote.id,
        };
      }
      const response = await fetch(`/api/k0td-ai/jobs/${item.id}/retry`, {
        body: JSON.stringify({ quoteId: quote.id }),
        headers: {
          "Content-Type": "application/json",
          "Idempotency-Key": retryIdempotency.current.key,
        },
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        const parsedError = apiErrorSchema.safeParse(body);
        throw new Error(
          parsedError.success
            ? parsedError.data.error
            : "Не удалось запустить повторную генерацию"
        );
      }
      const result = generationResponseSchema.parse(body);
      store.addGenerationItem(result.item);
      setQuote(null);
      retryIdempotency.current = null;
      toast.success(`Задание отправлено провайдеру ${quote.provider.name}`);
      await store.refreshServer();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Не удалось повторить генерацию"
      );
    } finally {
      setWorking(false);
    }
  };
  if (item.status === "completed") {
    return null;
  }
  return (
    <output
      className={`block rounded-xl border p-3 text-sm ${item.status === "failed" ? "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300" : "border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-200"}`}
    >
      <span className="inline-flex items-center gap-2" aria-live="polite">
        {item.status === "failed" ? null : (
          <span
            aria-hidden="true"
            className="size-2 shrink-0 animate-pulse rounded-full bg-current"
          />
        )}
        {statusMessage(item)}
      </span>
      {item.status === "failed" ? null : (
        <span aria-live="off" className="mt-1 block text-xs opacity-80">
          Выполняется {elapsedTime(item.createdAt)} · Последнее обновление
          задания: {new Date(item.updatedAt).toLocaleTimeString("ru-RU")}
        </span>
      )}
      {item.status === "failed" && alternativeProviders.length > 0 && (
        <div className="mt-3 grid gap-2 rounded-lg border border-current/15 bg-white/50 p-3 text-xs dark:bg-black/10">
          <p className="font-medium">Попробовать другой тариф RouterAI</p>
          <div className="flex flex-wrap gap-2">
            <select
              aria-label="Альтернативный провайдер"
              className="min-w-0 flex-1 rounded-md border border-current/20 bg-background px-2 py-1.5"
              onChange={(event) => {
                setProviderTag(event.target.value);
                setQuote(null);
                retryIdempotency.current = null;
              }}
              value={providerTag}
            >
              {alternativeProviders.map((provider) => (
                <option key={provider.tag} value={provider.tag}>
                  {provider.name} · {provider.estimatedCostRub} ₽ (оценка)
                </option>
              ))}
            </select>
            <button
              className="rounded-md border border-current/20 px-3 py-1.5 font-medium disabled:opacity-50"
              disabled={working || !providerTag}
              onClick={requestRetryQuote}
              type="button"
            >
              {working ? "Считаем…" : "Пересчитать"}
            </button>
          </div>
          {quote && (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span>
                {quote.provider.name}: оценка {quote.estimatedCostRub} ₽ ·
                резерв {quote.reserveCostRub} ₽
                {availableRub < 0
                  ? ` · долг ${Math.abs(availableRub).toFixed(2)} ₽`
                  : ""}
              </span>
              <button
                className="rounded-md bg-syntx-ink px-3 py-1.5 font-medium text-white disabled:opacity-50"
                disabled={
                  working || availableRub < Number(quote.reserveCostRub)
                }
                onClick={retryWithQuote}
                type="button"
              >
                {working ? "Отправляем…" : "Запустить по этой цене"}
              </button>
              {availableRub < Number(quote.reserveCostRub) && (
                <span className="basis-full text-red-600">
                  Недостаточно доступного баланса для резерва. Пополните счёт.
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </output>
  );
};
