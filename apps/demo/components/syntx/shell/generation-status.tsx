import type { GenerationItem } from "@/lib/routerai/types";
const statusMessage = (item: GenerationItem) => {
  if (item.status === "reconciling") {
    return "Проверяем результат и расход у провайдера. Резерв сохранен до подтверждения.";
  }
  if (item.status === "pending") {
    return "Задание выполняется. Результат появится автоматически.";
  }
  return item.metadata?.error ?? "Не удалось завершить генерацию.";
};
export const GenerationStatus = ({ item }: { item: GenerationItem }) => {
  if (item.status === "completed") {
    return null;
  }
  return (
    <output
      className={`block rounded-xl border p-3 text-sm ${item.status === "failed" ? "border-red-500/30 bg-red-500/5 text-red-600 dark:text-red-300" : "border-amber-500/25 bg-amber-500/5 text-amber-800 dark:text-amber-200"}`}
    >
      {statusMessage(item)}
    </output>
  );
};
