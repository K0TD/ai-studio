"use client";
import {
  AUDIO_FAMILIES,
  AUDIO_MODELS,
  isBudgetModel,
} from "@/lib/routerai/models-catalog";
import { modelAllowed } from "@/lib/store/client-policy";
import { useSyntxStore } from "@/lib/store/syntx-store";

const input =
  "w-full rounded-lg border border-border bg-background p-2 text-xs";

export const AudioSettingsPanel = () => {
  const { audioSettings, updateAudioSettings, models, user } = useSyntxStore();

  const isVip = user?.role === "vip" || user?.role === "admin";

  const selectedFamily =
    AUDIO_FAMILIES.find(
      (f) =>
        f.id === audioSettings.modelId ||
        f.models.some((m) => m.id === audioSettings.modelId)
    ) ?? AUDIO_FAMILIES[0];

  const currentModel =
    (audioSettings.modelId
      ? models.find((model) => model.id === audioSettings.modelId) ??
        selectedFamily.models.find((m) => m.id === audioSettings.modelId)
      : undefined) ??
    (isVip
      ? selectedFamily.models.find((m) => m.id === selectedFamily.defaultModelId)
      : selectedFamily.models.find((m) => isBudgetModel(m.id))) ??
    selectedFamily.models[0];

  const isAllowed = isVip || modelAllowed(user, currentModel);

  const choose = (id: string) => {
    const next =
      models.find((model) => model.id === id) ??
      AUDIO_MODELS.find((model) => model.id === id);
    if (!next) {
      return;
    }
    let mode: "elevenlabs" | "suno" | "voxtral" | "grok-voice" | "video2audio" =
      "elevenlabs";
    if (next.id.includes("suno")) {
      mode = "suno";
    } else if (next.id.includes("voxtral")) {
      mode = "voxtral";
    } else if (next.id.includes("grok-voice")) {
      mode = "grok-voice";
    } else if (next.id.includes("video-to-audio") || next.id.includes("foley")) {
      mode = "video2audio";
    }

    updateAudioSettings({
      mode,
      modelId: id,
      voiceId: next.supportedVoices?.includes(audioSettings.voiceId)
        ? audioSettings.voiceId
        : (next.supportedVoices?.[0] ?? "eve"),
    });
  };

  const handleFamilyChange = (familyId: string) => {
    const nextFam =
      AUDIO_FAMILIES.find((f) => f.id === familyId) ?? AUDIO_FAMILIES[0];
    const targetModel =
      (isVip
        ? nextFam.models.find((m) => m.id === nextFam.defaultModelId)
        : nextFam.models.find((m) => isBudgetModel(m.id))) ?? nextFam.models[0];
    choose(targetModel.id);
  };

  const selectedModel = currentModel;

  return (
    <div className="grid gap-4 text-xs">
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-sm">Модель аудио</h2>
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
            {AUDIO_FAMILIES.map((fam) => {
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
                  {model.name} · {model.basePriceRub} ₽
                </option>
              );
            })}
          </select>
        </label>

        {/* Выбор голоса, если модель поддерживает голоса */}
        {selectedModel.supportedVoices?.length ? (
          <label className="grid gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">
              Голос
            </span>
            <select
              className={input}
              value={audioSettings.voiceId}
              onChange={(e) =>
                updateAudioSettings({ voiceId: e.target.value })
              }
            >
              {selectedModel.supportedVoices.map((voice) => (
                <option key={voice} value={voice}>
                  {voice}
                </option>
              ))}
            </select>
          </label>
        ) : null}

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
          <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-[11px] leading-relaxed text-amber-800 dark:text-amber-200">
            <p className="font-semibold flex items-center gap-1.5">
              <span>👑</span> Доступно только для тарифа VIP
            </p>
            <p className="mt-1 text-muted-foreground">
              Эта аудио-модель не входит в базовый тариф. Выберите модификацию с отметкой «✓» в списке выше или запросите у администратора VIP-доступ.
            </p>
          </div>
        )}

        <p className="text-[11px] leading-relaxed text-muted-foreground">
          {selectedModel.description ?? selectedFamily.description}
        </p>
      </section>

      <section className="rounded-xl border bg-muted/30 p-4 text-muted-foreground">
        <p className="font-medium text-xs">Скоро в студии</p>
        <p className="mt-1.5 text-xs leading-relaxed">
          Suno музыка и видео в аудио подключаются через официальные API провайдеров.
        </p>
      </section>
    </div>
  );
};
