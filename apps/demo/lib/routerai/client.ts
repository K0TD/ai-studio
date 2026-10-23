import { z } from "zod";

import { RouterAIError } from "./error";
import type { ProviderFailureContext } from "./error";
import {
  videoResponseSchema,
  imageResponseSchema,
  providerCatalogSchema,
  uploadResponseSchema,
  geminiImageUrls,
  nativeImageUrls,
  usageSchema,
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

const providerEnvelopeSchema = z.looseObject({
  id: z.string().max(300).optional(),
});
type ProviderEnvelope = z.infer<typeof providerEnvelopeSchema>;
const finishReasonsSchema = z.array(
  z.looseObject({
    finish_reason: z
      .string()
      .regex(/^[a-z_]{1,40}$/u)
      .nullish(),
  })
);

// Keep only bounded metadata. Provider bodies may contain private prompts,
// signed download URLs and many megabytes of base64 image data.
const responseContext = (
  response: Response,
  endpoint: string,
  body?: ProviderEnvelope
): ProviderFailureContext => {
  const usage = usageSchema.safeParse(body?.usage);
  const choices = finishReasonsSchema.safeParse(body?.choices);
  return {
    cost: usage.success ? usage.data?.cost : undefined,
    diagnostic: {
      endpoint,
      finishReasons: choices.success
        ? choices.data
            .flatMap((choice) =>
              choice.finish_reason ? [choice.finish_reason] : []
            )
            .slice(0, 4)
        : undefined,
      responseKeys: body
        ? Object.keys(body)
            .filter((key) => /^[a-z_]{1,40}$/u.test(key))
            .slice(0, 20)
        : undefined,
      status: response.status,
    },
    generationId: (response.headers.get("x-generation-id") ?? body?.id)?.slice(
      0,
      300
    ),
  };
};

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
      let body: ProviderEnvelope | undefined;
      try {
        const bytes = await limitedBody(response, 65_536);
        body = providerEnvelopeSchema.parse(
          JSON.parse(bytes.toString("utf-8"))
        );
      } catch {
        // An error body is diagnostic only; never expose it to the client.
      }
      const isServerOrTimeout =
        response.status >= 500 || response.status === 408;
      const message =
        response.status === 429
          ? "Провайдер временно ограничил запросы"
          : `Провайдер отклонил запрос генерации (${response.status})`;
      throw new RouterAIError(
        message,
        response.status,
        undefined,
        init.method === "POST" && isServerOrTimeout,
        responseContext(response, path, body)
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
    let body: ProviderEnvelope | undefined;
    try {
      const queryResult1 = await limitedBody(response);
      body = providerEnvelopeSchema.parse(
        JSON.parse(queryResult1.toString("utf-8"))
      );
      return schema.parse({
        ...body,
        id: body.id ?? response.headers.get("x-generation-id") ?? undefined,
      });
    } catch (error) {
      if (error instanceof RouterAIError) {
        error.context = responseContext(response, path, body);
        error.uncertain = init.method === "POST";
        throw error;
      }
      throw new RouterAIError(
        "Некорректный ответ провайдера; требуется сверка задания",
        502,
        undefined,
        init.method === "POST",
        responseContext(response, path, body)
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
    if (!urls.length || urls.length > 4) {
      throw new RouterAIError(
        "Провайдер не вернул изображения; требуется сверка задания",
        502,
        undefined,
        true,
        {
          cost: result.usage?.cost,
          diagnostic: {
            endpoint: gemini ? "/chat/completions" : "/images",
            finishReasons: result.choices?.flatMap((choice) =>
              choice.finish_reason &&
              /^[a-z_]{1,40}$/u.test(choice.finish_reason)
                ? [choice.finish_reason]
                : []
            ),
            status: 200,
          },
          generationId: result.id,
        }
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
    const context = responseContext(response, "/audio/speech");
    const mime = response.headers.get("content-type")?.split(";")[0];
    if (!mime?.startsWith("audio/")) {
      await response.body?.cancel();
      throw new RouterAIError(
        "Провайдер не вернул аудио",
        502,
        undefined,
        true,
        context
      );
    }
    let bytes: Buffer;
    try {
      bytes = await limitedBody(response);
    } catch (error) {
      if (error instanceof RouterAIError) {
        error.context = context;
        throw error;
      }
      throw new RouterAIError(
        "Не удалось прочитать аудио провайдера",
        502,
        undefined,
        true,
        context
      );
    }
    if (!bytes.length) {
      throw new RouterAIError(
        "Провайдер вернул пустое аудио",
        502,
        undefined,
        true,
        context
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
