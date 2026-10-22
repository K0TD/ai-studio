"use client";
import {
  Music,
  SlidersHorizontal,
  Sparkles,
  Video,
  Volume2,
} from "lucide-react";

import { useSyntxStore } from "@/lib/store/syntx-store";

import { AudioCard } from "../audio/audio-card";
import { ImageCard } from "../image/image-card";
import { VideoCard } from "../video/video-card";
import { InDevelopment } from "./in-development";
interface SyntxWorkspaceProps {
  onOpenSettings?: () => void;
}
const TAB_LABELS = {
  audio: "Аудио",
  image: "Изображения",
  video: "Видео",
} as const;
const generationCountLabel = (count: number): string => {
  const mod10 = count % 10;
  const mod100 = count % 100;
  if (mod10 === 1 && mod100 !== 11) {
    return `${count} генерация`;
  }
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return `${count} генерации`;
  }
  return `${count} генераций`;
};
export const SyntxWorkspace = ({ onOpenSettings }: SyntxWorkspaceProps) => {
  const historyCursor = useSyntxStore((state) => state.historyCursor);
  const loadMoreJobs = useSyntxStore((state) => state.loadMoreJobs);
  const activeTab = useSyntxStore((state) => state.activeTab);
  const history = useSyntxStore((state) => state.history);
  const audioSettings = useSyntxStore((state) => state.audioSettings);
  const setPrompt = useSyntxStore((state) => state.setPrompt);
  const chats = useSyntxStore((state) => state.chats);
  const activeChatId = useSyntxStore((state) => state.activeChatId);
  // If tab is marked as "In Development"
  if (
    activeTab === "trends" ||
    activeTab === "agents" ||
    activeTab === "llm" ||
    activeTab === "editor"
  ) {
    return <InDevelopment tab={activeTab} />;
  }
  // Generations are scoped to the active chat AND its modality tab, so every
  // chat keeps its own clean page and context.
  const tabItems = history.filter(
    (item) => item.tab === activeTab && item.chatId === activeChatId
  );
  const activeChat = chats.find((chat) => chat.id === activeChatId);
  return (
    <div className="syntx-thin-scrollbar flex flex-1 flex-col overflow-y-auto p-4 sm:p-6">
      <div className="mx-auto mb-4 flex w-full max-w-4xl shrink-0 items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold text-[10px] text-syntx-muted uppercase tracking-[0.2em]">
            {TAB_LABELS[activeTab]}
          </p>
          <h1 className="mt-0.5 truncate font-semibold text-[15px] text-syntx-ink tracking-tight">
            {activeChat?.title ?? "Новая сессия"}
          </h1>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className="hidden rounded-full border border-syntx-line/60 bg-syntx-surface/70 px-2.5 py-1 font-medium text-[10px] text-syntx-muted sm:inline-flex">
            {generationCountLabel(tabItems.length)}
          </span>
          {onOpenSettings ? (
            <button
              aria-label="Открыть настройки"
              className="grid size-8 place-items-center rounded-full border border-syntx-line/60 bg-syntx-surface/70 text-syntx-muted transition-colors hover:border-syntx-accent/35 hover:text-syntx-accent xl:hidden"
              onClick={onOpenSettings}
              type="button"
            >
              <SlidersHorizontal className="size-3.5" />
            </button>
          ) : null}
        </div>
      </div>

      {/* If there are generations in current tab */}
      {tabItems.length > 0 ? (
        <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 pb-4">
          {tabItems.map((item) => {
            if (item.tab === "video") {
              return (
                <VideoCard
                  key={item.id}
                  item={item}
                  onRetry={(p) => setPrompt(p)}
                />
              );
            }
            if (item.tab === "image") {
              return (
                <ImageCard
                  key={item.id}
                  item={item}
                  onRetry={(p) => setPrompt(p)}
                />
              );
            }
            if (item.tab === "audio") {
              return <AudioCard key={item.id} item={item} />;
            }
            return null;
          })}
          {historyCursor && (
            <button
              className="rounded-xl border px-4 py-3 text-sm text-syntx-muted"
              onClick={loadMoreJobs}
            >
              Загрузить более ранние результаты
            </button>
          )}
        </div>
      ) : (
        /* Empty State / Hero Screen matching k0td.pdf pages 5 & 6 */
        <div className="my-auto flex flex-col items-center justify-center p-6 text-center">
          {activeTab === "audio" && audioSettings.mode === "elevenlabs" && (
            <div className="max-w-lg">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#f05138]/10 text-[#f05138]">
                <Volume2 className="size-8" />
              </div>
              <h2 className="mt-4 font-bold text-foreground text-xl">
                Elevenlabs
              </h2>
              <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                ElevenLabs это высококачественная ИИ-модель для генерации
                естественной, выразительной речи на разных языках. Она
                отличается высокой стабильностью голоса, реалистичной просодией
                и гибким управлением стилем, эмоциями и темпом речи, благодаря
                чему дикторская озвучка и голоса персонажей звучат менее
                синтетически.
              </p>
            </div>
          )}

          {activeTab === "audio" && audioSettings.mode === "suno" && (
            <div className="max-w-lg">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#f05138]/10 text-[#f05138]">
                <Music className="size-8" />
              </div>
              <h2 className="mt-4 font-bold text-foreground text-xl">Suno</h2>
              <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                Выберите режим генерации (инструментал / по вашим словам /
                автоматическая генерация слов посредством языковой модели),
                укажите стиль с использованием пресетов или свои в меню справа и
                отправьте текстовый запрос для генерации музыки.
              </p>
            </div>
          )}

          {activeTab === "audio" && audioSettings.mode === "video2audio" && (
            <div className="max-w-lg">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#f05138]/10 text-[#f05138]">
                <Video className="size-8" />
              </div>
              <h2 className="mt-4 font-bold text-foreground text-xl">
                Видео в аудио
              </h2>
              <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                Загрузите видео до 20 секунд и нейросеть добавит в него
                синхронизированные звуки под каждое движение и под каждый кадр.
              </p>
            </div>
          )}

          {activeTab === "video" && (
            <div className="max-w-lg">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#f05138]/10 text-[#f05138]">
                <Video className="size-8" />
              </div>
              <h2 className="mt-4 font-bold text-foreground text-xl">
                Генерация видео
              </h2>
              <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                Создавайте ролики кинематографичного качества от ведущих мировых
                моделей: FLUX 3 Video, Grok Imagine, Runway, Hailuo Minimax,
                Luma, Kling и ByteDance Seedance.
              </p>
            </div>
          )}

          {activeTab === "image" && (
            <div className="max-w-lg">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#f05138]/10 text-[#f05138]">
                <Sparkles className="size-8" />
              </div>
              <h2 className="mt-4 font-bold text-foreground text-xl">
                Генерация изображений
              </h2>
              <p className="mt-2 text-muted-foreground text-xs leading-relaxed">
                Профессиональная генерация в разрешениях 1K, 2K и 4K от Google
                Nano Banana 2, OpenAI GPT Image, ByteDance Seedream, FLUX.2 Pro
                и Recraft Vector.
              </p>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-2">
            {[
              "Футуристический город в неоновых лучах заката",
              "Макро-съемка капли росы на цветке лотоса",
              "Милый робот-помощник исследует тропический лес",
            ].map((sample) => (
              <button
                key={sample}
                onClick={() => {
                  setPrompt(sample);
                  document
                    .querySelector<HTMLTextAreaElement>("#k0td-prompt-input")
                    ?.focus();
                }}
                className="rounded-full border border-border bg-card/60 px-3.5 py-1.5 text-muted-foreground text-xs backdrop-blur-xs transition-colors hover:border-[#f05138] hover:text-[#f05138]"
              >
                {sample}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
