"use client";
import {
  Menu,
  Moon,
  Sun,
  Wallet,
  LogOut,
  Shield,
  PanelLeft,
} from "lucide-react";
import { useTheme } from "next-themes";
import Link from "next/link";
import { useState } from "react";

import { authClient } from "@/lib/auth-client";
import type { SyntxTab } from "@/lib/routerai/types";
import { sectionAllowed } from "@/lib/store/client-policy";
import { useSyntxStore } from "@/lib/store/syntx-store";

import { formatRub } from "./syntx-format";
import { TopUpModal } from "./top-up-modal";
const tabs: {
  id: SyntxTab;
  label: string;
  working: boolean;
}[] = [
  { id: "video", label: "Видео", working: true },
  { id: "image", label: "Изображения", working: true },
  { id: "audio", label: "Аудио", working: true },
];
export const SyntxHeader = ({
  onOpenSidebar,
}: {
  onOpenSidebar?: () => void;
}) => {
  const { activeTab, setActiveTab, balanceRub, user, toggleLeftSidebar } =
    useSyntxStore();
  const { resolvedTheme, setTheme } = useTheme();
  const [balanceOpen, setBalanceOpen] = useState(false);
  const visibleTabs = tabs.filter(
    (tab) => !tab.working || sectionAllowed(user, tab.id)
  );
  const icon =
    "grid size-9 place-items-center rounded-full text-syntx-muted hover:bg-syntx-surface hover:text-syntx-ink";
  return (
    <header className="relative z-30 shrink-0 border-b border-syntx-line/70 bg-syntx-bg/80 backdrop-blur-xl">
      <div className="flex min-h-16 items-center gap-3 px-3 sm:px-5">
        <button
          aria-label="Панель чатов"
          className={icon}
          onClick={() => {
            if (window.matchMedia("(min-width:1024px)").matches) {
              toggleLeftSidebar();
            } else {
              (onOpenSidebar ?? toggleLeftSidebar)();
            }
          }}
        >
          <Menu className="size-4.5 lg:hidden" />
          <PanelLeft className="hidden size-4.5 lg:block" />
        </button>
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid size-9 place-items-center rounded-xl bg-syntx-ink text-lg font-black text-syntx-bg">
            K<span className="sr-only">k0td AI</span>
          </span>
          <span className="hidden sm:inline">
            k0td<span className="text-syntx-accent">.ai</span>
          </span>
        </Link>
        <nav
          aria-label="Разделы"
          className="syntx-no-scrollbar mx-auto hidden max-w-[55vw] items-center gap-1 overflow-x-auto rounded-full border border-syntx-line/60 bg-syntx-surface/70 p-1 md:flex"
        >
          {visibleTabs.map((tab) => (
            <button
              key={tab.id}
              aria-current={tab.id === activeTab ? "page" : undefined}
              title={tab.working ? undefined : "В разработке"}
              onClick={() => setActiveTab(tab.id)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${tab.id === activeTab ? "bg-syntx-accent text-white" : "text-syntx-muted hover:bg-syntx-surface-solid"}`}
            >
              {tab.label}
              {!tab.working && (
                <span
                  aria-label="В разработке"
                  className="ml-1 text-syntx-accent"
                >
                  ·
                </span>
              )}
            </button>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <button
            aria-label="Переключить тему"
            className={icon}
            onClick={() =>
              setTheme(resolvedTheme === "dark" ? "light" : "dark")
            }
          >
            <Sun className="hidden size-4 dark:block" />
            <Moon className="size-4 dark:hidden" />
          </button>
          <button
            onClick={() => setBalanceOpen(true)}
            className="flex items-center gap-2 rounded-full border border-syntx-line/70 bg-syntx-surface px-3 py-2 text-xs font-semibold tabular-nums"
          >
            <Wallet className="size-3.5 text-syntx-accent" />
            {formatRub(balanceRub)}
          </button>
          {user?.role === "admin" && (
            <Link
              href="/admin"
              title="Администратор: полный доступ ко всем моделям, разделам и настройкам"
              className="inline-flex items-center gap-1.5 rounded-full border border-red-500/30 bg-red-500/10 px-2.5 py-1 text-[11px] font-semibold text-red-500 hover:bg-red-500/20 transition-colors"
              aria-label="Панель администратора"
            >
              <Shield className="size-3.5" />
              <span>Админ</span>
            </Link>
          )}
          {user?.role === "vip" && (
            <span
              title="Статус VIP: открыты все модели каталога"
              className="inline-flex items-center gap-1 rounded-full border border-amber-500/30 bg-amber-500/10 px-2.5 py-1 text-[11px] font-semibold text-amber-500"
            >
              👑 VIP
            </span>
          )}
          {user?.role === "user" && (
            <span
              title="Базовый тариф: доступны бюджетные модели"
              className="hidden items-center gap-1 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-600 dark:text-emerald-400 sm:inline-flex"
            >
              Базовый
            </span>
          )}
          <span
            title={user?.email}
            className="mx-2 hidden max-w-32 truncate text-xs text-syntx-muted lg:inline"
          >
            {user?.name}
          </span>
          <button
            aria-label="Выйти"
            className={icon}
            onClick={async () => {
              await authClient.signOut();
              useSyntxStore.setState({
                balanceRub: 0,
                chats: [],
                history: [],
                models: [],
                prompt: "",
                serverReady: false,
                user: null,
              });
              window.location.assign("/login");
            }}
          >
            <LogOut className="size-4" />
          </button>
        </div>
      </div>
      <nav
        aria-label="Разделы студии"
        className="syntx-no-scrollbar flex gap-1 overflow-x-auto px-3 pb-2 md:hidden"
      >
        {visibleTabs.map((tab) => (
          <button
            key={tab.id}
            aria-current={tab.id === activeTab ? "page" : undefined}
            className={`shrink-0 rounded-full px-3 py-1 text-xs ${tab.id === activeTab ? "bg-syntx-accent text-white" : "text-syntx-muted"}`}
            onClick={() => setActiveTab(tab.id)}
          >
            {tab.label}
            {tab.working ? "" : " ·"}
          </button>
        ))}
      </nav>
      <TopUpModal open={balanceOpen} onOpenChange={setBalanceOpen} />
    </header>
  );
};
