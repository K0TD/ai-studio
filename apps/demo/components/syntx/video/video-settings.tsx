"use client";
import { Check, Loader2, Upload, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import {
  VIDEO_FAMILIES,
  VIDEO_MODELS,
  isBudgetModel,
} from "@/lib/routerai/models-catalog";
import { modelAllowed } from "@/lib/store/client-policy";
import { useSyntxStore } from "@/lib/store/syntx-store";

import { uploadReference } from "../shell/syntx-api";
const input =
  "w-full rounded-lg border border-border bg-background p-2 text-xs";
export const VideoSettingsPanel = () => {
  const { models, videoSettings, updateVideoSettings, user } = useSyntxStore();
  const [uploadingFrame, setUploadingFrame] = useState<
    "first_frame" | "last_frame" | null
  >(null);
  const uploading = uploadingFrame !== null;

  const handleFrameUpload = async (
    frame: "first_frame" | "last_frame",
    file: File
  ) => {
    setUploadingFrame(frame);
    try {
      const uploaded = await uploadReference(file);
      updateVideoSettings(
        frame === "first_frame"
          ? { firstFrameUrl: uploaded.url }
          : { lastFrameUrl: uploaded.url }
      );
      toast.success(
        frame === "first_frame"
          ? "Первый кадр прикреплен"
          : "Последний кадр прикреплен"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Не удалось загрузить кадр"
      );
    } finally {
      setUploadingFrame(null);
    }
  };

  const isVip = user?.role === "vip" || user?.role === "admin";

  const selectedFamily =
    VIDEO_FAMILIES.find(
      (f) =>
        f.id === videoSettings.modelId ||
        f.models.some((m) => m.id === videoSettings.modelId)
    ) ?? VIDEO_FAMILIES[0];

  const currentModel =
    (videoSettings.modelId
      ? models.find((model) => model.id === videoSettings.modelId) ??
        selectedFamily.models.find((m) => m.id === videoSettings.modelId)
      : undefined) ??
    (isVip
      ? selectedFamily.models.find((m) => m.id === selectedFamily.defaultModelId)
      : selectedFamily.models.find((m) => isBudgetModel(m.id))) ??
    selectedFamily.models[0];

  const isAllowed = isVip || modelAllowed(user, currentModel);

  const choose = (id: string) => {
    const next =
      models.find((model) => model.id === id) ??
      VIDEO_MODELS.find((model) => model.id === id);
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

  const handleFamilyChange = (familyId: string) => {
    const nextFam =
      VIDEO_FAMILIES.find((f) => f.id === familyId) ?? VIDEO_FAMILIES[0];
    const targetModel =
      (isVip
        ? nextFam.models.find((m) => m.id === nextFam.defaultModelId)
        : nextFam.models.find((m) => isBudgetModel(m.id))) ?? nextFam.models[0];
    choose(targetModel.id);
  };

  const selectedModel = currentModel;

  return (
    <div className="grid gap-3 text-xs">
      <section className="grid gap-3 rounded-xl border bg-card/60 p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Модель видео</h2>
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
            {VIDEO_FAMILIES.map((fam) => {
              const hasBudget = fam.models.some((m) => isBudgetModel(m.id));
              return (
                <option value={fam.id} key={fam.id}>
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
              const mAllowed = isVip || modelAllowed(user, model);
              return (
                <option value={model.id} key={model.id}>
                  {mAllowed ? "✓ " : "👑 [VIP] "}
                  {model.name} · {model.basePriceRub} ₽/сек
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
              Бюджетная · {selectedModel.basePriceRub} ₽/сек
            </span>
          ) : (
            <span className="rounded-md border border-amber-500/20 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-medium text-amber-500">
              👑 VIP · {selectedModel.basePriceRub} ₽/сек
            </span>
          )}
        </div>

        {/* Предупреждение для пользователя, если выбрана VIP-модель на базовом тарифе */}
        {!isAllowed && (
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
            <p className="font-semibold flex items-center gap-1.5">
              <span>👑</span> Доступно только для тарифа VIP
            </p>
            <p className="mt-1 text-muted-foreground">
              Эта модель не входит в базовый тариф. Выберите модификацию с отметкой «✓» в списке выше или запросите у администратора VIP-доступ.
            </p>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {selectedModel.description ?? selectedFamily.description}
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
        <div className="grid gap-2">
          <div className="flex items-center justify-between">
            <span className="font-medium text-xs">Длительность</span>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={selectedModel.supportedDurations?.length ? Math.min(...selectedModel.supportedDurations) : 2}
                max={selectedModel.supportedDurations?.length ? Math.max(...selectedModel.supportedDurations, 30) : 30}
                value={videoSettings.duration}
                onChange={(e) => {
                  const val = parseInt(e.target.value, 10);
                  if (!isNaN(val)) {
                    updateVideoSettings({
                      duration: Math.max(1, Math.min(60, val)),
                    });
                  }
                }}
                className="w-14 rounded-md border border-border bg-background px-1.5 py-1 text-center font-semibold tabular-nums text-xs"
              />
              <span className="text-muted-foreground text-xs">сек</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={selectedModel.supportedDurations?.length ? Math.min(...selectedModel.supportedDurations) : 2}
              max={selectedModel.supportedDurations?.length ? Math.max(...selectedModel.supportedDurations) : 30}
              step={1}
              value={videoSettings.duration}
              onChange={(e) =>
                updateVideoSettings({ duration: Number(e.target.value) })
              }
              className="h-1.5 w-full cursor-pointer appearance-none rounded-lg bg-muted accent-[#f05138]"
            />
          </div>
          {selectedModel.supportedDurations && selectedModel.supportedDurations.length > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-muted-foreground">
              <span>{Math.min(...selectedModel.supportedDurations)} сек</span>
              <div className="flex flex-wrap gap-1">
                {selectedModel.supportedDurations.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => updateVideoSettings({ duration: d })}
                    className={`rounded px-1.5 py-0.5 transition-colors ${
                      videoSettings.duration === d
                        ? "bg-[#f05138]/10 font-bold text-[#f05138]"
                        : "hover:bg-muted hover:text-foreground"
                    }`}
                  >
                    {d}с
                  </button>
                ))}
              </div>
              <span>{Math.max(...selectedModel.supportedDurations)} сек</span>
            </div>
          )}
        </div>
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
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold">Ключевые кадры</h2>
            <span className="text-[11px] text-muted-foreground">
              {[videoSettings.firstFrameUrl, videoSettings.lastFrameUrl].filter(Boolean).length} / {selectedModel.supportedFrameImages.length} прикреплено
            </span>
          </div>

          {(["first_frame", "last_frame"] as const)
            .filter((frame) =>
              selectedModel.supportedFrameImages?.includes(frame)
            )
            .map((frame) => {
              const frameUrl =
                frame === "first_frame"
                  ? videoSettings.firstFrameUrl
                  : videoSettings.lastFrameUrl;
              const title =
                frame === "first_frame"
                  ? "Первый кадр (начало)"
                  : "Последний кадр (финал)";
              const isUploadingThis = uploadingFrame === frame;
              const inputId = `frame-upload-${frame}`;

              return (
                <div key={frame} className="grid gap-1.5">
                  <span className="text-xs font-medium text-muted-foreground">
                    {title}
                  </span>

                  {frameUrl ? (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-emerald-500/40 bg-emerald-500/5 p-2.5 transition-all">
                      <div className="flex items-center gap-3 min-w-0">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={frameUrl}
                          alt={title}
                          className="h-12 w-12 rounded-lg object-cover border border-emerald-500/30 flex-shrink-0"
                        />
                        <div className="flex flex-col min-w-0">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-600 dark:text-emerald-400">
                            <Check className="h-3.5 w-3.5 flex-shrink-0" />
                            <span>Фото прикреплено</span>
                          </div>
                          <span className="text-[10px] text-muted-foreground truncate">
                            Кадр готов к генерации
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        <label
                          htmlFor={inputId}
                          className="cursor-pointer rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium text-foreground hover:bg-muted transition-colors"
                        >
                          Заменить
                        </label>
                        <button
                          type="button"
                          className="rounded-lg border border-red-500/20 bg-red-500/10 p-1 text-red-500 hover:bg-red-500/20 transition-colors"
                          title="Удалить кадр"
                          onClick={() =>
                            updateVideoSettings(
                              frame === "first_frame"
                                ? { firstFrameUrl: undefined }
                                : { lastFrameUrl: undefined }
                            )
                          }
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  ) : (
                    <label
                      htmlFor={inputId}
                      className="group flex items-center justify-between gap-3 rounded-xl border border-dashed border-border/80 hover:border-[#f05138]/60 bg-muted/20 hover:bg-[#f05138]/5 p-3 transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-3">
                        <div className="rounded-lg bg-muted p-2 text-muted-foreground group-hover:text-[#f05138] group-hover:bg-[#f05138]/10 transition-colors">
                          {isUploadingThis ? (
                            <Loader2 className="h-4 w-4 animate-spin text-[#f05138]" />
                          ) : (
                            <Upload className="h-4 w-4" />
                          )}
                        </div>
                        <div className="flex flex-col">
                          <span className="text-xs font-medium text-foreground group-hover:text-[#f05138] transition-colors">
                            {isUploadingThis ? "Загрузка фото..." : "Прикрепить фото"}
                          </span>
                          <span className="text-[10px] text-muted-foreground">
                            PNG, JPG или WebP
                          </span>
                        </div>
                      </div>

                      <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-[10px] text-muted-foreground font-medium group-hover:bg-[#f05138]/10 group-hover:text-[#f05138] transition-colors">
                        Отсутствует
                      </span>
                    </label>
                  )}

                  <input
                    id={inputId}
                    disabled={uploading}
                    type="file"
                    className="sr-only"
                    accept="image/png,image/jpeg,image/webp"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      e.target.value = "";
                      if (file) {
                        void handleFrameUpload(frame, file);
                      }
                    }}
                  />
                </div>
              );
            })}
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
