import { createHash } from "node:crypto";

import { z } from "zod";

import { ApiError } from "@/lib/security/http";

import type { CatalogModel } from "./catalog";

const imageReference = z.strictObject({ url: z.string().max(500) });
export const settingsSchema = z.strictObject({
  aspectRatio: z.string().max(20).optional(),
  avatarUrl: z.string().max(500).optional(),
  background: z.enum(["auto", "transparent", "opaque"]).optional(),
  duration: z.number().int().min(1).max(30).optional(),
  frameImages: z
    .array(
      z.strictObject({
        frame_type: z.enum(["first_frame", "last_frame"]),
        image_url: imageReference,
        type: z.literal("image_url"),
      })
    )
    .max(2)
    .optional(),
  generateAudio: z.boolean().optional(),
  heygenVoiceId: z.string().max(100).optional(),
  inputReferences: z
    .array(
      z.strictObject({
        file: z.strictObject({ file_id: z.string().uuid() }).optional(),
        image_url: imageReference.optional(),
        type: z.enum(["file", "image_url"]),
      })
    )
    .max(4)
    .optional(),
  instrumental: z.boolean().optional(),
  lyrics: z.string().max(5000).optional(),
  mode: z.enum(["elevenlabs", "suno", "video2audio"]).optional(),
  n: z.number().int().min(1).max(4).optional(),
  negativePrompt: z.string().max(2000).optional(),
  outputFormat: z.enum(["png", "jpeg", "webp", "svg"]).optional(),
  quality: z.enum(["auto", "low", "medium", "high"]).optional(),
  resolution: z.string().max(30).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  songTitle: z.string().max(80).optional(),
  style: z.string().max(500).optional(),
  videoReferenceUrl: z.string().max(500).optional(),
  voiceId: z.string().min(1).max(100).optional(),
});
export const generationRequestSchema = z.strictObject({
  chatId: z.string().uuid(),
  modelId: z.string().min(1).max(160),
  prompt: z.string().trim().min(1).max(5000),
  settings: settingsSchema.default({}),
  tab: z.enum(["video", "image", "audio"]),
});
export const submitRequestSchema = generationRequestSchema.extend({
  quoteId: z.string().uuid(),
});
export type GenerationRequest = z.infer<typeof generationRequestSchema>;

export const canonicalJson = (value: GenerationRequest): string =>
  JSON.stringify(
    value,
    [
      "chatId",
      "modelId",
      "prompt",
      "settings",
      "tab",
      ...settingsSchema.keyof().options,
      "type",
      "file",
      "file_id",
      "image_url",
      "url",
      "frame_type",
    ].toSorted()
  );
export const requestHash = (request: GenerationRequest): string =>
  createHash("sha256").update(canonicalJson(request)).digest("hex");

const fail = (label: string): never => {
  throw new ApiError(
    422,
    `Модель не поддерживает выбранный параметр: ${label}`,
    "UNSUPPORTED_SETTINGS"
  );
};
const choice = (
  value: string | undefined,
  supported: string[] | undefined,
  label: string
) => {
  if (
    value &&
    value !== "Auto" &&
    value !== "auto" &&
    !supported?.includes(value)
  ) {
    fail(label);
  }
};
const validateFrames = (
  input: GenerationRequest["settings"],
  model: CatalogModel
) => {
  const { raw } = model;
  for (const frame of input.frameImages ?? []) {
    if (!raw.supported_frame_images?.includes(frame.frame_type)) {
      fail("кадры");
    }
  }
  if (
    raw.frames_exclusive_with_references &&
    input.frameImages?.length &&
    input.inputReferences?.length
  ) {
    fail("кадры вместе с референсами");
  }
};
const validateCommon = (
  input: GenerationRequest["settings"],
  model: CatalogModel
) => {
  const { raw } = model;
  choice(input.aspectRatio, model.supportedAspectRatios, "соотношение сторон");
  if (input.negativePrompt && !model.supportsNegativePrompt) {
    fail("негативный промпт");
  }
  if (input.seed !== undefined && !model.supportsSeed) {
    fail("seed");
  }
  if ((input.inputReferences?.length ?? 0) > (raw.max_image_references ?? 4)) {
    fail("число референсов");
  }
  if (input.inputReferences?.length && !model.supportsReferences) {
    fail("референсы");
  }
  validateFrames(input, model);
};
const aspectFor = (input: GenerationRequest["settings"]) =>
  input.aspectRatio && !["Auto", "auto"].includes(input.aspectRatio)
    ? input.aspectRatio
    : undefined;
