"use client";
import { disabledModelReason } from "@/lib/store/client-policy";
import { useSyntxStore } from "@/lib/store/syntx-store";
export const ModelAvailability = ({
  tab,
}: {
  tab: "video" | "image" | "audio";
}) => {
  const models = useSyntxStore((state) => state.unavailableModels).filter(
    (model) => model.category === tab
  );
  return (
    <section className="rounded-xl border bg-muted/30 p-4 text-sm">
      <h2 className="font-medium">Недоступные модели</h2>
      <p className="mt-2 text-xs text-muted-foreground">
        Доступ и баланс изменяет администратор. Запуск возможен только с
        подтвержденным тарифом.
      </p>
      {models.length > 0 && (
        <ul className="mt-3 space-y-3">
          {models.map((model) => (
            <li key={model.id}>
              <p className="text-xs font-medium">{model.name}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {disabledModelReason(model.disabledReason)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
