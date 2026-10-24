import { z } from "zod";

import { RouterAIError } from "./error";
import type { ProviderFailureContext } from "./error";
import {
  videoResponseSchema,
  imageResponseSchema,
  providerCatalogSchema,
  providerEndpointsSchema,
  generationCostSchema,
  uploadResponseSchema,
  geminiImageUrls,
  nativeImageUrls,
  usageSchema,
} from "./responses";
import type { ProviderEndpoint, ProviderModel } from "./responses";
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
const providerErrorDetailsSchema = z.union([
  z.string().transform((message) => ({ code: undefined, message })),
  z
    .object({
      code: z.union([z.number().int(), z.string()]).optional(),
      message: z.string().optional(),
    })
    .transform(({ code, message }) => ({
      code: code === undefined ? undefined : Number(code),
      message,
    })),
]);
const providerErrorEnvelopeSchema = z
  .looseObject({
    error: z.unknown(),
    id: z.string().max(300).optional(),
    usage: usageSchema,
  })
  .refine((value) => Object.hasOwn(value, "error"));
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

const providerErrorFromEnvelope = (
  envelope: z.infer<typeof providerErrorEnvelopeSchema>,
  response: Response,
  endpoint: string,
  request: RequestInit,
  responseKeys: string[]
): RouterAIError => {
  const errorDetails = providerErrorDetailsSchema.safeParse(envelope.error);
  const original = errorDetails.success
    ? (errorDetails.data.message ?? "Provider error")
    : "Malformed provider error";
  const rawCode = errorDetails.success ? errorDetails.data.code : undefined;
  const parsedCode = rawCode ?? Number.NaN;
  const isTimeout = parsedCode === 408;
  const confirmedClientError =
    Number.isInteger(parsedCode) &&
    parsedCode >= 400 &&
    parsedCode < 500 &&
    !isTimeout;
  const errorStatus =
    Number.isInteger(parsedCode) && parsedCode >= 400 && parsedCode < 500
      ? parsedCode
      : 502;
  const message = /does not support|unsupported|not support/iu.test(original)
    ? "Модель не поддерживает один или несколько выбранных параметров. Обновите настройки и повторите запрос."
    : "Провайдер отклонил параметры генерации. Проверьте настройки и повторите запрос.";
  console.error(
    JSON.stringify({
      endpoint,
      event: "routerai.provider_error_envelope",
      providerCode: rawCode,
      providerMessage: original,
    })
  );
  return new RouterAIError(
    message,
    errorStatus,
    original,
    request.method === "POST" && !confirmedClientError,
    {
      confirmedFailure: confirmedClientError,
      cost: envelope.usage?.cost,
      diagnostic: {
        endpoint,
        responseKeys,
        status: response.status,
      },
      generationId:
        response.headers.get("x-generation-id") ?? envelope.id,
    }
  );
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
    } catch (error) {
      throw new RouterAIError(
        "Не удалось подтвердить ответ провайдера",
        502,
        undefined,
        init.method === "POST",
        {
          diagnostic: {
            endpoint: path,
            status: 0,
            transportFailure:
              error instanceof Error && error.name === "TimeoutError"
                ? "timeout"
                : "network",
          },
        }
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
      const responseBytes = await limitedBody(response);
      const raw = JSON.parse(responseBytes.toString("utf-8"));
      const providerError = providerErrorEnvelopeSchema.safeParse(raw);
      const videoLifecycle = videoResponseSchema.safeParse(raw);
      if (providerError.success && !videoLifecycle.success) {
        const responseKeys = Object.keys(raw)
          .filter((key) => /^[a-z_]{1,40}$/u.test(key))
          .slice(0, 20);
        throw providerErrorFromEnvelope(
          providerError.data,
          response,
          path,
          init,
          responseKeys
        );
      }
      body = providerEnvelopeSchema.parse(
        raw
      );
      return schema.parse({
        ...body,
        id: body.id ?? response.headers.get("x-generation-id") ?? undefined,
      });
    } catch (error) {
      if (error instanceof RouterAIError) {
        error.context ??= responseContext(response, path, body);
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
  async getModelEndpoints(modelId: string): Promise<ProviderEndpoint[]> {
    const [author, model] = modelId.split("/");
    if (!author || !model || modelId.split("/").length !== 2) {
      throw new RouterAIError("Некорректный идентификатор модели", 400);
    }
    const result = await this.json(
      `/models/${encodeURIComponent(author)}/${encodeURIComponent(model)}/endpoints`,
      providerEndpointsSchema
    );
    return result.data.endpoints;
  }
  async getGenerationCost(generationId: string): Promise<number | undefined> {
    if (!generationId || generationId.length > 300) {
      return undefined;
    }
    try {
      return await this.json(
        `/generation?id=${encodeURIComponent(generationId)}`,
        generationCostSchema
      );
    } catch {
      return undefined;
    }
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
          provider: request.provider,
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
      const hasUnpersistableOutput = urls.length > 0;
      throw new RouterAIError(
        hasUnpersistableOutput
          ? "Провайдер вернул слишком много изображений; требуется сверка задания"
          : "Провайдер не вернул изображение. Резерв возвращён, списания нет.",
        502,
        undefined,
        hasUnpersistableOutput,
        {
          confirmedFailure: !hasUnpersistableOutput,
          cost: result.usage?.cost,
          diagnostic: {
            endpoint: gemini ? "/chat/completions" : "/images",
            finishReasons: result.choices?.flatMap((choice) =>
              choice.finish_reason &&
              /^[a-z_]{1,40}$/u.test(choice.finish_reason)
                ? [choice.finish_reason]
                : []
            ),
            outputCount: urls.length,
            responseKeys: Object.keys(result).toSorted().slice(0, 20),
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
    const generationId = response.headers.get("x-generation-id") ?? undefined;
    const cost = generationId
      ? await this.getGenerationCost(generationId)
      : undefined;
    return {
      cost,
      generationId,
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
