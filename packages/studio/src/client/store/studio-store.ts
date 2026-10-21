"use client";

// Studio controls + lightbox UI state. A module-level singleton
// can't be package-pure — its initial selection and persisted-value
// revalidation both need the host's model/lora/pose catalog, which only
// exists once <Studio> has a StudioClientConfig. So this is a factory
// (createStudioStore) instead of a bare `create(...)` export; <Studio>
// builds one instance per mount via useState and provides it through
// StudioStoreContext, and every consumer reads it through useStudioStore()
// below (same call shape as a zustand singleton, just routed through context).
//
// The generation list itself lives in React Query (see hooks/use-generations.ts);
// submitting lives in hooks/use-generate.ts.

import { createContext, useContext } from "react";
import { z } from "zod";
import { createStore, useStore } from "zustand";
import { persist } from "zustand/middleware";

import type { LoraSelection } from "../../config/lora-selection";
import type {
  RatioKey,
  ResolutionKey,
  StudioClientConfig,
} from "../../config/types";
import { RATIO_KEYS } from "../../config/types";
import type {
  GenerationRealtimeEvent,
  OptimisticGeneration,
} from "../generation-projection";

type PersistedOptions = Pick<
  StudioState,
  | "promptEnhancement"
  | "selectedModelIds"
  | "ratio"
  | "poseImage"
  | "enabledLoras"
>;

export interface StudioState {
  prompt: string;
  promptEnhancement: boolean;
  selectedModelIds: string[];
  ratio: RatioKey;
  resolution: ResolutionKey;
  // Single reference image as a data URL; workflows without reference nodes
  // ignore it. Presence means it's sent with the run.
  referenceImage: string | null;
  // True when the picked reference file exceeds the upload cap. The image still
  // previews (marked invalid) but Generate refuses to submit until replaced.
  referenceImageOversized: boolean;
  // Pose control image: a preset URL from a model's poses or an uploaded data
  // URL. Presence means it's sent as base64 with the run.
  poseImage: string | null;
  // Enabled predefined LoRAs (see a model's `loras`) with any custom slider
  // strength; sent with the run.
  enabledLoras: LoraSelection[];
  // The open image is tracked by its stable result id, not a list position, so a
  // background refetch that prepends/reorders rows can't swap the shown image.
  lightboxId: string | null;
  // Gallery multi-select for bulk delete. Ids, not positions, so refetches
  // can't shift the selection. Not persisted.
  selectedIds: string[];
  // True while a Generate click is in flight (enhancement + run submits). Shared
  // so every GenerateButton instance blocks together.
  generating: boolean;
  // Placeholder cards for runs being submitted (enhancement + submit round-trips).
  // Kept outside the React Query cache and rendered ahead of it, so a concurrent
  // list refetch (poller invalidate, window focus) can't drop them before the
  // server rows exist. Cleared once the post-submit refetch lands.
  optimisticGenerations: OptimisticGeneration[];
  generationRealtimeEvents: GenerationRealtimeEvent[];

  setPrompt: (prompt: string) => void;
  setPromptEnhancement: (enabled: boolean) => void;
  setGenerating: (generating: boolean) => void;
  setOptimisticGenerations: (generations: OptimisticGeneration[]) => void;
  assignOptimisticRequest: (requestId: string) => void;
  clearOptimisticGenerations: () => void;
  addGenerationRealtimeEvent: (event: GenerationRealtimeEvent) => void;
  removeGenerationRealtimeEvent: (event: GenerationRealtimeEvent) => void;
  setReferenceImage: (image: string | null, oversized?: boolean) => void;
  setPoseImage: (image: string | null) => void;
  setEnabledLoras: (loras: LoraSelection[]) => void;
  toggleModel: (id: string) => void;
  setRatio: (ratio: RatioKey) => void;
  setResolution: (resolution: ResolutionKey) => void;
  openLightbox: (id: string) => void;
  closeLightbox: () => void;
  setLightboxId: (id: string) => void;
  toggleSelected: (id: string) => void;
  selectAll: (ids: string[]) => void;
  clearSelection: () => void;
}

const persistedOptionsSchema = z.object({
  enabledLoras: z
    .array(
      z.object({
        id: z.string(),
        strength: z.number().optional(),
      })
    )
    .optional(),
  poseImage: z.string().nullable().optional(),
  promptEnhancement: z.boolean().optional(),
  ratio: z.enum(RATIO_KEYS).optional(),
  selectedModelIds: z.array(z.string()).optional(),
});

