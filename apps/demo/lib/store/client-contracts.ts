import { z } from "zod";

import {
  permissionsSchema,
  roleSchema,
  rubSchema,
  signedRubSchema,
  sectionSchema,
} from "../security/permissions";

// These response projections deliberately discard server-only metadata. Mutating
// request schemas remain strict on the server; UI consumers receive checked fields.
const boundedText = z.string().max(10_000);
const identifier = z.string().min(1).max(160);
const optionList = z.array(z.string().max(160)).max(500);
export const mediaUrlSchema = z
  .string()
  .max(2048)
  .regex(/^\/api\/k0td-ai\/(?:media\/[\da-f-]+|files\/[\da-f-]+\/content)$/iu);
export const clientModelSchema = z.object({
  available: z.boolean(),
  basePriceRub: z.number().finite().nonnegative(),
  category: z.enum(["video", "image", "audio", "llm"]),
  description: boundedText.optional(),
  disabledReason: z.string().max(160).optional(),
  enabled: z.boolean(),
  id: identifier,
  maxImageCount: z.number().int().positive().optional(),
  name: z.string().max(500),
  priceUnit: z.enum(["request", "second", "image", "token"]),
  provider: z.string().max(160),
  subModes: z
    .array(z.object({ id: identifier, name: z.string().max(160) }))
    .max(20)
    .optional(),
  supportedAspectRatios: optionList.optional(),
  supportedBackgrounds: optionList.optional(),
  supportedDurations: z
    .array(z.number().finite().positive())
    .max(100)
    .optional(),
  supportedFrameImages: optionList.optional(),
  supportedOutputFormats: optionList.optional(),
  supportedQualities: optionList.optional(),
  supportedResolutions: optionList.optional(),
  supportedVoices: optionList.optional(),
  supportsAudio: z.boolean().optional(),
  supportsNegativePrompt: z.boolean().optional(),
  supportsReferences: z.boolean().optional(),
  supportsSeed: z.boolean().optional(),
});
export const clientCatalogSchema = z.object({
  audio: z.array(clientModelSchema).max(1000),
  image: z.array(clientModelSchema).max(1000),
  video: z.array(clientModelSchema).max(1000),
});

export const safeRubSchema = rubSchema;
export const safeSignedRubSchema = signedRubSchema;

export const studioUserSchema = z.object({
  availableRub: safeSignedRubSchema,
  balanceRub: safeSignedRubSchema,
  email: z.string().max(254),
  id: identifier,
  isApproved: z.boolean(),
  isBanned: z.boolean(),
  isEnvAdmin: z.boolean().optional(),
  name: z.string().max(500),
  permissions: permissionsSchema,
  reservedRub: safeRubSchema,
  role: roleSchema,
});
export const accountResponseSchema = z.object({ user: studioUserSchema });
export const chatSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
  isFavorite: z.boolean().optional(),
  tab: sectionSchema,
  title: z.string().max(120),
});
export const chatResponseSchema = z.object({ chat: chatSchema });
export const chatsResponseSchema = z.object({
  chats: z.array(chatSchema).max(500),
});
export const generationItemSchema = z.object({
  chargedCostRub: safeRubSchema.nullable().optional(),
  chatId: z.uuid(),
  costRub: z.number().finite().nonnegative(),
  createdAt: z.iso.datetime({ offset: true }),
  estimatedCostRub: safeRubSchema.optional(),
  id: z.uuid(),
  maxCostRub: safeRubSchema.optional(),
  metadata: z
    .object({
      aspectRatio: z.string().max(160).optional(),
      audioVoice: z.string().max(160).optional(),
      durationSeconds: z.number().finite().nonnegative().optional(),
      error: boundedText.optional(),
      generateAudio: z.boolean().optional(),
      instrumental: z.boolean().optional(),
      lyrics: boundedText.optional(),
      resolution: z.string().max(160).optional(),
      seed: z.number().int().optional(),
      sunoStyle: boundedText.optional(),
      sunoTitle: boundedText.optional(),
    })
    .optional(),
  modelId: identifier,
  outputUrls: z.array(mediaUrlSchema).max(20),
  pricingSource: z.enum(["actual", "estimated"]).nullable().optional(),
  prompt: boundedText,
  status: z.enum(["pending", "completed", "failed", "reconciling"]),
  tab: sectionSchema,
});
export const generationResponseSchema = z.object({
  item: generationItemSchema,
});
export const jobsResponseSchema = z.object({
  items: z.array(generationItemSchema).max(100),
  nextCursor: z.uuid().nullable().optional(),
});
export const quoteResponseSchema = z.object({
  quote: z.strictObject({
    estimatedCostRub: rubSchema,
    expiresAt: z.iso.datetime({ offset: true }),
    id: z.uuid(),
    maxCostRub: rubSchema,
  }),
});
export const apiErrorSchema = z.object({ error: boundedText });
export const okResponseSchema = z.object({ ok: z.literal(true) });

export const activationResponseSchema = z.object({
  activated: z.literal(true),
});
