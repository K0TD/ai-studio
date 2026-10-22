"use client";
import { useSyntxStore } from "@/lib/store/syntx-store";

import { ModelAvailability } from "../shell/model-availability";
export const AudioSettingsPanel = () => {
  const { audioSettings, updateAudioSettings, models } = useSyntxStore();
  const audioModels = models.filter((model) => model.category === "audio");
  const selectedModel = audioModels.find(
    (model) => model.id === audioSettings.modelId
  );
  return (
    <div className="grid gap-4 text-sm">
      <section className="grid gap-3 rounded-xl border bg-card p-4">
        <h2 className="font-semibold">Синтез речи</h2>
        {selectedModel ? (
          <>
            <label className="grid gap-2 text-xs">
              Модель
              <select
                className="rounded-lg border bg-background p-2"
                value={audioSettings.modelId}
                onChange={(e) => {
                  const next = audioModels.find(
                    (model) => model.id === e.target.value
                  );
                  updateAudioSettings({
                    mode: "elevenlabs",
                    modelId: e.target.value,
                    voiceId: next?.supportedVoices?.[0] ?? "eve",
                  });
                }}
              >
                {audioModels.map((model) => (
                  <option key={model.id} value={model.id}>
                    {model.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-xs">
              Голос
              <select
                className="rounded-lg border bg-background p-2"
                value={audioSettings.voiceId}
                onChange={(e) =>
                  updateAudioSettings({ voiceId: e.target.value })
                }
              >
                {selectedModel.supportedVoices?.map((voice) => (
                  <option key={voice} value={voice}>
                    {voice}
                  </option>
                ))}
              </select>
            </label>
            <p className="text-xs leading-relaxed text-muted-foreground">
              Стоимость рассчитывается перед отправкой текста. Доступны только
              подтвержденные провайдером модели и голоса.
            </p>
          </>
        ) : (
          <ModelAvailability tab="audio" />
        )}
      </section>
      <section className="rounded-xl border bg-muted/30 p-4 text-muted-foreground">
        <p className="font-medium">Скоро в студии</p>
        <p className="mt-2 text-xs leading-relaxed">
          Suno, видео в аудио и смена голоса временно недоступны до подключения
          проверенных API.
        </p>
      </section>
    </div>
  );
};
