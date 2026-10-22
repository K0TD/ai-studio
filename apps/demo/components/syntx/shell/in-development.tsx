"use client";
import {
  ArrowLeft,
  Bot,
  BrainCircuit,
  Clapperboard,
  Sparkles,
  TrendingUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import type { SyntxTab } from "@/lib/routerai/types";
import { useSyntxStore } from "@/lib/store/syntx-store";
import { cn } from "@/lib/utils";
export type InDevelopmentTab = "agents" | "editor" | "llm" | "trends";
interface InDevelopmentProps {
  tab: InDevelopmentTab;
}
interface InDevelopmentContent {
  accent: string;
  description: string;
  features: string[];
  icon: LucideIcon;
  title: string;
}
const CONTENT = {
  agents: {
    accent: "from-sky-400 via-cyan-400 to-teal-400",
    description:
      "Автономные агенты, которые сами собирают сценарий, подбирают модель, генерируют ассеты и собирают финальный ролик.",
    features: [
      "Цепочки шагов с контролем на каждом этапе",
      "Память проекта и повторное использование ассетов",
      "Параллельный запуск задач",
    ],
    icon: Bot,
    title: "Агенты",
  },
  editor: {
    accent: "from-rose-400 via-coral-400 to-orange-400",
    description:
      "Монтаж видео и аудио прямо в браузере: таймлайн, слои, субтитры, цветокоррекция и экспорт без сторонних инструментов.",
    features: [
      "Многодорожечный таймлайн",
      "Автосубтитры и выравнивание звука",
      "Пресеты под соцсети и экспорт в нужном формате",
    ],
    icon: Clapperboard,
    title: "Редактор",
  },
  llm: {
    accent: "from-violet-400 via-purple-400 to-fuchsia-400",
    description:
      "Чат со всеми LLM RouterAI в одном окне: сравнение ответов, системные промпты, работа с файлами и изображениями.",
    features: [
      "Сравнение моделей бок о бок",
      "Библиотека системных промптов",
      "Экспорт диалогов и контекста",
    ],
    icon: BrainCircuit,
    title: "LLM-студия",
  },
  trends: {
    accent: "from-amber-400 via-orange-400 to-rose-400",
    description:
      "Ежедневная подборка вирусных промптов, рейтинги моделей и готовые сценарии для запуска идей за пару кликов.",
    features: [
      "Лента трендов с промптами и результатами",
      "Рейтинг моделей по качеству и цене",
      "Подборки под Reels, Shorts и рекламу",
    ],
    icon: TrendingUp,
    title: "Тренды",
  },
} satisfies Record<InDevelopmentTab, InDevelopmentContent>;
export const isInDevelopmentTab = (tab: SyntxTab): tab is InDevelopmentTab =>
  tab === "trends" || tab === "agents" || tab === "llm" || tab === "editor";
export const InDevelopment = ({ tab }: InDevelopmentProps) => {
  const content = CONTENT[tab];
  const setActiveTab = useSyntxStore((state) => state.setActiveTab);
  const Icon = content.icon;
  return (
    <div className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden px-5 py-10">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-1/2 left-1/2 size-[540px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-syntx-accent/8 blur-3xl" />
        <div
          className={cn(
            "absolute top-1/3 left-1/2 size-[320px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-br opacity-15 blur-3xl",
            content.accent
          )}
        />
      </div>

      <div className="relative w-full max-w-xl animate-syntx-fade-up">
        <div className="mb-5 flex items-center justify-center">
          <div className="relative">
            <div
              className={cn(
                "grid size-20 place-items-center rounded-[28px] bg-gradient-to-br text-white shadow-2xl shadow-black/10",
                content.accent
              )}
            >
              <Icon className="size-9" strokeWidth={1.7} />
            </div>
            <span className="absolute -top-2 -right-2 grid size-8 place-items-center rounded-full border border-syntx-line bg-syntx-surface-solid text-syntx-accent shadow-lg">
              <Sparkles className="size-4" />
            </span>
          </div>
        </div>

        <div className="rounded-[28px] border border-syntx-line/80 bg-syntx-surface p-7 text-center shadow-[var(--syntx-shadow)] backdrop-blur-xl sm:p-9">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-syntx-accent/25 bg-syntx-accent/10 px-3 py-1 font-semibold text-[11px] text-syntx-accent uppercase tracking-[0.16em]">
            <span className="size-1.5 animate-pulse rounded-full bg-syntx-accent" />
            В разработке
          </span>

          <h2 className="mt-4 font-semibold text-2xl text-syntx-ink tracking-tight sm:text-3xl">
            {content.title}
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm text-syntx-muted leading-relaxed">
            {content.description}
          </p>

          <ul className="mx-auto mt-6 flex max-w-md flex-col gap-2.5 text-left">
            {content.features.map((feature) => (
              <li
                className="flex items-start gap-3 rounded-2xl border border-syntx-line/60 bg-syntx-surface-solid/60 px-3.5 py-2.5 text-sm text-syntx-ink/85"
                key={feature}
              >
                <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-syntx-accent/12 text-syntx-accent">
                  <Sparkles className="size-3" />
                </span>
                {feature}
              </li>
            ))}
          </ul>

          <div className="mt-7 flex flex-col items-center justify-center gap-2 sm:flex-row">
            <button
              className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-full bg-syntx-ink px-5 font-medium text-syntx-bg text-sm transition-transform hover:-translate-y-0.5 sm:w-auto"
              onClick={() => setActiveTab("video")}
              type="button"
            >
              <ArrowLeft className="size-4" />
              Вернуться в студию
            </button>
          </div>
        </div>

        <p className="mt-4 text-center text-syntx-muted/80 text-xs">
          Раздел появится в одном из ближайших обновлений k0td AI Studio
        </p>
      </div>
    </div>
  );
};
