"use client";
import { toast } from "sonner";
import type { z } from "zod";
import { create } from "zustand";

import { isBudgetModel } from "../routerai/models-catalog";
import type {
  GenerationItem,
  SyntxTab,
  ModelMetadata,
} from "../routerai/types";
import {
  accountResponseSchema,
  apiErrorSchema,
  chatResponseSchema,
  chatsResponseSchema,
  clientCatalogSchema,
  jobsResponseSchema,
  okResponseSchema,
} from "./client-contracts";
import { modelAllowed, sectionAllowed } from "./client-policy";
import { hasActiveGenerations, mergeGenerationItems } from "./generation-sync";
export type K0tdTab = SyntxTab;
export interface AvatarProfile {
  id: string;
  name: string;
  role: string;
  url: string;
  voiceId?: string;
  isCustom?: boolean;
}
export const DEFAULT_AVATARS: AvatarProfile[] = [
  {
    id: "elena",
    isCustom: false,
    name: "Елена",
    role: "Деловой стиль",
    url: "https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=400&q=80",
    voiceId: "80441555167a467e967ab9487d844a30",
  },
  {
    id: "mark",
    isCustom: false,
    name: "Марк",
    role: "Технологии",
    url: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=400&q=80",
    voiceId: "3097f9a8fd3b4340b6bbe913177b378f",
  },
  {
    id: "anna",
    isCustom: false,
    name: "Анна",
    role: "Ведущая",
    url: "https://images.unsplash.com/photo-1580489944761-15a19d654956?auto=format&fit=crop&w=400&q=80",
    voiceId: "80441555167a467e967ab9487d844a30",
  },
  {
    id: "denis",
    isCustom: false,
    name: "Денис",
    role: "Эксперт",
    url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=400&q=80",
    voiceId: "3097f9a8fd3b4340b6bbe913177b378f",
  },
];
export interface VideoSettings {
  modelId: string;
  subMode: string;
  aspectRatio: string;
  resolution: string;
  duration: number;
  generateAudio: boolean;
  seed?: number;
  negativePrompt?: string;
  firstFrameUrl?: string;
  lastFrameUrl?: string;
  avatarUrl?: string;
  heygenVoiceId?: string;
}
export interface ImageSettings {
  modelId: string;
  subMode: string;
  aspectRatio: string;
  resolution: string;
  quality: string;
  n: number;
  outputFormat: "png" | "jpeg" | "webp" | "svg";
  background: "auto" | "transparent" | "opaque";
  seed?: number;
  negativePrompt?: string;
  referenceImageUrl?: string;
}
export interface AudioSettings {
  mode: "elevenlabs" | "suno" | "voxtral" | "grok-voice" | "video2audio";
  modelId: string;
  voiceId: string;
  sunoMode: "simple" | "custom";
  songTitle: string;
  style: string;
  lyrics: string;
  instrumental: boolean;
  videoReferenceUrl?: string;
}
export interface ChatSession {
  id: string;
  title: string;
  tab: K0tdTab;
  createdAt: string;
  isFavorite?: boolean;
  /** Per-chat prompt draft, so switching chats keeps their own context. */
  draftPrompt?: string;
}
export interface StudioUser {
  id: string;
  name: string;
  email: string;
  role: "user" | "vip" | "admin";
  balanceRub: string;
  reservedRub: string;
  availableRub: string;
  isApproved: boolean;
  isBanned: boolean;
  permissions: {
    sections: ("video" | "image" | "audio")[];
    modelIds: string[];
    dailyLimitRub: string | null;
    maxConcurrentJobs: number;
  };
}
export interface K0tdStoreState {
  activeTab: K0tdTab;
  setActiveTab: (tab: K0tdTab) => void;
  balanceRub: number;
  user: StudioUser | null;
  models: ModelMetadata[];
  unavailableModels: (ModelMetadata & { disabledReason?: string })[];
  serverReady: boolean;
  serverError: string | null;
  generationSyncError: string | null;
  generationSyncAt: string | null;
  setGenerationSyncError: (error: string | null) => void;
  refreshServer: () => Promise<void>;
  clearSession: () => void;
  refreshJobs: () => Promise<void>;
  refreshActiveJobs: () => Promise<boolean>;
  loadMoreJobs: () => Promise<void>;
  historyCursor: string | null;
  prompt: string;
  setPrompt: (prompt: string) => void;
  isGenerating: boolean;
  setGenerating: (value: boolean) => void;
  isLeftSidebarOpen: boolean;
  toggleLeftSidebar: () => void;
  isRightSidebarOpen: boolean;
  toggleRightSidebar: () => void;
  videoSettings: VideoSettings;
  updateVideoSettings: (settings: Partial<VideoSettings>) => void;
  resetVideoSettings: () => void;
  imageSettings: ImageSettings;
  updateImageSettings: (settings: Partial<ImageSettings>) => void;
  resetImageSettings: () => void;
  audioSettings: AudioSettings;
  updateAudioSettings: (settings: Partial<AudioSettings>) => void;
  resetAudioSettings: () => void;
  chats: ChatSession[];
  activeChatId: string;
  createChat: (tab?: K0tdTab) => void;
  selectChat: (id: string) => void;
  deleteChat: (id: string) => void;
  toggleFavoriteChat: (id: string) => void;
  renameChat: (id: string, title: string) => void;
  history: GenerationItem[];
  addGenerationItem: (item: GenerationItem) => void;
  updateGenerationItem: (id: string, updates: Partial<GenerationItem>) => void;
  deleteGenerationItem: (id: string) => void;
  clearHistory: () => void;
  avatars: AvatarProfile[];
  addAvatar: (avatar: Omit<AvatarProfile, "id">) => void;
  updateAvatar: (id: string, updates: Partial<AvatarProfile>) => void;
  deleteAvatar: (id: string) => void;
  resetAvatars: () => void;
}
const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  aspectRatio: "Auto",
  duration: 5,
  generateAudio: false,
  modelId: "",
  resolution: "",
  subMode: "text2video",
};
const DEFAULT_IMAGE_SETTINGS: ImageSettings = {
  aspectRatio: "auto",
  background: "auto",
  modelId: "",
  n: 1,
  outputFormat: "png",
  quality: "auto",
  resolution: "1K",
  subMode: "text2img",
};
const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  instrumental: false,
  lyrics: "",
  mode: "elevenlabs",
  modelId: "",
  songTitle: "",
  style: "",
  sunoMode: "simple",
  voiceId: "eve",
};
interface ClientCatalogModel extends ModelMetadata {
  available: boolean;
  enabled: boolean;
  disabledReason?: string;
}
interface ClientCatalog {
  video: ClientCatalogModel[];
  image: ClientCatalogModel[];
  audio: ClientCatalogModel[];
}
let refreshRevision = 0;
let sessionRevision = 0;
const retryableReadStatus = (status: number) =>
  status === 408 || status === 429 || status >= 500;
