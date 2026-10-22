import type { z } from "zod";

import { RouterAIError } from "./error";
import {
  videoResponseSchema,
  imageResponseSchema,
  providerCatalogSchema,
  uploadResponseSchema,
  geminiImageUrls,
  nativeImageUrls,
} from "./responses";
import type { ProviderModel } from "./responses";
import type {
  ImageGenerateRequest,
  RouterAIVideoResponse,
  SpeechGenerateRequest,
  VideoGenerateRequest,
} from "./types";

const BASE = "https://routerai.ru/api/v1";
const MAX_RESPONSE_BYTES = 64 * 1024 * 1024;
export { RouterAIError } from "./error";
export const limitedBody = async (
  response: Response,
  limit = MAX_RESPONSE_BYTES
): Promise<Buffer> => {
  if (Number(response.headers.get("content-length")) > limit) {
    await response.body?.cancel();
    throw new RouterAIError(
      "Ответ провайдера превышает допустимый размер",
      502,
      undefined,
      true
    );
  }
  const reader = response.body?.getReader();
  if (!reader) {
    throw new RouterAIError(
      "Провайдер вернул пустой ответ",
      502,
      undefined,
      true
    );
  }
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new RouterAIError(
          "Ответ провайдера превышает допустимый размер",
          502,
          undefined,
          true
        );
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks);
};
export interface ProviderOutput {
  urls: string[];
  cost?: number;
  generationId?: string;
}

export class RouterAIClient {
  private explicitApiKey?: string;
  constructor(explicitApiKey?: string) {
    this.explicitApiKey = explicitApiKey;
  }
  getApiKey() {
    return (this.explicitApiKey || process.env.ROUTERAI_API_KEY || "").trim();
  }
  hasApiKey() {
    return this.getApiKey().length > 5;
  }
  async request(
    path: string,
    init: RequestInit = {},
    timeoutMs = 90_000
  ): Promise<Response> {
    if (!this.hasApiKey()) {
      throw new RouterAIError("Сервис генерации не настроен", 503);
    }
    const headers = new Headers(init.headers);
    headers.set("Authorization", `Bearer ${this.getApiKey()}`);
    if (init.body && !(init.body instanceof FormData)) {
      headers.set("Content-Type", "application/json");
    }
    let response: Response;
    try {
      response = await fetch(`${BASE}${path}`, {
        ...init,
        cache: "no-store",
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new RouterAIError(
        "Не удалось подтвердить ответ провайдера",
        502,
        undefined,
        init.method === "POST"
      );
    }
    if (!response.ok) {
      await response.body?.cancel();
      throw new RouterAIError(
        response.status === 429
          ? "Провайдер временно ограничил запросы"
          : "Провайдер отклонил запрос генерации",
        response.status,
        undefined,
        init.method === "POST" &&
          (response.status >= 500 || response.status === 408)
      );
    }
    return response;
  }
  async json<T>(
    path: string,
    schema: z.ZodType<T>,
    init: RequestInit = {}
  ): Promise<T> {
    const response = await this.request(path, init);
    try {
      const queryResult1 = await limitedBody(response);
      return schema.parse(JSON.parse(queryResult1.toString("utf-8")));
    } catch (error) {
      if (error instanceof RouterAIError) {
        throw error;
      }
      throw new RouterAIError(
        "Некорректный ответ провайдера",
        502,
        undefined,
        init.method === "POST"
      );
    }
  }
  async getModels(): Promise<ProviderModel[]> {
    const catalog = await this.json("/models", providerCatalogSchema);
    return catalog.data;
  }
  generateVideo(request: VideoGenerateRequest): Promise<RouterAIVideoResponse> {
    return this.json("/videos", videoResponseSchema, {
      body: JSON.stringify(request),
      method: "POST",
    });
  }
  getVideoStatus(id: string): Promise<RouterAIVideoResponse> {
    return this.json(`/videos/${encodeURIComponent(id)}`, videoResponseSchema);
  }
  getVideoContent(id: string, index = 0, range?: string): Promise<Response> {
    return this.request(
      `/videos/${encodeURIComponent(id)}/content?index=${index}`,
      { headers: range ? { Range: range } : {} }
    );
  }
  async generateImage(request: ImageGenerateRequest): Promise<ProviderOutput> {
    const gemini = request.model.startsWith("google/gemini-");
    const payload = gemini
      ? {
          image_config: {
            aspect_ratio: request.aspect_ratio,
            image_size: request.resolution,
          },
          messages: [
            {
              content: [
                { text: request.prompt, type: "text" },
                ...(request.input_references ?? []).map((reference) => ({
                  image_url: reference.image_url,
                  type: "image_url",
                })),
              ],
              role: "user",
            },
          ],
          modalities: ["image", "text"],
          model: request.model,
        }
      : request;
    const result = await this.json(
      gemini ? "/chat/completions" : "/images",
      imageResponseSchema,
      { body: JSON.stringify(payload), method: "POST" }
    );
    const urls = gemini
      ? geminiImageUrls(result)
      : nativeImageUrls(result, request.output_format);
    if (!urls.length) {
      throw new RouterAIError(
        "Провайдер не вернул изображения; требуется сверка задания",
        502,
        undefined,
        true
      );
    }
    return { cost: result.usage?.cost, generationId: result.id, urls };
  }
  async generateSpeech(
    request: SpeechGenerateRequest
  ): Promise<ProviderOutput> {
    const response = await this.request("/audio/speech", {
      body: JSON.stringify(request),
      method: "POST",
    });
    const mime = response.headers.get("content-type")?.split(";")[0];
    if (!mime?.startsWith("audio/")) {
      await response.body?.cancel();
      throw new RouterAIError(
        "Провайдер не вернул аудио",
        502,
        undefined,
        true
      );
    }
    const bytes = await limitedBody(response);
    if (!bytes.length) {
      throw new RouterAIError(
        "Провайдер вернул пустое аудио",
        502,
        undefined,
        true
      );
    }
    return {
      generationId: response.headers.get("x-generation-id") ?? undefined,
      urls: [`data:${mime};base64,${bytes.toString("base64")}`],
    };
  }
  uploadFile(formData: FormData): Promise<{ id: string; filename: string }> {
    return this.json("/files", uploadResponseSchema, {
      body: formData,
      method: "POST",
    });
  }
}
export const routerai = new RouterAIClient();
