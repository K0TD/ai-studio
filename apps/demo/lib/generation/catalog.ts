import { costRub } from "@/lib/billing/money";
import { pool } from "@/lib/db";
import { toIsoDate } from "@/lib/db/date";
import { routerai, limitedBody } from "@/lib/routerai/client";
import {
  VIDEO_MODELS,
  IMAGE_MODELS,
  AUDIO_MODELS,
  isBudgetModel,
} from "@/lib/routerai/models-catalog";
import { providerModelSchema } from "@/lib/routerai/responses";
import type { ProviderModel } from "@/lib/routerai/responses";
import type { ModelMetadata } from "@/lib/routerai/types";
import { ApiError } from "@/lib/security/http";
import type { AuthUser } from "@/lib/security/http";

import type { GenerationRequest } from "./contracts";

export interface CatalogModel extends ModelMetadata {
  supportedQualities?: string[];
  supportedOutputFormats?: string[];
  supportedBackgrounds?: string[];
  maxImageCount?: number;
  supportsReferences?: boolean;
  supportedFrameImages?: string[];
  supportsSeed?: boolean;
  supportedVoices?: string[];
  pricingSourceUrl?: string;
  supportsNegativePrompt?: boolean;
  providerRoute?: ProviderChoice;
  providerOptions?: ProviderChoice[];
  enabled: boolean;
  available: boolean;
  disabledReason?: string;
  verifiedAt: string | null;
  source: "routerai";
  raw: ProviderModel;
}
export interface ProviderChoice {
  tag: string;
  name: string;
  estimatedCostRub: string;
}
const CANDIDATES = [...VIDEO_MODELS, ...IMAGE_MODELS, ...AUDIO_MODELS];
const SPEECH_PAGES = new Map<string, string>(
  Object.entries({
    "elevenlabs/eleven-multilingual-v2":
      "https://routerai.ru/models/elevenlabs/eleven-multilingual-v2",
    "x-ai/grok-voice-tts-1.0":
      "https://routerai.ru/models/x-ai/grok-voice-tts-1.0",
  })
);
export const speechPageRate = (html: string): number | null => {
  const text = html
    .replaceAll(/<script\b[^>]*>[\s\S]*?<\/script>/giu, " ")
    .replaceAll(/<style\b[^>]*>[\s\S]*?<\/style>/giu, " ")
    .replaceAll(/<[^>]+>/gu, " ")
    .replaceAll(/&nbsp;|&#160;/gu, " ")
    .replaceAll(/\s+/gu, " ");
  const match =
    /[Сс]имволы\s*[—–:-]?\s*([\d\s.,]+)\s*₽\s*за\s*1\s*млн\s*символов/u.exec(
      text
    );
  if (!match) {
    return null;
  }
  const perMillion = Number(match[1].replaceAll(/\s/gu, "").replace(",", "."));
  return Number.isFinite(perMillion) && perMillion > 0 && perMillion < 1_000_000
    ? perMillion / 1_000_000
    : null;
};
const verifiedSpeechRate = async (id: string): Promise<number | null> => {
  const page = SPEECH_PAGES.get(id);
  if (!page) {
    return null;
  }
  try {
    const response = await fetch(page, {
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      return null;
    }
    const queryResult1 = await limitedBody(response, 3 * 1024 * 1024);
    return speechPageRate(queryResult1.toString("utf-8"));
  } catch {
    return null;
  }
};
const MAX_AGE_MS = 24 * 60 * 60 * 1000;
let syncing: Promise<void> | undefined;

const supportedPricing = (
  category: ModelMetadata["category"],
  raw: ProviderModel
) => {
  if (category === "video") {
    return (
      raw.pricing_units.seconds === "second" && Number(raw.pricing.seconds) > 0
    );
  }
  if (category === "image") {
    return (
      raw.image_pricing?.some(
        (price) => price.unit === "image" && price.price > 0
      ) ?? false
    );
  }
  if (category === "audio") {
    return (
      Number(raw._verifiedSpeechPricePerCharacterRub) > 0 ||
      (raw.pricing_units.prompt === "character" &&
        Number(raw.pricing.prompt) > 0)
    );
  }
  return false;
};
const supportedVoices = (id: string): string[] | undefined => {
  if (id.startsWith("x-ai/grok-voice")) {
    return ["eve", "ara", "rex", "sal", "leo"];
  }
  if (id.startsWith("elevenlabs/")) {
    return [
      "george",
      "sarah",
      "adam",
      "alice",
      "bella",
      "bill",
      "brian",
      "callum",
      "charlie",
      "chris",
      "daniel",
      "eric",
      "harry",
      "jessica",
      "laura",
      "liam",
      "lily",
      "matilda",
      "river",
      "roger",
      "will",
    ];
  }
  return undefined;
};
const isGeminiImage = (raw: ProviderModel) =>
  raw.id.startsWith("google/gemini-");
const supportsReferences = (raw: ProviderModel) =>
  Boolean(
    raw.supported_image_references ||
    raw.supports_reference_images ||
    raw.supported_parameters?.includes("input_references") ||
    raw.architecture?.input_modalities?.some((modality) =>
      ["image", "video", "audio"].includes(modality)
    )
  );
const supportedInputTypes = (raw: ProviderModel) => {
  const modalities = (raw.architecture?.input_modalities ?? []).filter(
    (type): type is "image" | "video" | "audio" =>
      type === "image" || type === "video" || type === "audio"
  );
  if (
    raw.supported_image_references ||
    raw.supports_reference_images ||
    raw.supported_frame_images?.length
  ) {
    modalities.push("image");
  }
  return [...new Set(modalities)];
};
const maxReferenceCount = (raw: ProviderModel) => {
  if (raw.max_image_references !== undefined) {
    return Math.min(30, raw.max_image_references);
  }
  return supportsReferences(raw) ? 4 : undefined;
};
const supportedFrameImages = (raw: ProviderModel) => {
  if (raw.supported_frame_images) {
    return raw.supported_frame_images;
  }
  return raw.supported_parameters?.includes("frame_images")
    ? ["first_frame", "last_frame"]
    : [];
};
const catalogCapabilities = (raw: ProviderModel) => {
  const geminiImage = isGeminiImage(raw);
  const frameImages = supportedFrameImages(raw);
  return {
    framesExclusiveWithReferences:
      raw.frames_exclusive_with_references === true,
    maxImageCount: geminiImage ? 1 : Math.min(4, raw.max_image_count ?? 1),
    maxReferenceCount: maxReferenceCount(raw),
    supportedAspectRatios: raw.supported_aspect_ratios,
    supportedBackgrounds: geminiImage
      ? ["auto"]
      : (raw.supported_backgrounds ?? ["auto"]),
    supportedDurations: raw.supported_durations,
    supportedFrameImages: frameImages,
    supportedInputTypes: supportedInputTypes(raw),
    supportedOutputFormats: geminiImage
      ? ["png"]
      : (raw.supported_output_formats ?? ["png", "jpeg", "webp"]),
    supportedQualities: geminiImage
      ? ["auto"]
      : (raw.supported_qualities ?? ["auto"]),
    supportedResolutions:
      raw.supported_resolutions ?? raw.supported_image_sizes,
    supportsAudio: raw.generate_audio === true,
    supportsFrameReferences: frameImages.length > 0,
    supportsNegativePrompt:
      raw.supports_negative_prompt === true ||
      raw.supported_parameters?.includes("negativePrompt"),
    supportsReferences: supportsReferences(raw),
    supportsSeed:
      !geminiImage && (raw.seed === true || raw.image_seed === true),
  };
};
const catalogBasePrice = (raw: ProviderModel) =>
  Number(
    raw.pricing.seconds ??
      raw.image_pricing?.find((price) => price.unit === "image")?.price ??
      raw._verifiedSpeechPricePerCharacterRub ??
      raw.pricing.prompt ??
      0
  );
export const normalizeCatalogModel = (
  base: ModelMetadata,
  upstream: Partial<ProviderModel> | undefined,
  verifiedAt: string | null
): CatalogModel => {
  const raw = providerModelSchema.parse({ id: base.id, ...upstream });
  let disabledReason = upstream ? undefined : "model_unavailable";
  if (upstream && !supportedPricing(base.category, raw)) {
    disabledReason = "unsupported_pricing";
  }
  if (base.id.includes("suno") || base.id.includes("video-to-audio")) {
    disabledReason = "unsupported_provider_capability";
  }
  return {
    ...base,
    ...catalogCapabilities(raw),
    available: Boolean(upstream),
    basePriceRub: catalogBasePrice(raw),
    disabledReason,
    enabled: disabledReason === undefined,
    name: raw.name ?? base.name,
    pricingSourceUrl: raw._pricingSourceURL,
    raw,
    source: "routerai",
    subModes:
      base.category === "audio"
        ? [{ id: "tts", name: "Текст в речь" }]
        : undefined,
    supportedVoices: supportedVoices(base.id),
    verifiedAt,
  };
};

export const syncCatalog = async (): Promise<void> => {
  if (syncing) {
    return syncing;
  }
  const pending = (async () => {
    const models = await routerai.getModels();
    const prepared = await Promise.all(
      CANDIDATES.map(async (candidate) => {
        const upstream = models.find((m) => m.id === candidate.id);
        const raw = upstream ? { ...upstream } : undefined;
        if (raw && candidate.category === "audio") {
          const rate = await verifiedSpeechRate(candidate.id);
          if (rate) {
            raw._verifiedSpeechPricePerCharacterRub = rate;
            raw._pricingSourceURL = SPEECH_PAGES.get(candidate.id);
          }
        }
        return {
          data: raw ?? { id: candidate.id, unavailable: true },
          id: candidate.id,
        };
      })
    );
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      for (const model of prepared) {
        await client.query(
          "INSERT INTO syntx_catalog (id,data,verified_at) VALUES ($1,$2,now()) ON CONFLICT(id) DO UPDATE SET data=excluded.data,verified_at=now()",
          [model.id, JSON.stringify(model.data)]
        );
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  })();
  syncing = pending;
  try {
    await pending;
  } finally {
    if (syncing === pending) {
      syncing = undefined;
    }
  }
};

export const catalogModels = async (
  refresh = true
): Promise<CatalogModel[]> => {
  let { rows } = await pool.query(
    "SELECT id,data,verified_at FROM syntx_catalog"
  );
  const stale =
    !rows.length ||
    rows.some(
      (r) =>
        Date.now() - new Date(toIsoDate(r.verified_at)).getTime() > MAX_AGE_MS
    );
  if (stale && refresh) {
    try {
      await syncCatalog();
      const queryResult2 = await pool.query(
        "SELECT id,data,verified_at FROM syntx_catalog"
      );
      ({ rows } = queryResult2);
    } catch {
      /* A stale catalog is displayed but cannot authorize new spending. */
    }
  }
  return CANDIDATES.map((base) => {
    const row = rows.find((r) => r.id === base.id);
    const model = normalizeCatalogModel(
      base,
      row && !row.data.unavailable ? row.data : undefined,
      row ? toIsoDate(row.verified_at) : null
    );
    if (
      !row ||
      Date.now() - new Date(toIsoDate(row.verified_at)).getTime() > MAX_AGE_MS
    ) {
      model.enabled = false;
      model.disabledReason = "catalog_stale";
    }
    return model;
  });
};

export const permittedModel = (
  account: Pick<AuthUser, "permissions" | "role">,
  model: CatalogModel | ModelMetadata
): boolean => {
  if (model.category === "llm") {
    return false;
  }
  // VIP и Администратор: по умолчанию полный доступ ко всем разделам и моделям
  if (account.role === "admin" || account.role === "vip") {
    return true;
  }
  const sections = account.permissions?.sections;
  if (sections && sections.length > 0 && !sections.includes(model.category)) {
    return false;
  }
  // Дополнительно выданные модели в permissions
  if (account.permissions?.modelIds?.includes(model.id)) {
    return true;
  }
  // Обычный пользователь: по умолчанию бюджетные модели
  return isBudgetModel(model);
};

export const requireModel = async (
  account: AuthUser,
  modelId: string,
  tab: string
): Promise<CatalogModel> => {
  const queryResult3 = await catalogModels();
  const model = queryResult3.find(
    (m) => m.id === modelId && m.category === tab
  );
  if (!model) {
    throw new ApiError(404, "Модель не найдена", "MODEL_NOT_FOUND");
  }
  if (!permittedModel(account, model)) {
    throw new ApiError(
      403,
      account.role === "user" && !isBudgetModel(model)
        ? "Эта модель доступна только для тарифа VIP"
        : "Доступ к модели закрыт",
      "VIP_REQUIRED"
    );
  }
  if (!model.enabled) {
    throw new ApiError(
      422,
      "Модель временно недоступна: нет подтверждённого тарифа или возможностей",
      model.disabledReason
    );
  }
  return model;
};

export const estimate = (
  model: CatalogModel,
  settings: GenerationRequest["settings"],
  prompt: string
): string => {
  const { raw } = model;
  let amount: number;
  if (model.category === "video") {
    const rate = Number(raw.pricing.seconds ?? model.basePriceRub);
    amount = rate * (settings.duration ?? 5);
  } else if (model.category === "audio") {
    const rate = Number(
      raw._verifiedSpeechPricePerCharacterRub ??
        raw.pricing.prompt ??
        model.basePriceRub
    );
    amount = rate * Math.max(1, [...prompt].length);
  } else {
    const prices = (raw.image_pricing ?? []).filter((p) => p.unit === "image");
    const variant = [settings.resolution, settings.quality]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    const rate =
      prices.find((p) => p.variant?.toLowerCase() === variant) ??
      prices.find(
        (p) => p.variant?.toLowerCase() === settings.resolution?.toLowerCase()
      ) ??
      prices.find((p) => p.variant === null);
    if (!rate) {
      throw new ApiError(
        422,
        "Нет подтверждённого тарифа для выбранных параметров",
        "UNSUPPORTED_PRICING"
      );
    }
    const unitPrice = Number(rate.price);
    amount = unitPrice * (settings.n ?? 1);
  }
  return costRub(Math.max(0.01, Math.ceil(amount * 100) / 100));
};