const readResponse = async (
  path: string,
  options: RequestInit | undefined,
  retryable: boolean
) => {
  let attempt = 0;
  for (;;) {
    let response: Response;
    try {
      const timeoutSignal = AbortSignal.timeout(12_000);
      response = await fetch(`/api/k0td-ai/${path}`, {
        ...options,
        cache: "no-store",
        headers: { "Content-Type": "application/json", ...options?.headers },
        signal: options?.signal
          ? AbortSignal.any([options.signal, timeoutSignal])
          : timeoutSignal,
      });
    } catch (error) {
      if (retryable && attempt === 0 && !options?.signal?.aborted) {
        attempt += 1;
        continue;
      }
      throw error;
    }
    if (retryable && attempt === 0 && retryableReadStatus(response.status)) {
      attempt += 1;
      await response.body?.cancel();
      continue;
    }
    return response;
  }
};
const server = async <T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit
): Promise<T> => {
  const method = options?.method?.toUpperCase() ?? "GET";
  const response = await readResponse(path, options, method === "GET");
  const data = await response.json();
  if (!response.ok) {
    if (response.status === 401) {
      globalThis.window?.location.assign("/login");
    }
    const error = apiErrorSchema.safeParse(data);
    throw Object.assign(
      new Error(error.success ? error.data.error : `Ошибка ${response.status}`),
      { status: response.status }
    );
  }
  return schema.parse(data);
};
const handleRefreshFailure = (
  error: Error,
  clearSession: () => void
): string => {
  if ("status" in error && [401, 403].includes(Number(error.status))) {
    clearSession();
  }
  return error.message;
};
const runChatAction = async (operation: () => Promise<void>) => {
  try {
    await operation();
  } catch (error) {
    toast.error(error instanceof Error ? error.message : "Сервис недоступен");
  }
};
const videoOptions = (
  previous: VideoSettings,
  model?: ModelMetadata
): VideoSettings =>
  previous.modelId && !model
    ? previous
    : {
        ...previous,
        aspectRatio: model?.supportedAspectRatios?.includes(
          previous.aspectRatio
        )
          ? previous.aspectRatio
          : "Auto",
        duration: model?.supportedDurations?.includes(previous.duration)
          ? previous.duration
          : (model?.supportedDurations?.[0] ?? 5),
        modelId: model?.id ?? "",
        resolution: model?.supportedResolutions?.includes(previous.resolution)
          ? previous.resolution
          : (model?.supportedResolutions?.[0] ?? ""),
      };
