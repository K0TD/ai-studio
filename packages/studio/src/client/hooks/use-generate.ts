"use client";

import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { selectedRunnableModels } from "../model-utils";
import { useStudioStoreApi } from "../store/studio-store";
import { useStudioConfig } from "../studio-config-provider";
import { httpStatusOf, useStudioHttp } from "../studio-http-context";
import { startGeneration } from "./generate-api";
import type { StartGenerationInput } from "./generate-api";
import { useInvalidateBalance } from "./use-balance";
import { GENERATIONS_QUERY_KEY } from "./use-generations";

const BASE64_DATA_URL_SEPARATOR = ";base64,";

// Pose/reference controls hold either an uploaded data URL or a preset URL;
// either way the API wants the raw base64 payload.
const imageToBase64 = async (image: string): Promise<string> => {
  if (image.startsWith("data:")) {
    const separator = image.indexOf(BASE64_DATA_URL_SEPARATOR);
    return separator === -1
      ? image
      : image.slice(separator + BASE64_DATA_URL_SEPARATOR.length);
  }
  const response = await fetch(image);
  if (!response.ok) {
    throw new Error(`Control image request failed with ${response.status}`);
  }
  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCodePoint(byte);
  }
  return btoa(binary);
};

interface ControlImages {
  pose?: string;
  /** Set when the pose is a bundled preset URL (uploads are data URLs); the
   * server stores the URL instead of re-uploading the asset. */
  posePreset?: string;
  reference?: string;
}

// Encodes the selected control images (concurrently) up front; a failed load
// aborts the whole submit (returns null) with a toast rather than silently
// dropping a control.
const encodeControlImages = async (options: {
  poseImage: string | null;
  referenceImage: string | null;
}): Promise<ControlImages | null> => {
  // null = load failed (toasted); undefined = no image selected.
  const encode = async (
    image: string | null,
    label: string
  ): Promise<string | null | undefined> => {
    if (!image) {
      return undefined;
    }
    try {
      return await imageToBase64(image);
    } catch {
      toast.error(`Couldn't load the selected ${label} image`);
      return null;
    }
  };
  const [pose, reference] = await Promise.all([
    encode(options.poseImage, "pose"),
    encode(options.referenceImage, "reference"),
  ]);
  if (pose === null || reference === null) {
    return null;
  }
  const posePreset =
    options.poseImage && !options.poseImage.startsWith("data:")
      ? options.poseImage
      : undefined;
  return { pose, posePreset, reference };
};

interface StartContext {
  modelIds: string[];
  typedPrompt: string;
  enhance: boolean;
  ratio: StartGenerationInput["ratio"];
  resolution: StartGenerationInput["resolutionTier"];
  controlImages: ControlImages;
  enabledLoras: StartGenerationInput["loras"];
}

const buildStartInput = (ctx: StartContext): StartGenerationInput => {
  const input: StartGenerationInput = {
    enhance: ctx.enhance,
    modelIds: ctx.modelIds,
    prompt: ctx.typedPrompt,
    ratio: ctx.ratio,
    resolutionTier: ctx.resolution,
  };
  if (ctx.controlImages.pose) {
    input.poseImage = ctx.controlImages.pose;
  }
  if (ctx.controlImages.posePreset) {
    input.posePreset = ctx.controlImages.posePreset;
  }
  if (ctx.controlImages.reference) {
    input.referenceImage = ctx.controlImages.reference;
  }
  if (ctx.enabledLoras?.length) {
    input.loras = ctx.enabledLoras;
  }
  return input;
};

// One toast per failed start; moderation outcomes no longer surface here —
// they arrive later through the polled row (blocked/failed card states).
const reportStartFailure = (error: Error): void => {
  const status = httpStatusOf(error);
  if (status === 413) {
    toast.error("Control image is too large — max 7 MB");
  } else if (status === 402) {
    toast.error("Not enough coins");
  } else {
    toast.error("Couldn't start generation");
  }
};

// Kicked off by the Generate click (an event, not an effect). Shows optimistic
// preparing cards for instant feedback, starts the batch with one request (the
// server persists a row per model and returns immediately; enhancement,
// moderation, and the backend submit run in the background), then refetches
// the list — whose response carries the realtime token that mounts the
// <GenerationRealtime> subscription — so the authoritative DB rows take over.
// The optimistic cards live in the studio store (not the query cache) and the
// gallery renders them ahead of the list, so a concurrent refetch during the
// submit window can't drop them; they're cleared once the post-submit refetch
// lands.
export const useGenerate = () => {
  const http = useStudioHttp();
  const config = useStudioConfig();
  const storeApi = useStudioStoreApi();
  const queryClient = useQueryClient();
  const invalidateBalance = useInvalidateBalance();

  return async () => {
    const {
      prompt: rawPrompt,
      selectedModelIds,
      ratio,
      resolution,
      poseImage,
      referenceImage,
      referenceImageOversized,
      enabledLoras,
      promptEnhancement,
      generating,
      setGenerating,
      setOptimisticGenerations,
      assignOptimisticRequest,
      clearOptimisticGenerations,
    } = storeApi.getState();
    const typedPrompt = rawPrompt.trim();
    if (!typedPrompt || generating) {
      return;
    }

    // An oversized reference would be rejected by the backend's body-size
    // limit, so refuse to submit until it's removed or replaced.
    if (referenceImage && referenceImageOversized) {
      toast.error("Reference image is too large — remove or replace it");
      return;
    }

    const models = selectedRunnableModels(config.models, selectedModelIds);
    if (models.length === 0) {
      return;
    }
    setGenerating(true);
    try {
      const controlImages = await encodeControlImages({
        poseImage,
        referenceImage,
      });
      if (!controlImages) {
        return;
      }

      // Cards go up before the network round-trip so the click gets instant
      // feedback; the post-submit refetch replaces them with the DB rows.
      setOptimisticGenerations(
        models.map((model) => ({
          result: {
            coins: model.coinCost,
            id: crypto.randomUUID(),
            prompt: typedPrompt,
            ratio,
            resolution,
            src: "",
            startedAt: Date.now(),
            status: "preparing" as const,
            time: "",
            title: model.name,
          },
        }))
      );

      try {
        const started = await startGeneration(
          http,
          buildStartInput({
            controlImages,
            enabledLoras,
            enhance: promptEnhancement,
            modelIds: models.map((model) => model.id),
            ratio,
            resolution,
            typedPrompt,
          })
        );
        assignOptimisticRequest(started.requestId);
      } catch (error) {
        clearOptimisticGenerations();
        reportStartFailure(
          error instanceof Error ? error : new Error("Unknown generation error")
        );
        return;
      }

      await queryClient.invalidateQueries({ queryKey: GENERATIONS_QUERY_KEY });
      invalidateBalance();
    } finally {
      setGenerating(false);
    }
  };
};