export const createStudioStore = (config: StudioClientConfig) => {
  const availableModelIds = new Set(
    config.models.filter((model) => !model.comingSoon).map((model) => model.id)
  );
  const presetPoseUrls = new Set(
    config.models.flatMap(
      (model) => model.poses?.map((pose) => pose.controlImageUrl) ?? []
    )
  );
  const loraIds = new Set(
    config.models.flatMap((model) => model.loras?.map((lora) => lora.id) ?? [])
  );

  return createStore<StudioState>()(
    persist(
      (set) => ({
        addGenerationRealtimeEvent: (event) =>
          set((state) => ({
            generationRealtimeEvents: [
              ...state.generationRealtimeEvents,
              event,
            ],
          })),
        assignOptimisticRequest: (requestId) =>
          set((state) => ({
            optimisticGenerations: state.optimisticGenerations.map((item) => ({
              ...item,
              requestId,
            })),
          })),
        clearOptimisticGenerations: () => set({ optimisticGenerations: [] }),
        clearSelection: () => set({ selectedIds: [] }),
        closeLightbox: () => set({ lightboxId: null }),
        enabledLoras: [],
        generating: false,
        generationRealtimeEvents: [],
        lightboxId: null,
        openLightbox: (id) => set({ lightboxId: id }),
        optimisticGenerations: [],
        poseImage: null,
        prompt: "",
        promptEnhancement: false,
        ratio: "1:1",
        referenceImage: null,
        referenceImageOversized: false,
        removeGenerationRealtimeEvent: (event) =>
          set((state) => ({
            generationRealtimeEvents: state.generationRealtimeEvents.filter(
              (candidate) => candidate !== event
            ),
          })),
        resolution: "Standard",
        selectAll: (ids) => set({ selectedIds: ids }),
        selectedIds: [],
        selectedModelIds: [...availableModelIds],
        setEnabledLoras: (loras) => set({ enabledLoras: loras }),
        setGenerating: (generating) => set({ generating }),
        setLightboxId: (id) => set({ lightboxId: id }),
        setOptimisticGenerations: (generations) =>
          set({ optimisticGenerations: generations }),
        setPoseImage: (image) => set({ poseImage: image }),
        setPrompt: (prompt) => set({ prompt }),
        setPromptEnhancement: (enabled) => set({ promptEnhancement: enabled }),
        setRatio: (ratio) => set({ ratio }),
        setReferenceImage: (image, oversized = false) =>
          set({
            referenceImage: image,
            referenceImageOversized: image !== null && oversized,
          }),
        setResolution: (resolution) => set({ resolution }),
        toggleModel: (id) =>
          set((state) => ({
            selectedModelIds: state.selectedModelIds.includes(id)
              ? state.selectedModelIds.filter((modelId) => modelId !== id)
              : [...state.selectedModelIds, id],
          })),
        toggleSelected: (id) =>
          set((state) => ({
            selectedIds: state.selectedIds.includes(id)
              ? state.selectedIds.filter((selectedId) => selectedId !== id)
              : [...state.selectedIds, id],
          })),
      }),
      {
        merge: (persisted, current) => {
          const parsed = persistedOptionsSchema.safeParse(persisted);
          const stored = parsed.success ? parsed.data : undefined;
          // Drop persisted model ids that were removed or disabled since the
          // last visit; fall back to the defaults if none survive.
          const validIds = stored?.selectedModelIds?.filter((id) =>
            availableModelIds.has(id)
          );
          return {
            ...current,
            ...stored,
            // Drop persisted loras whose ids were removed since the last visit.
            enabledLoras:
              stored?.enabledLoras?.filter((lora) => loraIds.has(lora.id)) ??
              current.enabledLoras,
            // Drop a persisted pose whose preset was removed since the last visit.
            poseImage:
              stored?.poseImage && presetPoseUrls.has(stored.poseImage)
                ? stored.poseImage
                : null,
            selectedModelIds: validIds?.length
              ? validIds
              : current.selectedModelIds,
          };
        },
        name: "studio-options",
        partialize: (state): PersistedOptions => ({
          enabledLoras: state.enabledLoras,
          // Only preset URLs survive a reload — uploaded data URLs are too
          // large for localStorage.
          poseImage: state.poseImage?.startsWith("data:")
            ? null
            : state.poseImage,
          promptEnhancement: state.promptEnhancement,
          ratio: state.ratio,
          selectedModelIds: state.selectedModelIds,
        }),
        // SSR renders with defaults; <StudioOptionsHydration /> rehydrates from
        // localStorage after mount so the client's first render matches.
        skipHydration: true,
      }
    )
  );
};

export type StudioStoreApi = ReturnType<typeof createStudioStore>;

export const StudioStoreContext = createContext<StudioStoreApi | null>(null);

// Same call shape as a zustand singleton (`useStudioStore((s) => s.prompt)`),
// routed through the per-<Studio>-mount store created by createStudioStore.
export const useStudioStore = <T>(selector: (state: StudioState) => T): T => {
  const store = useContext(StudioStoreContext);
  if (!store) {
    throw new Error("useStudioStore() called outside <Studio>");
  }
  return useStore(store, selector);
};

// Non-reactive access (event handlers, imperative reads) — mirrors zustand's
// `useStudioStore.getState()` but needs the context, so it's a hook too.
export const useStudioStoreApi = (): StudioStoreApi => {
  const store = useContext(StudioStoreContext);
  if (!store) {
    throw new Error("useStudioStoreApi() called outside <Studio>");
  }
  return store;
};
