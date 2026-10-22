"use client";
import { useSyntxStore } from "@/lib/store/syntx-store";

import { ModelAvailability } from "../shell/model-availability";
const input =
  "w-full rounded-lg border border-border bg-background p-2 text-xs";
export const ImageSettingsPanel = () => {
  const { models, imageSettings, updateImageSettings } = useSyntxStore();
  const imageModels = models.filter((model) => model.category === "image");
  const selectedModel = imageModels.find(
    (model) => model.id === imageSettings.modelId
  );
  if (!selectedModel) {
    return <ModelAvailability tab="image" />;
  }
  const choose = (id: string) => {
    const next = imageModels.find((model) => model.id === id);
    if (!next) {
      return;
    }
    updateImageSettings({
      aspectRatio: next.supportedAspectRatios?.[0] ?? "auto",
      background: "auto",
      modelId: id,
      n: 1,
      negativePrompt: undefined,
      outputFormat: "png",
      quality: "auto",
      referenceImageUrl: undefined,
      resolution: next.supportedResolutions?.[0] ?? "1K",
      seed: undefined,
    });
  };
  return (
    <div className="grid gap-3 text-xs">
      <section className="grid gap-3 rounded-xl border bg-card/60 p-4">
        <h2 className="font-semibold">Модель изображения</h2>
        <label>
          <span className="sr-only">Выбор модели</span>
          <select
            className={input}
            value={selectedModel.id}
            onChange={(e) => choose(e.target.value)}
          >
            {imageModels.map((model) => (
              <option value={model.id} key={model.id}>
                {model.name}
              </option>
            ))}
          </select>
        </label>
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {selectedModel.description ?? selectedModel.provider}
        </p>
      </section>
      <section className="grid gap-4 rounded-xl border bg-card/60 p-4">
        <h2 className="font-semibold">Параметры</h2>
        <label className="grid gap-2">
          Соотношение сторон
          <select
            className={input}
            value={imageSettings.aspectRatio}
            onChange={(e) =>
              updateImageSettings({ aspectRatio: e.target.value })
            }
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
              <option value="auto">Auto</option>
              {selectedModel.supportedQualities
                .filter((q) => q !== "auto")
                .map((quality) => (
                  <option key={quality}>{quality}</option>
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
            {(selectedModel.supportedOutputFormats?.length
              ? selectedModel.supportedOutputFormats
              : ["png"]
            ).map((format) => (
              <option value={format} key={format}>
                {format.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
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
              <option value="auto">Auto</option>
              {selectedModel.supportedBackgrounds
                .filter((b) => b !== "auto")
                .map((background) => (
                  <option key={background}>{background}</option>
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
    </div>
  );
};
