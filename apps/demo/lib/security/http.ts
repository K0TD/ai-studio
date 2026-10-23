import { AsyncLocalStorage } from "node:async_hooks";

import { eq } from "drizzle-orm";

import { auth } from "../auth";
import { db } from "../db";
import { user } from "../db/active-schema";
import { ApiError } from "./errors";
import { assertSameOrigin } from "./request";
export { ApiError } from "./errors";
export { assertSameOrigin, idempotencyKey, readJson } from "./request";
export { clientNetwork, rateLimit, rateLimitKey } from "./rate-limit";
export type AuthUser = typeof user.$inferSelect;
const requestContext = new AsyncLocalStorage<string>();
export const currentRequestId = (): string | undefined =>
  requestContext.getStore();
export const requireUser = async (request: Request): Promise<AuthUser> => {
  const session = await auth.api.getSession({
    headers: request.headers,
    query: { disableCookieCache: true },
  });
  if (!session) {
    throw new ApiError(401, "Необходима авторизация", "UNAUTHENTICATED");
  }
  const [account] = await db
    .select()
    .from(user)
    .where(eq(user.id, session.user.id));
  if (
    !account ||
    account.isBanned ||
    (!account.activatedAt && !account.isEnvAdmin)
  ) {
    throw new ApiError(403, "Доступ к аккаунту закрыт", "ACCOUNT_DISABLED");
  }
  return account;
};
export const requireAdmin = async (request: Request): Promise<AuthUser> => {
  const account = await requireUser(request);
  if (account.role !== "admin" || !account.isApproved) {
    throw new ApiError(
      403,
      "Требуются права действующего администратора",
      "ADMIN_REQUIRED"
    );
  }
  return account;
};
export const apiRoute =
  <Args extends unknown[]>(
    handler: (request: Request, ...args: Args) => Promise<Response>
  ) =>
  (request: Request, ...args: Args): Promise<Response> => {
    const requestId = crypto.randomUUID();
    return requestContext.run(requestId, async () => {
      const startedAt = performance.now();
      const path = new URL(request.url).pathname;
      try {
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
          assertSameOrigin(request);
        }
        const response = await handler(request, ...args);
        response.headers.set("Cache-Control", "no-store");
        response.headers.set("X-Request-Id", requestId);
        if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
          console.info(
            JSON.stringify({
              durationMs: Math.round(performance.now() - startedAt),
              event: "api.completed",
              method: request.method,
              path,
              requestId,
              status: response.status,
            })
          );
        }
        return response;
      } catch (error) {
        const knownError = error instanceof ApiError;
        const status = knownError ? error.status : 500;
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const errorStack = error instanceof Error ? error.stack : undefined;
        console.error(
          JSON.stringify({
            durationMs: Math.round(performance.now() - startedAt),
            error: errorMessage,
            event: "api.rejected",
            method: request.method,
            path,
            requestId,
            stack: errorStack,
            status,
          })
        );
        const responseHeaders = new Headers({
          "Cache-Control": "no-store",
          "X-Request-Id": requestId,
        });
        if (status === 429) {
          responseHeaders.set("Retry-After", "60");
        }
        return Response.json(
          {
            code: knownError ? error.code : "INTERNAL_ERROR",
            error: knownError ? error.message : "Внутренняя ошибка сервера",
            requestId,
          },
          {
            headers: responseHeaders,
            status,
          }
        );
      }
    });
  };