const imageOptions = (
  previous: ImageSettings,
  model?: ModelMetadata
): ImageSettings =>
  previous.modelId && !model
    ? previous
    : {
        ...previous,
        aspectRatio: model?.supportedAspectRatios?.includes(
          previous.aspectRatio
        )
          ? previous.aspectRatio
          : "auto",
        modelId: model?.id ?? "",
        n: Math.min(previous.n, model?.maxImageCount ?? 1),
        quality: model?.supportedQualities?.includes(previous.quality)
          ? previous.quality
          : "auto",
        resolution: model?.supportedResolutions?.includes(previous.resolution)
          ? previous.resolution
          : (model?.supportedResolutions?.[0] ?? "1K"),
      };
const audioOptions = (
  previous: AudioSettings,
  model?: ModelMetadata
): AudioSettings =>
  previous.modelId && !model
    ? previous
    : {
        ...previous,
        mode: "elevenlabs",
        modelId: model?.id ?? "",
        voiceId: model?.supportedVoices?.includes(previous.voiceId)
          ? previous.voiceId
          : (model?.supportedVoices?.[0] ?? "eve"),
      };
const activeSection = (previous: K0tdTab, account: StudioUser): K0tdTab => {
  if (
    !["video", "image", "audio"].includes(previous) ||
    sectionAllowed(account, previous)
  ) {
    return previous;
  }
  return account.permissions.sections[0] ?? "video";
};
const catalogView = (catalog: ClientCatalog, account: StudioUser) => {
  const all = [...catalog.video, ...catalog.image, ...catalog.audio];
  return {
    models: all.filter(
      (model) =>
        model.available && model.enabled && modelAllowed(account, model)
    ),
    unavailableModels: all
      .filter(
        (model) =>
          !model.available || !model.enabled || !modelAllowed(account, model)
      )
      .map((model) => {
        let { disabledReason } = model;
        if (!modelAllowed(account, model)) {
          disabledReason = "access_not_granted";
          if (account.role === "user" && !isBudgetModel(model)) {
            disabledReason = "vip_required";
          }
        }
        return { ...model, disabledReason };
      }),
  };
};
const findSelectedModel = (
  models: ModelMetadata[],
  id: string,
  category: "video" | "image" | "audio"
) =>
  id
    ? models.find((model) => model.id === id && model.category === category)
    : models.find((model) => model.category === category);
