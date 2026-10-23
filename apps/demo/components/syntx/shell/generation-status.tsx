import type { GenerationItem } from "@/lib/routerai/types";

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
    return `Результат пока не подтверждён. Система сохраняет задачу для сверки и не отправляет повторный платный запрос. ${item.maxCostRub ? `Резерв ${item.maxCostRub} ₽ сохранён, списания пока нет.` : "Средства пока остаются в резерве."} Номер задания: ${item.id}`;
  }
  if (item.status === "failed") {
    return `${item.metadata?.error ?? "Не удалось завершить генерацию."} Резерв возвращён; повторите попытку позже.`;
  }
  return `${stageLabels[item.stage] ?? "Задание выполняется."} ${item.maxCostRub ? `Резерв ${item.maxCostRub} ₽ сохранён до завершения.` : "Средства зарезервированы до завершения."}`;
};
export const GenerationStatus = ({ item }: { item: GenerationItem }) => {
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
    </output>
  );
};
