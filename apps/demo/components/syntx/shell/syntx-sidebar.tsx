"use client";
import {
  FolderKanban,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Sparkles,
  SquarePen,
  Star,
  Trash2,
  X,
} from "lucide-react";
import { DropdownMenu } from "radix-ui";
import { useRef, useState } from "react";

import { sectionAllowed } from "@/lib/store/client-policy";
import type { ChatSession } from "@/lib/store/syntx-store";
import { useSyntxStore } from "@/lib/store/syntx-store";
import { cn } from "@/lib/utils";
interface SyntxSidebarProps {
  isDesktop: boolean;
  mobileOpen: boolean;
  onMobileClose: () => void;
}
interface SidebarTab {
  id: "chats" | "projects";
  label: string;
}
const SIDEBAR_TABS: readonly SidebarTab[] = [
  { id: "chats", label: "Чаты" },
  { id: "projects", label: "Проекты" },
];
const TAB_LABELS = {
  agents: "Агенты",
  audio: "Аудио",
  editor: "Редактор",
  image: "Изображения",
  llm: "LLM",
  trends: "Тренды",
  video: "Видео",
};
const relativeDate = (isoDate: string): string => {
  const timestamp = new Date(isoDate).getTime();
  if (Number.isNaN(timestamp)) {
    return "";
  }
  const minutes = Math.max(1, Math.round((Date.now() - timestamp) / 60_000));
  if (minutes < 60) {
    return `${minutes} мин назад`;
  }
  const hours = Math.round(minutes / 60);
  if (hours < 24) {
    return `${hours} ч назад`;
  }
  return new Date(isoDate).toLocaleDateString("ru-RU", {
    day: "2-digit",
    month: "short",
  });
};
interface ChatRowProps {
  chat: ChatSession;
  isActive: boolean;
  isRenaming: boolean;
  onCancelRename: () => void;
  onChangeRename: (value: string) => void;
  onCommitRename: () => void;
  onDelete: (id: string) => void;
  onSelect: (id: string) => void;
  onStartRename: (chat: ChatSession) => void;
  onToggleFavorite: (id: string) => void;
  renameValue: string;
}
const ChatRow = ({
  chat,
  isActive,
  isRenaming,
  onCancelRename,
  onChangeRename,
  onCommitRename,
  onDelete,
  onSelect,
  onStartRename,
  onToggleFavorite,
  renameValue,
}: ChatRowProps) => (
  <div
    className={cn(
      "group relative flex w-full cursor-pointer items-center gap-2 rounded-xl border border-transparent px-2 py-1.5 text-left transition-colors",
      isActive
        ? "border-syntx-accent/15 bg-syntx-accent/10"
        : "hover:border-syntx-line/60 hover:bg-syntx-surface"
    )}
  >
    <span
      className={cn(
        "grid size-7 shrink-0 place-items-center rounded-lg",
        isActive
          ? "bg-syntx-accent text-white"
          : "bg-syntx-surface-solid text-syntx-muted"
      )}
    >
      <MessageSquare className="size-3.5" />
    </span>

    <span className="min-w-0 flex-1">
      {isRenaming ? (
        <input
          aria-label="Название чата"
          autoFocus
          className="h-6 w-full rounded-md border border-syntx-accent/40 bg-syntx-surface-solid px-1.5 text-[12px] text-syntx-ink outline-none"
          onBlur={onCommitRename}
          onChange={(event) => onChangeRename(event.target.value)}
          onClick={(event) => event.stopPropagation()}
          onKeyDown={(event) => {
            event.stopPropagation();
            if (event.key === "Enter") {
              onCommitRename();
            }
            if (event.key === "Escape") {
              onCancelRename();
            }
          }}
          value={renameValue}
        />
      ) : (
        <button
          type="button"
          onClick={() => onSelect(chat.id)}
          aria-current={isActive ? "page" : undefined}
          className="block w-full truncate text-left font-medium text-[12.5px] text-syntx-ink"
        >
          {chat.title}
        </button>
      )}
      <span className="mt-0.5 block truncate text-[10px] text-syntx-muted">
        {TAB_LABELS[chat.tab] ?? chat.tab} · {relativeDate(chat.createdAt)}
      </span>
    </span>

    <button
      aria-label={chat.isFavorite ? "Убрать из избранного" : "В избранное"}
      className={cn(
        "shrink-0 rounded-md p-1 transition-opacity hover:bg-syntx-surface-solid",
        chat.isFavorite
          ? "text-amber-500 opacity-100"
          : "text-syntx-muted opacity-0 group-hover:opacity-100"
      )}
      onClick={(event) => {
        event.stopPropagation();
        onToggleFavorite(chat.id);
      }}
      type="button"
    >
      <Star className={cn("size-3.5", chat.isFavorite && "fill-amber-500")} />
    </button>

    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          aria-label="Действия с чатом"
          className="shrink-0 rounded-md p-1 text-syntx-muted opacity-0 transition-opacity hover:bg-syntx-surface-solid group-hover:opacity-100 data-[state=open]:opacity-100"
          onClick={(event) => event.stopPropagation()}
          type="button"
        >
          <MoreHorizontal className="size-3.5" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          className="z-50 w-44 rounded-xl border border-syntx-line/80 bg-syntx-surface-solid p-1 shadow-[var(--syntx-shadow)]"
          sideOffset={6}
        >
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-syntx-ink text-xs outline-none hover:bg-syntx-accent/8"
            onSelect={() => onStartRename(chat)}
          >
            <Pencil className="size-3.5 text-syntx-muted" />
            Переименовать
          </DropdownMenu.Item>
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-syntx-ink text-xs outline-none hover:bg-syntx-accent/8"
            onSelect={() => onToggleFavorite(chat.id)}
          >
            <Star className="size-3.5 text-syntx-muted" />
            {chat.isFavorite ? "Убрать из избранного" : "В избранное"}
          </DropdownMenu.Item>
          <DropdownMenu.Separator className="my-1 h-px bg-syntx-line/70" />
          <DropdownMenu.Item
            className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 text-syntx-accent text-xs outline-none hover:bg-syntx-accent/8"
            onSelect={() => onDelete(chat.id)}
          >
            <Trash2 className="size-3.5" />
            Удалить
          </DropdownMenu.Item>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  </div>
);
export const SyntxSidebar = ({
  isDesktop,
  mobileOpen,
  onMobileClose,
}: SyntxSidebarProps) => {
  const user = useSyntxStore((state) => state.user);
  const activeTab = useSyntxStore((state) => state.activeTab);
  const canCreate = sectionAllowed(user, activeTab);
  const chats = useSyntxStore((state) => state.chats);
  const activeChatId = useSyntxStore((state) => state.activeChatId);
  const createChat = useSyntxStore((state) => state.createChat);
  const deleteChat = useSyntxStore((state) => state.deleteChat);
  const renameChat = useSyntxStore((state) => state.renameChat);
  const selectChat = useSyntxStore((state) => state.selectChat);
  const toggleFavoriteChat = useSyntxStore((state) => state.toggleFavoriteChat);
  const isLeftSidebarOpen = useSyntxStore((state) => state.isLeftSidebarOpen);
  const toggleLeftSidebar = useSyntxStore((state) => state.toggleLeftSidebar);
  const [activeList, setActiveList] = useState<"chats" | "projects">("chats");
  const [query, setQuery] = useState("");
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const filteredChats = chats.filter((chat) =>
    chat.title.toLowerCase().includes(normalizedQuery)
  );
  const favoriteChats = filteredChats.filter((chat) => chat.isFavorite);
  const recentChats = favoritesOnly
    ? favoriteChats
    : filteredChats.filter((chat) => !chat.isFavorite);
  const closeMobileIfNeeded = () => {
    if (!isDesktop) {
      onMobileClose();
    }
  };
  const handleCreate = () => {
    createChat();
    setActiveList("chats");
    setFavoritesOnly(false);
    closeMobileIfNeeded();
  };
  const handleSelect = (id: string) => {
    selectChat(id);
    closeMobileIfNeeded();
  };
  const handleFocusSearch = () => {
    setActiveList("chats");
    if (isDesktop && !isLeftSidebarOpen) {
      toggleLeftSidebar();
    }
    setTimeout(() => searchRef.current?.focus(), 60);
  };
  const handleStartRename = (chat: ChatSession) => {
    setRenamingId(chat.id);
    setRenameValue(chat.title);
  };
  const handleCommitRename = () => {
    if (renamingId !== null && renameValue.trim().length > 0) {
      renameChat(renamingId, renameValue.trim());
    }
    setRenamingId(null);
    setRenameValue("");
  };
  const handleDelete = (id: string) => {
    deleteChat(id);
  };
  const rail = () => (
    <div className="flex w-14 shrink-0 flex-col items-center gap-1 border-syntx-line/60 border-r px-1.5 py-3">
      <button
        aria-label="Новый чат"
        className="mb-1 grid size-9 place-items-center rounded-xl bg-syntx-ink text-syntx-bg transition-transform hover:-translate-y-0.5"
        disabled={!canCreate}
        onClick={handleCreate}
        title="Новый чат"
        type="button"
      >
        <SquarePen className="size-4" />
      </button>
      <button
        aria-label="Поиск по чатам"
        className="grid size-9 place-items-center rounded-xl text-syntx-muted transition-colors hover:bg-syntx-surface hover:text-syntx-ink"
        onClick={handleFocusSearch}
        type="button"
      >
        <Search className="size-4.5" />
      </button>
      <button
        aria-label="Избранное"
        className={cn(
          "grid size-9 place-items-center rounded-xl transition-colors hover:bg-syntx-surface",
          favoritesOnly
            ? "bg-syntx-accent/10 text-syntx-accent"
            : "text-syntx-muted hover:text-syntx-ink"
        )}
        onClick={() => {
          setActiveList("chats");
          setFavoritesOnly((value) => !value);
          if (!isDesktop) {
            return;
          }
          if (!isLeftSidebarOpen) {
            toggleLeftSidebar();
          }
        }}
        type="button"
      >
        <Star
          className={cn("size-4.5", favoritesOnly && "fill-syntx-accent")}
        />
      </button>
      <button
        aria-label="Проекты"
        className={cn(
          "grid size-9 place-items-center rounded-xl transition-colors hover:bg-syntx-surface",
          activeList === "projects"
            ? "bg-syntx-accent/10 text-syntx-accent"
            : "text-syntx-muted hover:text-syntx-ink"
        )}
        onClick={() => {
          setActiveList("projects");
          if (isDesktop && !isLeftSidebarOpen) {
            toggleLeftSidebar();
          }
        }}
        type="button"
      >
        <FolderKanban className="size-4.5" />
      </button>

      <div className="mt-auto">
        <span className="grid size-9 place-items-center rounded-xl bg-syntx-accent/10 text-syntx-accent">
          <Sparkles className="size-4" />
        </span>
      </div>
    </div>
  );
  if (isDesktop && !isLeftSidebarOpen) {
    return (
      <aside className="relative flex h-full shrink-0 bg-syntx-bg/95 backdrop-blur-xl">
        {rail()}
      </aside>
    );
  }
  if (!isDesktop && !mobileOpen) {
    return null;
  }
  return (
    <aside
      className={cn(
        "z-50 flex h-full shrink-0 border-syntx-line/70 border-r bg-syntx-bg/95 backdrop-blur-2xl",
        isDesktop
          ? "relative"
          : "absolute inset-y-0 left-0 w-[302px] shadow-2xl"
      )}
    >
      {isDesktop ? rail() : null}

      <div className="flex min-h-0 w-[248px] flex-1 flex-col px-3 py-3">
        <div className="mb-3 flex items-center gap-1">
          <div className="flex flex-1 items-center gap-1 rounded-full border border-syntx-line/60 bg-syntx-surface/70 p-0.5">
            {SIDEBAR_TABS.map((tab) => (
              <button
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 font-medium text-[12px] transition-colors",
                  activeList === tab.id
                    ? "bg-syntx-surface-solid text-syntx-ink shadow-sm"
                    : "text-syntx-muted hover:text-syntx-ink"
                )}
                key={tab.id}
                onClick={() => setActiveList(tab.id)}
                type="button"
              >
                {tab.label}
                {tab.id === "chats" ? (
                  <span className="ml-1 text-[10px] text-syntx-muted">
                    {chats.length}
                  </span>
                ) : null}
              </button>
            ))}
          </div>
          {isDesktop ? null : (
            <button
              aria-label="Закрыть меню"
              className="grid size-8 place-items-center rounded-full text-syntx-muted hover:bg-syntx-surface hover:text-syntx-ink"
              onClick={onMobileClose}
              type="button"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        <div className="relative mb-3">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-syntx-muted" />
          <input
            className="h-8.5 w-full rounded-xl border border-syntx-line/70 bg-syntx-surface/60 pr-8 pl-8 text-[12px] text-syntx-ink outline-none transition-colors placeholder:text-syntx-muted/70 focus:border-syntx-accent/40"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по чатам…"
            ref={searchRef}
            value={query}
          />
          {query.length > 0 ? (
            <button
              aria-label="Очистить поиск"
              className="absolute top-1/2 right-1.5 grid size-5 -translate-y-1/2 place-items-center rounded-full text-syntx-muted hover:bg-syntx-surface-solid hover:text-syntx-ink"
              onClick={() => setQuery("")}
              type="button"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </div>

        <div className="syntx-thin-scrollbar -mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {activeList === "projects" ? (
            <div className="rounded-xl border border-syntx-line/60 bg-syntx-surface/60 p-4 text-sm">
              <FolderKanban className="mb-3 size-6 text-syntx-accent" />
              <h2 className="font-semibold">Проекты в разработке</h2>
              <p className="mt-2 text-xs leading-relaxed text-syntx-muted">
                Генерации сохраняются в чатах. Объединение материалов в проекты
                появится позже.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {favoriteChats.length > 0 ? (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 px-1 pb-1">
                    <Star className="size-3 fill-amber-400 text-amber-500" />
                    <span className="font-semibold text-[10px] text-syntx-muted uppercase tracking-[0.18em]">
                      Избранное
                    </span>
                  </div>
                  {favoriteChats.map((chat) => (
                    <ChatRow
                      chat={chat}
                      isActive={activeChatId === chat.id}
                      isRenaming={renamingId === chat.id}
                      key={chat.id}
                      onCancelRename={() => setRenamingId(null)}
                      onChangeRename={setRenameValue}
                      onCommitRename={handleCommitRename}
                      onDelete={handleDelete}
                      onSelect={handleSelect}
                      onStartRename={handleStartRename}
                      onToggleFavorite={toggleFavoriteChat}
                      renameValue={renameValue}
                    />
                  ))}
                </div>
              ) : null}

              {favoritesOnly ? null : (
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 px-1 pb-1">
                    <span className="font-semibold text-[10px] text-syntx-muted uppercase tracking-[0.18em]">
                      Ранее
                    </span>
                  </div>
                  {recentChats.map((chat) => (
                    <ChatRow
                      chat={chat}
                      isActive={activeChatId === chat.id}
                      isRenaming={renamingId === chat.id}
                      key={chat.id}
                      onCancelRename={() => setRenamingId(null)}
                      onChangeRename={setRenameValue}
                      onCommitRename={handleCommitRename}
                      onDelete={handleDelete}
                      onSelect={handleSelect}
                      onStartRename={handleStartRename}
                      onToggleFavorite={toggleFavoriteChat}
                      renameValue={renameValue}
                    />
                  ))}
                </div>
              )}

              {favoritesOnly && favoriteChats.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-syntx-line px-4 py-8 text-center">
                  <Star className="mx-auto size-5 text-syntx-muted" />
                  <p className="mt-2 font-medium text-syntx-ink text-xs">
                    Пока нет избранного
                  </p>
                  <p className="mt-1 text-syntx-muted text-[11px]">
                    Отметьте чат звёздочкой, чтобы он был под рукой.
                  </p>
                </div>
              ) : null}

              {filteredChats.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-syntx-line px-4 py-8 text-center">
                  <Search className="mx-auto size-5 text-syntx-muted" />
                  <p className="mt-2 font-medium text-syntx-ink text-xs">
                    Ничего не найдено
                  </p>
                  <p className="mt-1 text-syntx-muted text-[11px]">
                    Попробуйте другой запрос.
                  </p>
                </div>
              ) : null}
            </div>
          )}
        </div>

        <button
          className="mt-3 flex h-9 w-full shrink-0 items-center justify-center gap-2 rounded-xl border border-syntx-line/70 bg-syntx-surface-solid font-medium text-[12px] text-syntx-ink transition-colors hover:border-syntx-accent/35 hover:text-syntx-accent"
          disabled={!canCreate}
          onClick={handleCreate}
          type="button"
        >
          <Plus className="size-3.5" />
          Новый чат
        </button>
      </div>
    </aside>
  );
};