export const useK0tdStore = create<K0tdStoreState>()((set, get) => ({
  activeChatId: "",
  activeTab: "video",
  addAvatar: (avatar) =>
    set((state) => ({
      avatars: [
        { ...avatar, id: crypto.randomUUID(), isCustom: true },
        ...state.avatars,
      ],
    })),
  addGenerationItem: (item) =>
    set((state) => ({
      history: [
        item,
        ...state.history.filter((previous) => previous.id !== item.id),
      ],
    })),
  audioSettings: DEFAULT_AUDIO_SETTINGS,
  avatars: DEFAULT_AVATARS,
  balanceRub: 0,
  chats: [],
  clearHistory: () => {
    if (get().activeChatId) {
      get().deleteChat(get().activeChatId);
    }
  },
  clearSession: () => {
    refreshRevision += 1;
    sessionRevision += 1;
    set({
      activeChatId: "",
      balanceRub: 0,
      chats: [],
      generationSyncAt: null,
      generationSyncError: null,
      history: [],
      historyCursor: null,
      isGenerating: false,
      models: [],
      prompt: "",
      serverError: null,
      serverReady: false,
      unavailableModels: [],
      user: null,
    });
  },
  createChat: (tab) =>
    runChatAction(async () => {
      const targetTab = tab ?? get().activeTab;
      if (!["video", "image", "audio"].includes(targetTab)) {
        return;
      }
      const { chat } = await server("chats", chatResponseSchema, {
        body: JSON.stringify({ tab: targetTab }),
        method: "POST",
      });
      set((state) => ({
        activeChatId: chat.id,
        activeTab: chat.tab,
        chats: [chat, ...state.chats],
        prompt: "",
      }));
    }),
  deleteAvatar: (id) =>
    set((state) => ({
      avatars: state.avatars.filter((avatar) => avatar.id !== id),
    })),
  deleteChat: (id) =>
    runChatAction(async () => {
      await server(`chats/${encodeURIComponent(id)}`, okResponseSchema, {
        method: "DELETE",
      });
      set((state) => {
        const chats = state.chats.filter((candidate) => candidate.id !== id);
        const nextChat = chats.find((chat) => chat.tab === state.activeTab);
        return {
          activeChatId:
            state.activeChatId === id
              ? (nextChat?.id ?? "")
              : state.activeChatId,
          chats,
          history: state.history.filter((item) => item.chatId !== id),
          prompt:
            state.activeChatId === id
              ? (nextChat?.draftPrompt ?? "")
              : state.prompt,
        };
      });
    }),
  deleteGenerationItem: () => {
    toast.info("История хранится на сервере. Для скрытия удалите чат.");
  },
  generationSyncAt: null,
  generationSyncError: null,
  history: [],
  historyCursor: null,
  imageSettings: DEFAULT_IMAGE_SETTINGS,
  isGenerating: false,
  isLeftSidebarOpen: true,
  isRightSidebarOpen: true,
  loadMoreJobs: () =>
    runChatAction(async () => {
      const { activeChatId, historyCursor } = get();
      if (!historyCursor) {
        return;
      }
      const data = await server(
        `jobs?chatId=${encodeURIComponent(activeChatId)}&cursor=${encodeURIComponent(historyCursor)}`,
        jobsResponseSchema
      );
      if (get().activeChatId === activeChatId) {
        set((previous) => ({
          history: [
            ...previous.history,
            ...data.items.filter(
              (item) => !previous.history.some((old) => old.id === item.id)
            ),
          ],
          historyCursor: data.nextCursor ?? null,
        }));
      }
    }),
  models: [],
  prompt: "",
  refreshActiveJobs: async () => {
    const revision = sessionRevision;
    const data = await server("jobs?active=true", jobsResponseSchema);
    if (revision !== sessionRevision || !get().user) {
      return false;
    }
    const current = get();
    const previousById = new Map(
      current.history.map((item) => [item.id, item])
    );
    const settledNewly = data.items.some((item) => {
      const previous = previousById.get(item.id);
      return (
        (item.status === "completed" || item.status === "failed") &&
        (previous?.status === "pending" || previous?.status === "reconciling")
      );
    });
    set((state) => ({
      generationSyncAt: new Date().toISOString(),
      generationSyncError: null,
      history: mergeGenerationItems(state.history, data.items),
    }));
    if (settledNewly) {
      try {
        const { user } = await server("me", accountResponseSchema);
        if (revision === sessionRevision && get().user?.id === user.id) {
          set({ balanceRub: Number(user.availableRub), user });
        }
      } catch {
        // The next ordinary account refresh will repair a stale displayed balance.
      }
    }
    return hasActiveGenerations(data.items);
  },
  refreshJobs: async () => {
    const chatId = get().activeChatId;
    const revision = sessionRevision;
    const data = await server(
      `jobs${chatId ? `?chatId=${encodeURIComponent(chatId)}` : ""}`,
      jobsResponseSchema
    );
    if (get().activeChatId === chatId && revision === sessionRevision) {
      set((state) => ({
        history: mergeGenerationItems(state.history, data.items),
        historyCursor: data.nextCursor ?? null,
      }));
    }
  },
  refreshServer: async () => {
    refreshRevision += 1;
    const revision = refreshRevision;
    const previous = get();
    try {
      const [account, catalog, conversations] = await Promise.all([
        server("me", accountResponseSchema),
        server("models", clientCatalogSchema),
        server("chats", chatsResponseSchema),
      ]);
      if (revision !== refreshRevision) {
        return;
      }
      const activeTab = activeSection(previous.activeTab, account.user);
      const chat =
        conversations.chats.find(
          (candidate) =>
            candidate.id === previous.activeChatId &&
            candidate.tab === activeTab
        ) ??
        conversations.chats.find((candidate) => candidate.tab === activeTab);
      const jobs = await server(
        `jobs${chat ? `?chatId=${encodeURIComponent(chat.id)}` : ""}`,
        jobsResponseSchema
      );
      if (
        revision !== refreshRevision ||
        get().activeTab !== previous.activeTab ||
        get().activeChatId !== previous.activeChatId
      ) {
        return;
      }
      const current = get();
      const accountChanged = current.user?.id !== account.user.id;
      if (accountChanged) {
        sessionRevision += 1;
      }
      const { models, unavailableModels } = catalogView(catalog, account.user);
      const retained = (accountChanged ? [] : current.history).filter(
        (item) =>
          item.chatId === chat?.id &&
          !jobs.items.some((latest) => latest.id === item.id)
      );
      const historyCursor =
        previous.activeChatId === chat?.id &&
        previous.history.length > jobs.items.length
          ? previous.historyCursor
          : (jobs.nextCursor ?? null);
      set({
        activeChatId: chat?.id ?? "",
        activeTab,
        audioSettings: audioOptions(
          current.audioSettings,
          findSelectedModel(models, current.audioSettings.modelId, "audio")
        ),
        balanceRub: Number(account.user.availableRub),
        chats: conversations.chats.map((candidate) => ({
          ...candidate,
          draftPrompt: accountChanged
            ? undefined
            : current.chats.find((old) => old.id === candidate.id)?.draftPrompt,
        })),
        generationSyncAt: new Date().toISOString(),
        generationSyncError: null,
        history: mergeGenerationItems(
          current.history.filter(
            (item) =>
              item.status === "pending" ||
              item.status === "reconciling" ||
              item.chatId === chat?.id
          ),
          [...jobs.items, ...retained]
        ),
        historyCursor,
        imageSettings: imageOptions(
          current.imageSettings,
          findSelectedModel(models, current.imageSettings.modelId, "image")
        ),
        models,
        prompt: accountChanged ? "" : current.prompt,
        serverError: null,
        serverReady: true,
        unavailableModels,
        user: account.user,
        videoSettings: videoOptions(
          current.videoSettings,
          findSelectedModel(models, current.videoSettings.modelId, "video")
        ),
      });
    } catch (error) {
      if (revision !== refreshRevision) {
        return;
      }
      const failure =
        error instanceof Error ? error : new Error("Сервис недоступен");
      set({ serverError: handleRefreshFailure(failure, get().clearSession) });
    }
  },
  renameChat: (id, title) =>
    runChatAction(async () => {
      const { chat } = await server(`chats/${id}`, chatResponseSchema, {
        body: JSON.stringify({ title }),
        method: "PATCH",
      });
      set((state) => ({
        chats: state.chats.map((candidate) =>
          candidate.id === id ? { ...candidate, ...chat } : candidate
        ),
      }));
    }),
  resetAudioSettings: () => set({ audioSettings: DEFAULT_AUDIO_SETTINGS }),
  resetAvatars: () => set({ avatars: DEFAULT_AVATARS }),
  resetImageSettings: () => set({ imageSettings: DEFAULT_IMAGE_SETTINGS }),
  resetVideoSettings: () => set({ videoSettings: DEFAULT_VIDEO_SETTINGS }),
  selectChat: (id) => {
    const chat = get().chats.find((candidate) => candidate.id === id);
    if (chat) {
      set({
        activeChatId: id,
        activeTab: chat.tab,
        prompt: chat.draftPrompt ?? "",
      });
    }
  },
  serverError: null,
  serverReady: false,
  setActiveTab: (tab) => {
    if (
      ["video", "image", "audio"].includes(tab) &&
      !sectionAllowed(get().user, tab)
    ) {
      return;
    }
    const chat = get().chats.find((candidate) => candidate.tab === tab);
    set({
      activeChatId: chat?.id ?? "",
      activeTab: tab,
      prompt: chat?.draftPrompt ?? "",
    });
  },
  setGenerating: (isGenerating) => set({ isGenerating }),
  setGenerationSyncError: (generationSyncError) => set({ generationSyncError }),
  setPrompt: (prompt) =>
    set((state) => ({
      chats: state.chats.map((chat) =>
        chat.id === state.activeChatId ? { ...chat, draftPrompt: prompt } : chat
      ),
      prompt,
    })),
  toggleFavoriteChat: (id) =>
    runChatAction(async () => {
      const previous = get().chats.find((candidate) => candidate.id === id);
      if (!previous) {
        return;
      }
      const { chat } = await server(`chats/${id}`, chatResponseSchema, {
        body: JSON.stringify({ isFavorite: !previous.isFavorite }),
        method: "PATCH",
      });
      set((state) => ({
        chats: state.chats.map((candidate) =>
          candidate.id === id ? chat : candidate
        ),
      }));
    }),
  toggleLeftSidebar: () =>
    set((state) => ({ isLeftSidebarOpen: !state.isLeftSidebarOpen })),
  toggleRightSidebar: () =>
    set((state) => ({ isRightSidebarOpen: !state.isRightSidebarOpen })),
  unavailableModels: [],
  updateAudioSettings: (settings) =>
    set((state) => ({
      audioSettings: { ...state.audioSettings, ...settings },
    })),
  updateAvatar: (id, updates) =>
    set((state) => ({
      avatars: state.avatars.map((avatar) =>
        avatar.id === id ? { ...avatar, ...updates } : avatar
      ),
    })),
  updateGenerationItem: (id, updates) =>
    set((state) => ({
      history: state.history.map((item) =>
        item.id === id ? { ...item, ...updates } : item
      ),
    })),
  updateImageSettings: (settings) =>
    set((state) => ({
      imageSettings: { ...state.imageSettings, ...settings },
    })),
  updateVideoSettings: (settings) =>
    set((state) => ({
      videoSettings: { ...state.videoSettings, ...settings },
    })),
  user: null,
  videoSettings: DEFAULT_VIDEO_SETTINGS,
}));
export const useSyntxStore = useK0tdStore;
export type SyntxStoreState = K0tdStoreState;
