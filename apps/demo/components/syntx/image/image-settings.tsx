"use client";
import { IMAGE_FAMILIES, isBudgetModel } from "@/lib/routerai/models-catalog";
import type { ModelMetadata } from "@/lib/routerai/types";
import { disabledModelReason, modelAllowed } from "@/lib/store/client-policy";
import { useSyntxStore } from "@/lib/store/syntx-store";

import { ModelAvailability } from "../shell/model-availability";
const input =
  "w-full rounded-lg border border-border bg-background p-2 text-xs";
const isBackground = (
  value: string
): value is "auto" | "transparent" | "opaque" =>
  value === "auto" || value === "transparent" || value === "opaque";
const isOutputFormat = (
  value: string
): value is "png" | "jpeg" | "webp" | "svg" =>
  value === "png" || value === "jpeg" || value === "webp" || value === "svg";
interface ImageParametersProps {
  selectedModel: ModelMetadata;
}
const ImageParameters = ({ selectedModel }: ImageParametersProps) => {
  const { imageSettings, updateImageSettings } = useSyntxStore();
  return (
    <section className="grid gap-4 rounded-xl border bg-card/60 p-4">
      <h2 className="font-semibold">Параметры</h2>
      <label className="grid gap-2">
        Соотношение сторон
        <select
          className={input}
          value={imageSettings.aspectRatio}
          onChange={(e) => updateImageSettings({ aspectRatio: e.target.value })}
        >
          <option value="auto">Auto</option>
          {selectedModel.supportedAspectRatios
            ?.filter((r) => r !== "auto" && r !== "Auto")
            .map((ratio) => (
              <option key={ratio}>{ratio}</option>
            ))}
        </select>
      </label>
      {selectedModel.supportedResolutions?.length ? (
        <label className="grid gap-2">
          Разрешение
          <select
            className={input}
            value={imageSettings.resolution}
            onChange={(e) =>
              updateImageSettings({ resolution: e.target.value })
            }
          >
            {selectedModel.supportedResolutions.map((res) => (
              <option key={res}>{res}</option>
            ))}
          </select>
        </label>
      ) : null}
      {selectedModel.supportedQualities?.length ? (
        <label className="grid gap-2">
          Качество
          <select
            className={input}
            value={imageSettings.quality}
            onChange={(e) => updateImageSettings({ quality: e.target.value })}
          >
            {selectedModel.supportedQualities.map((quality) => (
              <option value={quality} key={quality}>
                {quality === "auto" ? "Auto" : quality}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <label className="grid gap-2">
        Количество
        <select
          className={input}
          value={imageSettings.n}
          onChange={(e) => updateImageSettings({ n: Number(e.target.value) })}
        >
          {Array.from(
            { length: Math.min(selectedModel.maxImageCount ?? 1, 4) },
            (_, index) => (
              <option value={index + 1} key={index}>
                {index + 1}
              </option>
            )
          )}
        </select>
      </label>
      {selectedModel.supportedOutputFormats?.length ? (
        <label className="grid gap-2">
          Формат
          <select
            className={input}
            value={imageSettings.outputFormat}
            onChange={(e) => {
              const outputFormat = e.target.value;
              if (
                outputFormat === "png" ||
                outputFormat === "jpeg" ||
                outputFormat === "webp" ||
                outputFormat === "svg"
              ) {
                updateImageSettings({ outputFormat });
              }
            }}
          >
            {selectedModel.supportedOutputFormats.map((format) => (
              <option value={format} key={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {selectedModel.supportedBackgrounds?.length ? (
        <label className="grid gap-2">
          Фон
          <select
            className={input}
            value={imageSettings.background}
            onChange={(e) => {
              const background = e.target.value;
              if (
                background === "auto" ||
                background === "transparent" ||
                background === "opaque"
              ) {
                updateImageSettings({ background });
              }
            }}
          >
            {selectedModel.supportedBackgrounds.map((background) => (
              <option value={background} key={background}>
                {background === "auto" ? "Auto" : background}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      {selectedModel.supportsSeed && (
        <label className="grid gap-2">
          Seed
          <input
            className={input}
            type="number"
            min={0}
            max={2_147_483_647}
            value={imageSettings.seed ?? ""}
            onChange={(e) =>
              updateImageSettings({
                seed: e.target.value ? Number(e.target.value) : undefined,
              })
            }
          />
        </label>
      )}
      {selectedModel.supportsNegativePrompt && (
        <label className="grid gap-2">
          Исключить из результата
          <textarea
            className={input}
            maxLength={2000}
            value={imageSettings.negativePrompt ?? ""}
            onChange={(e) =>
              updateImageSettings({ negativePrompt: e.target.value })
            }
          />
        </label>
      )}
    </section>
  );
};

export const ImageSettingsPanel = () => {
  const {
    models,
    unavailableModels,
    imageSettings,
    updateImageSettings,
    user,
  } = useSyntxStore();

  const isVip = user?.role === "vip" || user?.role === "admin";

  const catalog = [...models, ...unavailableModels].filter(
    (model) => model.category === "image"
  );
  const families = IMAGE_FAMILIES.map((family) => ({
    ...family,
    models: family.models.flatMap((candidate) => {
      const live = catalog.find((model) => model.id === candidate.id);
      return live ? [live] : [];
    }),
  })).filter((family) => family.models.length > 0);
  const currentModel =
    catalog.find((model) => model.id === imageSettings.modelId) ??
    models.find((model) => model.category === "image") ??
    catalog[0];
  const selectedFamily = families.find((family) =>
    family.models.some((model) => model.id === currentModel?.id)
  );
  if (!currentModel || !selectedFamily) {
    return <ModelAvailability tab="image" />;
  }
  const isAllowed =
    models.some((model) => model.id === currentModel.id) &&
    modelAllowed(user, currentModel);
  const disabledReason = unavailableModels.find(
    (model) => model.id === currentModel.id
  )?.disabledReason;

  const choose = (id: string) => {
    const next = models.find((model) => model.id === id);
    if (!next) {
      return;
    }
    updateImageSettings({
      aspectRatio: next.supportedAspectRatios?.[0] ?? "auto",
      background: next.supportedBackgrounds?.find(isBackground) ?? "auto",
      modelId: id,
      n: 1,
      negativePrompt: undefined,
      outputFormat: next.supportedOutputFormats?.find(isOutputFormat) ?? "png",
      quality: next.supportedQualities?.[0] ?? "auto",
      referenceImageUrl: undefined,
      resolution: next.supportedResolutions?.[0] ?? "1K",
      seed: undefined,
    });
  };

  const handleFamilyChange = (familyId: string) => {
    const family = families.find((candidate) => candidate.id === familyId);
    const available = family?.models.filter((candidate) =>
      models.some((model) => model.id === candidate.id)
    );
    const next =
      available?.find((model) => model.id === family?.defaultModelId) ??
      available?.[0];
    if (next) {
      choose(next.id);
    }
  };

  const selectedModel = currentModel;

  return (
    <div className="grid gap-3 text-xs">
      <section className="grid gap-3 rounded-xl border bg-card/60 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Модель изображения</h2>
          {isVip ? (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold text-amber-500">
              👑 VIP
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              Базовый
            </span>
          )}
        </div>

        {/* 1. Семейство модели */}
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Семейство модели
          </span>
          <select
            className={input}
            value={selectedFamily.id}
            onChange={(e) => handleFamilyChange(e.target.value)}
          >
            {families.map((fam) => {
              const hasBudget = fam.models.some((m) => isBudgetModel(m.id));
              return (
                <option
                  value={fam.id}
                  key={fam.id}
                  disabled={
                    !fam.models.some((candidate) =>
                      models.some((model) => model.id === candidate.id)
                    )
                  }
                >
                  {fam.name} {!hasBudget && !isVip ? "👑 [VIP]" : ""}
                </option>
              );
            })}
          </select>
        </label>

        {/* 2. Модификация / версия */}
        <label className="grid gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground">
            Модификация модели
          </span>
          <select
            className={input}
            value={selectedModel.id}
            onChange={(e) => choose(e.target.value)}
          >
            {selectedFamily.models.map((model) => {
              const mAllowed =
                models.some((candidate) => candidate.id === model.id) &&
                modelAllowed(user, model);
              const reason = unavailableModels.find(
                (candidate) => candidate.id === model.id
              )?.disabledReason;
              return (
                <option value={model.id} key={model.id} disabled={!mAllowed}>
                  {mAllowed ? "✓ " : `${disabledModelReason(reason)} · `}
                  {model.name} · {model.basePriceRub} ₽
                </option>
              );
            })}
          </select>
        </label>

        {/* Бейджи и информация о тарифе */}
        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
          {selectedFamily.badge && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {selectedFamily.badge}
            </span>
          )}
          {selectedModel.badge && (
            <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {selectedModel.badge}
            </span>
          )}
          {isBudgetModel(selectedModel) ? (
            <span className="rounded-md border border-emerald-500/20 bg-emerald-500/10 px-1.5 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400">
              Бюджетная · {selectedModel.basePriceRub} ₽
            </span>
          ) : (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
              👑 VIP · {selectedModel.basePriceRub} ₽
            </span>
          )}
        </div>

        {/* Предупреждение для пользователя, если выбрана VIP-модель на базовом тарифе */}
        {!isAllowed && (
          <output className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-xs">
            {disabledModelReason(disabledReason)}. Выберите доступную модель.
          </output>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {selectedModel.description ?? selectedFamily.description}
        </p>
      </section>
      <ImageParameters selectedModel={selectedModel} />
    </div>
  );
};
