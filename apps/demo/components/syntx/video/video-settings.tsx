"use client";
import { useState } from "react";
import { toast } from "sonner";

import { useSyntxStore } from "@/lib/store/syntx-store";

import { ModelAvailability } from "../shell/model-availability";
import { uploadReference } from "../shell/syntx-api";
const input =
  "w-full rounded-lg border border-border bg-background p-2 text-xs";
export const VideoSettingsPanel = () => {
  const { models, videoSettings, updateVideoSettings } = useSyntxStore();
  const [uploading, setUploading] = useState(false);
  const videoModels = models.filter((model) => model.category === "video");
  const selectedModel = videoModels.find(
    (model) => model.id === videoSettings.modelId
  );
  if (!selectedModel) {
    return <ModelAvailability tab="video" />;
  }
  const choose = (id: string) => {
    const next = videoModels.find((model) => model.id === id);
    if (!next) {
      return;
    }
    updateVideoSettings({
      aspectRatio: next.supportedAspectRatios?.[0] ?? "Auto",
      duration: next.supportedDurations?.[0] ?? 5,
      firstFrameUrl: undefined,
      generateAudio: false,
      lastFrameUrl: undefined,
      modelId: id,
      negativePrompt: undefined,
      resolution: next.supportedResolutions?.[0] ?? "",
      seed: undefined,
    });
  };
  return (
    <div className="grid gap-3 text-xs">
      <section className="grid gap-3 rounded-xl border bg-card/60 p-4">
        <h2 className="font-semibold">Модель видео</h2>
        <label className="grid gap-2">
          <span className="sr-only">Выбор модели</span>
          <select
            className={input}
            value={selectedModel.id}
            onChange={(e) => choose(e.target.value)}
          >
            {videoModels.map((model) => (
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
            value={videoSettings.aspectRatio}
            onChange={(e) =>
              updateVideoSettings({ aspectRatio: e.target.value })
            }
          >
            <option value="Auto">Auto</option>
            {selectedModel.supportedAspectRatios
              ?.filter((r) => r !== "Auto" && r !== "auto")
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
              value={videoSettings.resolution}
              onChange={(e) =>
                updateVideoSettings({ resolution: e.target.value })
              }
            >
              {selectedModel.supportedResolutions.map((res) => (
                <option key={res}>{res}</option>
              ))}
            </select>
          </label>
        ) : null}
        <fieldset>
          <legend className="mb-2">Длительность</legend>
          <div className="flex flex-wrap gap-2">
            {selectedModel.supportedDurations?.map((duration) => (
              <button
                type="button"
                key={duration}
                onClick={() => updateVideoSettings({ duration })}
                aria-pressed={videoSettings.duration === duration}
                className={`rounded-lg border px-3 py-2 ${duration === videoSettings.duration ? "border-[#f05138] bg-[#f05138]/10 text-[#f05138]" : ""}`}
              >
                {duration} сек
              </button>
            ))}
          </div>
        </fieldset>
        {selectedModel.supportsAudio && (
          <label className="flex items-center justify-between">
            Аудиодорожка
            <input
              type="checkbox"
              checked={videoSettings.generateAudio}
              onChange={(e) =>
                updateVideoSettings({ generateAudio: e.target.checked })
              }
            />
          </label>
        )}
        {selectedModel.supportsSeed && (
          <label className="grid gap-2">
            Seed
            <input
              className={input}
              type="number"
              min={0}
              max={2_147_483_647}
              value={videoSettings.seed ?? ""}
              onChange={(e) =>
                updateVideoSettings({
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
              value={videoSettings.negativePrompt ?? ""}
              onChange={(e) =>
                updateVideoSettings({ negativePrompt: e.target.value })
              }
            />
          </label>
        )}
      </section>
      {selectedModel.supportedFrameImages?.length ? (
        <section className="grid gap-3 rounded-xl border bg-card/60 p-4">
          <h2 className="font-semibold">Ключевые кадры</h2>
          {(["first_frame", "last_frame"] as const)
            .filter((frame) =>
              selectedModel.supportedFrameImages?.includes(frame)
            )
            .map((frame) => (
              <label key={frame} className="grid gap-2">
                {frame === "first_frame" ? "Первый кадр" : "Последний кадр"}
                <input
                  disabled={uploading}
                  type="file"
                  accept="image/png,image/jpeg,image/webp"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    e.target.value = "";
                    if (!file) {
                      return;
                    }
                    setUploading(true);
                    try {
                      const uploaded = await uploadReference(file);
                      updateVideoSettings(
                        frame === "first_frame"
                          ? { firstFrameUrl: uploaded.url }
                          : { lastFrameUrl: uploaded.url }
                      );
                    } catch (error) {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : "Не удалось загрузить кадр"
                      );
                    } finally {
                      setUploading(false);
                    }
                  }}
                />
                {(frame === "first_frame"
                  ? videoSettings.firstFrameUrl
                  : videoSettings.lastFrameUrl) && (
                  <button
                    type="button"
                    className="text-left text-[#f05138]"
                    onClick={() =>
                      updateVideoSettings(
                        frame === "first_frame"
                          ? { firstFrameUrl: undefined }
                          : { lastFrameUrl: undefined }
                      )
                    }
                  >
                    Кадр загружен · Убрать
                  </button>
                )}
              </label>
            ))}
        </section>
      ) : null}
      {selectedModel.id.includes("heygen") && (
        <section className="grid gap-3 rounded-xl border bg-card/60 p-4">
          <p className="leading-relaxed text-muted-foreground">
            Прикрепите изображение аватара под промптом. Текст используется как
            речь персонажа.
          </p>
          <label className="grid gap-2">
            ID голоса
            <input
              className={input}
              value={videoSettings.heygenVoiceId ?? ""}
              onChange={(e) =>
                updateVideoSettings({ heygenVoiceId: e.target.value })
              }
            />
          </label>
        </section>
      )}
    </div>
  );
};
