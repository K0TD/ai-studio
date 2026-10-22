import { z } from "zod";

const nonnegativePrice = z
  .union([
    z.number().finite().nonnegative(),
    z.string().regex(/^\d+(?:\.\d+)?$/u),
  ])
  .transform(Number)
  .refine(Number.isFinite)
  .optional();
export const usageSchema = z.object({ cost: nonnegativePrice }).optional();
export const videoResponseSchema = z.object({
  error: z
    .union([z.string(), z.object({ message: z.string().optional() })])
    .optional(),
  id: z.string().min(1).max(300),
  polling_url: z.string().optional(),
  status: z.enum([
    "pending",
    "in_progress",
    "completed",
    "failed",
    "cancelled",
    "expired",
  ]),
  unsigned_urls: z.array(z.string().max(2000)).max(4).optional(),
  usage: usageSchema,
});
const imagePart = z.object({
  image_url: z.object({ url: z.string() }).optional(),
  inline_data: z.object({ data: z.string(), mime_type: z.string() }).optional(),
  type: z.string().optional(),
});
const imageMessage = z.object({
  content: z.union([z.string(), z.array(imagePart)]).optional(),
  images: z
    .array(
      z.union([
        z.string(),
        z.object({
          image_url: z.object({ url: z.string() }).optional(),
          url: z.string().optional(),
        }),
      ])
    )
    .max(4)
    .optional(),
  parts: z.array(imagePart).optional(),
});
export const imageResponseSchema = z.object({
  choices: z.array(z.object({ message: imageMessage })).optional(),
  data: z
    .array(
      z.object({ b64_json: z.string().optional(), url: z.string().optional() })
    )
    .max(4)
    .optional(),
  id: z.string().optional(),
  usage: usageSchema,
});
export const uploadResponseSchema = z.object({
  filename: z.string(),
  id: z.string(),
});
const nullableStrings = z
  .array(z.string())
  .nullish()
  .transform((value) => value ?? undefined)
  .optional();
const optionalBoolean = z
  .boolean()
  .nullish()
  .transform((value) => value ?? undefined)
  .optional();
export const providerModelSchema = z.object({
  _pricingSourceURL: z.string().url().optional(),
  _verifiedSpeechPricePerCharacterRub: z
    .number()
    .finite()
    .positive()
    .optional(),
  frames_exclusive_with_references: optionalBoolean,
  generate_audio: optionalBoolean,
  id: z.string(),
  image_pricing: z
    .array(
      z.object({
        price: z.number().finite().positive(),
        unit: z.string(),
        variant: z.string().nullable(),
      })
    )
    .optional(),
  image_seed: optionalBoolean,
  max_image_count: z
    .number()
    .int()
    .positive()
    .nullish()
    .transform((value) => value ?? undefined)
    .optional(),
  max_image_references: z
    .number()
    .int()
    .nonnegative()
    .nullish()
    .transform((value) => value ?? undefined)
    .optional(),
  name: z.string().optional(),
  pricing: z
    .record(
      z.string(),
      z.union([
        z.number().finite().nonnegative(),
        z.string().regex(/^\d+(?:\.\d+)?$/u),
      ])
    )
    .default({}),
  pricing_units: z.record(z.string(), z.string()).default({}),
  seed: optionalBoolean,
  supported_aspect_ratios: nullableStrings,
  supported_backgrounds: nullableStrings,
  supported_durations: z
    .array(z.number().int().positive())
    .nullish()
    .transform((value) => value ?? undefined)
    .optional(),
  supported_frame_images: nullableStrings,
  supported_image_references: optionalBoolean,
  supported_image_sizes: nullableStrings,
  supported_output_formats: nullableStrings,
  supported_parameters: nullableStrings,
  supported_qualities: nullableStrings,
  supported_resolutions: nullableStrings,
  supports_negative_prompt: optionalBoolean,
  supports_reference_images: optionalBoolean,
});
const catalogEntries = z.array(z.json()).transform((entries) =>
  entries.flatMap((entry) => {
    const parsed = providerModelSchema.safeParse(entry);
    return parsed.success ? [parsed.data] : [];
  })
);
export const providerCatalogSchema = z.object({ data: catalogEntries });
export type ProviderModel = z.infer<typeof providerModelSchema>;

type ImageResponse = z.infer<typeof imageResponseSchema>;
const providerImageUrl = (
  image: NonNullable<
    NonNullable<ImageResponse["choices"]>[number]["message"]["images"]
  >[number]
): string | undefined => {
  const text = z.string().safeParse(image);
  if (text.success) {
    return text.data;
  }
  const structured = z
    .object({
      image_url: z.object({ url: z.string() }).optional(),
      url: z.string().optional(),
    })
    .parse(image);
  return structured.image_url?.url ?? structured.url;
};
export const geminiImageUrls = (result: ImageResponse): string[] => {
  const [choice] = result.choices ?? [];
  const message = choice?.message;
  const urls = (message?.images ?? [])
    .map(providerImageUrl)
    .filter((url) => url !== undefined);
  const content = z.array(imagePart).safeParse(message?.content);
  for (const part of content.success ? content.data : (message?.parts ?? [])) {
    if (part.image_url) {
      urls.push(part.image_url.url);
    } else if (part.inline_data) {
      urls.push(
        `data:${part.inline_data.mime_type};base64,${part.inline_data.data}`
      );
    }
  }
  return urls;
};
export const nativeImageUrls = (
  result: ImageResponse,
  format = "png"
): string[] => {
  const urls: string[] = [];
  for (const image of result.data ?? []) {
    if (image.b64_json) {
      urls.push(`data:image/${format};base64,${image.b64_json}`);
    } else if (image.url) {
      urls.push(image.url);
    }
  }
  return urls;
};
