import { costRub } from "@/lib/billing/money";
import { routerai } from "@/lib/routerai/client";
import type { ProviderEndpoint } from "@/lib/routerai/responses";
import { ApiError } from "@/lib/security/http";

import type { CatalogModel, ProviderChoice } from "./catalog";
import type { GenerationRequest } from "./contracts";

const apiAliases = (model: CatalogModel): string[] => {
  if (model.category === "video") {
    return ["/videos", "videos", "video"];
  }
  if (model.category === "audio") {
    return ["/audio/speech", "audio/speech", "speech", "audio"];
  }
  return model.id.startsWith("google/gemini-")
    ? ["/chat/completions", "chat"]
    : ["/images", "images", "image"];
};

const supports = (values: string[] | undefined, names: string[]): boolean =>
  values?.some((value) =>
    names.some(
      (name) => value === name || value.endsWith(name) || value.includes(name)
    )
  ) ?? false;

const endpointVideoCost = (
  endpoint: ProviderEndpoint,
  settings: GenerationRequest["settings"]
): string | null => {
  const rate = Number(endpoint.pricing.seconds);
  if (
    endpoint.pricing_units.seconds !== "second" ||
    !Number.isFinite(rate) ||
    rate <= 0
  ) {
    return null;
  }
  return costRub(rate * (settings.duration ?? 5));
};

interface ImageVariantCost {
  configured: boolean;
  cost: string | null;
}

const imageVariantCost = (
  model: CatalogModel,
  settings: GenerationRequest["settings"]
): ImageVariantCost => {
  const prices = (model.raw.image_pricing ?? []).filter(
    (candidate) => candidate.unit === "image"
  );
  if (!prices.length) {
    return { configured: false, cost: null };
  }
  const variant = [settings.resolution, settings.quality]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const selected =
    prices.find((candidate) => candidate.variant?.toLowerCase() === variant) ??
    prices.find(
      (candidate) =>
        candidate.variant?.toLowerCase() === settings.resolution?.toLowerCase()
    ) ??
    prices.find((candidate) => candidate.variant === null);
  return {
    configured: true,
    cost: selected ? costRub(selected.price * (settings.n ?? 1)) : null,
  };
};

const megapixelImageCost = (
  endpoint: ProviderEndpoint,
  settings: GenerationRequest["settings"]
): string | null => {
  const price = endpoint.pricing;
  const units = endpoint.pricing_units;
  const key = ["image_output", "image"].find(
    (candidate) =>
      units[candidate] === "megapixel" && Number(price[candidate]) > 0
  );
  if (!key) {
    return null;
  }
  const resolution = settings.resolution?.toLowerCase() ?? "1k";
  const dimensions = /^(\d{3,5})x(\d{3,5})$/u.exec(resolution);
  const megapixels = dimensions
    ? (Number(dimensions[1]) * Number(dimensions[2])) / 1_000_000
    : (() => {
        const tier = /^(\d+)\s*mp$/u.exec(resolution);
        return tier ? Number(tier[1]) : 0;
      })();
  if (!Number.isFinite(megapixels) || megapixels <= 0) {
    return null;
  }
  return costRub(Number(price[key]) * megapixels * (settings.n ?? 1));
};

const endpointImageCost = (
  endpoint: ProviderEndpoint,
  model: CatalogModel,
  settings: GenerationRequest["settings"]
): string | null => {
  const variant = imageVariantCost(model, settings);
  if (variant.configured) {
    return variant.cost;
  }
  const price = endpoint.pricing;
  const units = endpoint.pricing_units;
  const key = ["image", "images", "image_output"].find(
    (candidate) =>
      units[candidate] === "image" && Number(price[candidate]) > 0
  );
  if (key) {
    return costRub(Number(price[key]) * (settings.n ?? 1));
  }
  return megapixelImageCost(endpoint, settings);
};

const endpointSpeechCost = (
  endpoint: ProviderEndpoint,
  prompt: string
): string | null => {
  const key = ["prompt", "character", "characters"].find(
    (candidate) =>
      endpoint.pricing_units[candidate] === "character" &&
      Number(endpoint.pricing[candidate]) > 0
  );
  if (!key) {
    return null;
  }
  return costRub(
    Number(endpoint.pricing[key]) * Math.max(1, [...prompt].length)
  );
};

const endpointCost = (
  endpoint: ProviderEndpoint,
  model: CatalogModel,
  settings: GenerationRequest["settings"],
  prompt: string
): string | null => {
  if (model.category === "video") {
    return endpointVideoCost(endpoint, settings);
  }
  if (model.category === "image") {
    return endpointImageCost(endpoint, model, settings);
  }
  return endpointSpeechCost(endpoint, prompt);
};

const endpointSupportsRequest = (
  endpoint: ProviderEndpoint,
  model: CatalogModel,
  settings: GenerationRequest["settings"]
) => {
  if (endpoint.status === undefined || endpoint.status < 0) {
    return false;
  }
  if (!supports(endpoint.supported_apis, apiAliases(model))) {
    return false;
  }
  const parameters = endpoint.supported_parameters;
  if (settings.inputReferences?.length && !model.supportsReferences) {
    return false;
  }
  if (settings.frameImages?.length && !model.supportsFrameReferences) {
    return false;
  }
  const imageInputParameters = model.id.startsWith("google/gemini-")
    ? ["input_references", "image_url", "file", "messages"]
    : ["input_references", "image_url", "file"];
  if (
    settings.inputReferences?.length &&
    !supports(parameters, imageInputParameters)
  ) {
    return false;
  }
  if (settings.frameImages?.length && !supports(parameters, ["frame_images"])) {
    return false;
  }
  return true;
};

export interface ProviderSelection {
  endpoint: ProviderEndpoint;
  provider: ProviderChoice;
  options: ProviderChoice[];
  estimatedCostRub: string;
}

export const selectProvider = async (
  model: CatalogModel,
  settings: GenerationRequest["settings"],
  prompt: string,
  providerTag?: string
): Promise<ProviderSelection> => {
  const endpoints = await routerai.getModelEndpoints(model.id);
  const compatible = endpoints
    .filter((endpoint) => endpointSupportsRequest(endpoint, model, settings))
    .flatMap((endpoint) => {
      const estimatedCostRub = endpointCost(endpoint, model, settings, prompt);
      return estimatedCostRub ? [{ endpoint, estimatedCostRub }] : [];
    })
    .toSorted(
      (left, right) =>
        Number(left.estimatedCostRub) - Number(right.estimatedCostRub)
    );
  if (!compatible.length) {
    throw new ApiError(
      422,
      "Нет активного совместимого провайдера с подтверждённым тарифом для этих параметров",
      "NO_COMPATIBLE_PROVIDER"
    );
  }
  const selected = providerTag
    ? compatible.find(({ endpoint }) => endpoint.tag === providerTag)
    : compatible[0];
  if (!selected) {
    throw new ApiError(
      422,
      "Выбранный провайдер больше не доступен для этой генерации. Обновите расчёт.",
      "PROVIDER_UNAVAILABLE"
    );
  }
  return {
    endpoint: selected.endpoint,
    estimatedCostRub: selected.estimatedCostRub,
    options: compatible.map(({ endpoint, estimatedCostRub }) => ({
      estimatedCostRub,
      name: endpoint.provider_name ?? endpoint.name ?? endpoint.tag,
      tag: endpoint.tag,
    })),
    provider: {
      estimatedCostRub: selected.estimatedCostRub,
      name:
        selected.endpoint.provider_name ??
        selected.endpoint.name ??
        selected.endpoint.tag,
      tag: selected.endpoint.tag,
    },
  };
};
