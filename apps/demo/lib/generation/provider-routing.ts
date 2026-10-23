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

const endpointCost = (
  endpoint: ProviderEndpoint,
  model: CatalogModel,
  settings: GenerationRequest["settings"],
  prompt: string
): string | null => {
  const price = endpoint.pricing;
  const units = endpoint.pricing_units;
  if (model.category === "video") {
    const rate = Number(price.seconds);
    if (units.seconds !== "second" || !Number.isFinite(rate) || rate <= 0) {
      return null;
    }
    return costRub(rate * (settings.duration ?? 5));
  }
  if (model.category === "image") {
    const key = ["image", "images", "image_output"].find(
      (candidate) =>
        units[candidate] === "image" && Number(price[candidate]) > 0
    );
    if (key) {
      return costRub(Number(price[key]) * (settings.n ?? 1));
    }
    const megapixelKey = ["image_output", "image"].find(
      (candidate) =>
        units[candidate] === "megapixel" && Number(price[candidate]) > 0
    );
    if (!megapixelKey) {
      return null;
    }
    const resolution = settings.resolution?.toLowerCase() ?? "1k";
    const dimensions = /^(\d{3,5})x(\d{3,5})$/u.exec(resolution);
    const megapixels = dimensions
      ? (Number(dimensions[1]) * Number(dimensions[2])) / 1_000_000
      : Number(/^([1-4])\s*(?:mp|k)$/u.exec(resolution)?.[1] ?? 0);
    if (!Number.isFinite(megapixels) || megapixels <= 0) {
      return null;
    }
    return costRub(
      Number(price[megapixelKey]) * megapixels * (settings.n ?? 1)
    );
  }
  const key = ["prompt", "character", "characters"].find(
    (candidate) =>
      units[candidate] === "character" && Number(price[candidate]) > 0
  );
  if (!key) {
    return null;
  }
  return costRub(Number(price[key]) * Math.max(1, [...prompt].length));
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
