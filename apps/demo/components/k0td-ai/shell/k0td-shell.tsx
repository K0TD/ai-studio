"use client";
import { SlidersHorizontal, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { useK0tdStore } from "@/lib/store/k0td-store";

import { AudioSettingsPanel } from "../../syntx/audio/audio-settings";
import { ImageSettingsPanel } from "../../syntx/image/image-settings";
import { SyntxHeader } from "../../syntx/shell/syntx-header";
import { SyntxPromptBar } from "../../syntx/shell/syntx-prompt-bar";
import { SyntxSidebar } from "../../syntx/shell/syntx-sidebar";
import { SyntxWorkspace } from "../../syntx/shell/syntx-workspace";
import { useHydrated, useMediaQuery } from "../../syntx/shell/use-media-query";
import { VideoSettingsPanel } from "../../syntx/video/video-settings";
type GenerationTab = "audio" | "image" | "video";
interface SettingsContentProps {
  tab: GenerationTab;
}
const SETTINGS_TITLES = {
  audio: "Настройки аудио",
  image: "Настройки изображения",
  video: "Настройки видео",
};
const SettingsContent = ({ tab }: SettingsContentProps) => {
  if (tab === "video") {
    return <VideoSettingsPanel />;
  }
  if (tab === "image") {
    return <ImageSettingsPanel />;
  }
  return <AudioSettingsPanel />;
};
const useServerRefresh = () => {
  const refreshServer = useK0tdStore((state) => state.refreshServer);
  useEffect(() => {
    void refreshServer();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") {
        void refreshServer();
      }
    }, 10_000);
    return () => {
      clearInterval(timer);
      useK0tdStore.getState().clearSession();
    };
  }, [refreshServer]);
  const activeChatId = useK0tdStore((state) => state.activeChatId);
  useEffect(() => {
    if (!activeChatId) {
      return;
    }
    const refresh = async () => {
      try {
        await useK0tdStore.getState().refreshJobs();
      } catch (error) {
        toast.error(
          error instanceof Error ? error.message : "Не удалось обновить историю"
        );
      }
    };
    refresh();
  }, [activeChatId]);
};
const AccountStatus = () => {
  const user = useK0tdStore((state) => state.user);
  if (
    !user ||
    (user.isApproved && !user.isBanned && user.permissions.sections.length)
  ) {
    return null;
  }
  let message = "Доступ к генерациям пока не выдан.";
  if (user.isBanned) {
    message = "Аккаунт заблокирован.";
  } else if (!user.isApproved) {
    message = "Аккаунт ожидает одобрения.";
  }
  return (
    <output className="border-b bg-amber-50 p-3 text-center text-sm text-amber-900">
      {message} Обратитесь к администратору.
    </output>
  );
};
const ConnectionStatus = () => {
  const error = useK0tdStore((state) => state.serverError);
  return error ? (
    <output
      role="alert"
      className="border-b bg-amber-50 p-3 text-center text-sm text-amber-900"
    >
      Не удалось обновить данные: {error}. Повторяем подключение…
    </output>
  ) : null;
};
export const K0tdShell = () => {
  useServerRefresh();
  const refreshServer = useK0tdStore((state) => state.refreshServer);
  const serverReady = useK0tdStore((state) => state.serverReady);
  const serverError = useK0tdStore((state) => state.serverError);
  const activeTab = useK0tdStore((state) => state.activeTab);
  const isLeftSidebarOpen = useK0tdStore((state) => state.isLeftSidebarOpen);
  const toggleLeftSidebar = useK0tdStore((state) => state.toggleLeftSidebar);
  const isRightSidebarOpen = useK0tdStore((state) => state.isRightSidebarOpen);
  const toggleRightSidebar = useK0tdStore((state) => state.toggleRightSidebar);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [mobileSettingsOpen, setMobileSettingsOpen] = useState(false);
  const isDesktop = useMediaQuery("(min-width: 1024px)");
  const isWide = useMediaQuery("(min-width: 1280px)");
  const isHydrated = useHydrated();
  const generationTab: GenerationTab | null =
    activeTab === "video" || activeTab === "image" || activeTab === "audio"
      ? activeTab
      : null;
  const openSettings = () => {
    if (isWide) {
      if (!isRightSidebarOpen) {
        toggleRightSidebar();
      }
      return;
    }
    setMobileSettingsOpen(true);
  };
  if (serverError && !serverReady) {
    return (
      <main className="grid min-h-dvh place-items-center bg-k0td-bg p-6">
        <div className="max-w-md rounded-3xl border bg-card p-7">
          <h1 className="text-xl font-semibold">Студия временно недоступна</h1>
          <p role="alert" className="my-4 text-sm text-muted-foreground">
            {serverError}
          </p>
          <button
            className="rounded-xl bg-[#f05138] px-4 py-2 text-white"
            onClick={refreshServer}
          >
            Повторить
          </button>
        </div>
      </main>
    );
  }
  if (!isHydrated || !serverReady) {
    return (
      <div className="grid h-dvh w-full place-items-center bg-k0td-bg">
        <div className="flex flex-col items-center gap-3">
          <div className="grid size-12 place-items-center rounded-[16px] bg-k0td-ink font-black text-xl text-k0td-bg shadow-[0_16px_40px_-18px_rgba(43,38,33,0.9)]">
            K
          </div>
          <div className="flex items-center gap-2 font-semibold text-[10px] text-k0td-muted uppercase tracking-[0.28em]">
            <span className="size-1.5 animate-pulse rounded-full bg-k0td-accent" />
            k0td AI Studio
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="relative flex h-dvh w-full flex-col overflow-hidden bg-k0td-bg text-k0td-ink">
      {/* 1. Header is full-width at the very top of the app, never covered or shifted */}
      <SyntxHeader onOpenSidebar={() => setMobileSidebarOpen(true)} />

      <ConnectionStatus />
      <AccountStatus />
      {/* 2. Main content area strictly below the header */}
      <div className="relative flex min-h-0 flex-1 w-full overflow-hidden">
        {isDesktop ? (
          <SyntxSidebar
            isDesktop
            mobileOpen={isLeftSidebarOpen}
            onMobileClose={toggleLeftSidebar}
          />
        ) : null}

        <div className="relative flex min-w-0 flex-1 flex-col overflow-hidden">
          <SyntxWorkspace onOpenSettings={openSettings} />
          <SyntxPromptBar onOpenSettings={openSettings} />
        </div>

        {/* Desktop right settings panel */}
        {generationTab && isWide && isRightSidebarOpen ? (
          <aside className="relative z-10 hidden min-h-0 w-80 shrink-0 border-k0td-line/60 border-l bg-k0td-surface/90 backdrop-blur-md xl:flex xl:flex-col">
            <div className="flex h-12 shrink-0 items-center justify-between border-k0td-line/60 border-b px-4">
              <span className="font-semibold text-xs text-k0td-ink">
                {SETTINGS_TITLES[generationTab]}
              </span>
              <button
                aria-label="Закрыть панель настроек"
                className="grid size-7 place-items-center rounded-lg text-k0td-muted transition-colors hover:bg-k0td-surface-solid hover:text-k0td-ink"
                onClick={toggleRightSidebar}
                type="button"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="k0td-thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3 overscroll-contain">
              <SettingsContent tab={generationTab} />
            </div>
          </aside>
        ) : null}

        {/* Collapsed settings button when closed */}
        {generationTab && isWide && !isRightSidebarOpen ? (
          <button
            aria-label="Развернуть панель настроек"
            className="absolute top-4 right-4 z-20 grid size-9 place-items-center rounded-full border border-k0td-line/70 bg-k0td-surface/80 text-k0td-muted shadow-md backdrop-blur-md transition-all hover:border-k0td-accent/40 hover:bg-k0td-surface hover:text-k0td-accent"
            onClick={toggleRightSidebar}
            title="Открыть параметры модели"
            type="button"
          >
            <SlidersHorizontal className="size-4" />
          </button>
        ) : null}

        {/* Mobile / Tablet settings drawer (<1280px) */}
        {generationTab && !isWide && mobileSettingsOpen ? (
          <div className="absolute inset-0 z-40 flex">
            <button
              type="button"
              aria-label="Закрыть настройки"
              className="flex-1 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileSettingsOpen(false)}
            />
            <div className="relative flex h-full w-full max-w-sm flex-col border-k0td-line/80 border-l bg-k0td-surface/95 shadow-2xl backdrop-blur-xl">
              <div className="flex h-12 shrink-0 items-center justify-between border-k0td-line/60 border-b px-4">
                <span className="font-semibold text-xs text-k0td-ink">
                  {SETTINGS_TITLES[generationTab]}
                </span>
                <button
                  aria-label="Закрыть настройки"
                  className="grid size-8 place-items-center rounded-lg text-k0td-muted transition-colors hover:bg-k0td-surface-solid hover:text-k0td-ink"
                  onClick={() => setMobileSettingsOpen(false)}
                  type="button"
                >
                  <X className="size-4" />
                </button>
              </div>
              <div className="k0td-thin-scrollbar min-h-0 flex-1 overflow-y-auto p-3 overscroll-contain">
                <SettingsContent tab={generationTab} />
              </div>
            </div>
          </div>
        ) : null}

        {/* Mobile / Tablet sidebar drawer (<1024px) */}
        {!isDesktop && mobileSidebarOpen ? (
          <div className="absolute inset-0 z-40 flex">
            <button
              type="button"
              aria-label="Закрыть меню"
              className="flex-1 bg-black/40 backdrop-blur-xs transition-opacity"
              onClick={() => setMobileSidebarOpen(false)}
            />
            <SyntxSidebar
              isDesktop={false}
              mobileOpen={mobileSidebarOpen}
              onMobileClose={() => setMobileSidebarOpen(false)}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
};
export const SyntxShell = K0tdShell;