const videoSettings = (
  input: GenerationRequest["settings"],
  model: CatalogModel
): GenerationRequest["settings"] => {
  const duration = input.duration ?? model.supportedDurations?.[0];
  if (!duration || !model.supportedDurations?.includes(duration)) {
    fail("длительность");
  }
  const resolution = input.resolution ?? model.supportedResolutions?.[0];
  choice(resolution, model.supportedResolutions, "разрешение");
  if (input.generateAudio && !model.supportsAudio) {
    fail("аудио");
  }
  if (model.id.includes("heygen") && !input.inputReferences?.length) {
    fail("изображение аватара обязательно");
  }
  const output: GenerationRequest["settings"] = {
    aspectRatio: aspectFor(input),
    duration,
    frameImages: input.frameImages,
    heygenVoiceId: input.heygenVoiceId,
    inputReferences: input.inputReferences,
    negativePrompt: input.negativePrompt,
    resolution,
    seed: input.seed,
  };
  if (model.supportsAudio) {
    output.generateAudio = input.generateAudio ?? false;
  }
  return output;
};
const imageResolution = (
  input: GenerationRequest["settings"],
  model: CatalogModel
) => {
  const resolution = input.resolution ?? model.supportedResolutions?.[0];
  if (model.supportedResolutions?.length) {
    choice(resolution, model.supportedResolutions, "разрешение");
    return resolution;
  }
  if (resolution && resolution !== "1K") {
    fail("разрешение");
  }
};
const imageSettings = (
  input: GenerationRequest["settings"],
  model: CatalogModel
): GenerationRequest["settings"] => {
  const { raw } = model;
  const n = input.n ?? 1;
  if (n > (raw.max_image_count ?? 1)) {
    fail("число изображений");
  }
  if (input.quality && input.quality !== "auto") {
    choice(input.quality, raw.supported_qualities, "качество");
  }
  if (input.background && input.background !== "auto") {
    choice(input.background, raw.supported_backgrounds, "фон");
  }
  const outputFormat = input.outputFormat ?? "png";
  if (raw.supported_output_formats?.length) {
    choice(outputFormat, raw.supported_output_formats, "формат");
  } else if (outputFormat === "svg") {
    fail("SVG");
  }
  return {
    aspectRatio: aspectFor(input),
    background: model.supportedBackgrounds?.includes(input.background ?? "")
      ? input.background
      : undefined,
    inputReferences: input.inputReferences,
    n,
    negativePrompt: input.negativePrompt,
    outputFormat,
    quality: model.supportedQualities?.includes(input.quality ?? "")
      ? input.quality
      : undefined,
    resolution: imageResolution(input, model),
    seed: input.seed,
  };
};
const audioSettings = (
  input: GenerationRequest["settings"],
  model: CatalogModel
): GenerationRequest["settings"] => {
  if (input.mode && input.mode !== "elevenlabs") {
    fail("режим аудио");
  }
  const voiceId = input.voiceId ?? model.supportedVoices?.[0];
  if (!voiceId || !model.supportedVoices?.includes(voiceId)) {
    fail("голос");
  }
  return { mode: "elevenlabs", voiceId };
};
export const normalizedSettings = (
  request: GenerationRequest,
  model: CatalogModel
): GenerationRequest["settings"] => {
  validateCommon(request.settings, model);
  if (request.tab === "video") {
    return videoSettings(request.settings, model);
  }
  if (request.tab === "image") {
    return imageSettings(request.settings, model);
  }
  return audioSettings(request.settings, model);
};
export const localReferenceId = (url: string): string => {
  const match =
    /^\/api\/(?:k0td-ai|syntx)\/files\/([0-9a-f-]{36})\/content$/u.exec(url);
  if (!match || !z.string().uuid().safeParse(match[1]).success) {
    throw new ApiError(
      422,
      "Используйте загруженный в аккаунт референс",
      "INVALID_REFERENCE"
    );
  }
  return match[1];
};
export const referenceId = (
  ref: NonNullable<GenerationRequest["settings"]["inputReferences"]>[number]
): string => {
  if (ref.type === "file" && ref.file?.file_id) {
    return ref.file.file_id;
  }
  if (ref.type === "image_url" && ref.image_url) {
    return localReferenceId(ref.image_url.url);
  }
  throw new ApiError(422, "Некорректный референс");
};
export const referencedFileIds = (
  settings: GenerationRequest["settings"]
): string[] => [
  ...(settings.inputReferences ?? []).map(referenceId),
  ...(settings.frameImages ?? []).map((frame) =>
    localReferenceId(frame.image_url.url)
  ),
];
