import type { z } from "zod";

import { ApiError } from "./errors";
export const assertSameOrigin = (request: Request): void => {
  const origin = request.headers.get("origin");
  const configuredUrl =
    process.env.BETTER_AUTH_URL?.trim() ||
    (process.env.NODE_ENV === "production"
      ? undefined
      : process.env.BETTER_AUTH_URL_DEV?.trim() || "http://localhost:3000");
  if (origin && configuredUrl) {
    try {
      if (origin === new URL(configuredUrl).origin) {
        return;
      }
    } catch {
      // Invalid configuration must not weaken the origin check.
    }
  }
  throw new ApiError(403, "Недопустимый источник запроса", "INVALID_ORIGIN");
};
export const readRequestText = async (
  request: Request,
  maxBytes = 65_536
): Promise<string> => {
  const declaredLength = Number(request.headers.get("content-length") ?? 0);
  if (declaredLength > maxBytes) {
    throw new ApiError(413, "Запрос слишком большой");
  }
  const reader = request.body?.getReader();
  if (!reader) {
    throw new ApiError(400, "Пустой запрос");
  }
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) {
        break;
      }
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw new ApiError(413, "Запрос слишком большой");
      }
      chunks.push(chunk.value);
    }
  } finally {
    reader.releaseLock();
  }
  return Buffer.concat(chunks).toString("utf-8");
};
export const readJson = async <T>(
  request: Request,
  schema: z.ZodType<T>,
  maxBytes = 65_536
): Promise<T> => {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    throw new ApiError(415, "Ожидается JSON", "INVALID_CONTENT_TYPE");
  }
  const text = await readRequestText(request, maxBytes);
  let decoded: unknown;
  try {
    decoded = JSON.parse(text);
  } catch {
    throw new ApiError(400, "Некорректный JSON");
  }
  const parsed = schema.safeParse(decoded);
  if (!parsed.success) {
    throw new ApiError(400, "Проверьте поля запроса", "VALIDATION_ERROR");
  }
  return parsed.data;
};
export const idempotencyKey = (request: Request): string => {
  const key = request.headers.get("idempotency-key");
  if (!key || !/^[\w-]{16,128}$/u.test(key)) {
    throw new ApiError(
      400,
      "Требуется Idempotency-Key",
      "IDEMPOTENCY_KEY_REQUIRED"
    );
  }
  return key;
};
