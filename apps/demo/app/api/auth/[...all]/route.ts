import { toNextJsHandler } from "better-auth/next-js";

import { auth } from "@/lib/auth";
import {
  authRequestPath,
  validateAuthRequest,
} from "@/lib/security/auth-requests";
import {
  apiRoute,
  ApiError,
  clientNetwork,
  rateLimit,
  requireUser,
} from "@/lib/security/http";

const handlers = toNextJsHandler(auth.handler);
export const GET = apiRoute(async (request) => {
  if (!["/get-session", "/list-sessions"].includes(authRequestPath(request))) {
    throw new ApiError(404, "Метод недоступен");
  }
  await rateLimit(`auth-read:${clientNetwork(request)}`, 120, 60);
  return auth.handler(request);
});
export const POST = apiRoute(async (request) => {
  const path = authRequestPath(request);
  if (path === "/sign-up/email") {
    throw new ApiError(403, "Аккаунты создает администратор");
  }
  if (path === "/change-password") {
    const actor = await requireUser(request);
    if (actor.isEnvAdmin) {
      throw new ApiError(
        403,
        "Логин и пароль основного администратора изменяются через окружение"
      );
    }
  }
  const bodyText = await request.text();
  const requestForValidation = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bodyText,
  });
  const requestForHandler = new Request(request.url, {
    method: request.method,
    headers: request.headers,
    body: bodyText,
  });

  await validateAuthRequest(requestForValidation);
  const response = await auth.handler(requestForHandler);
  if (path.includes("/sign-in/")) {
    console.info(
      JSON.stringify({ event: "auth.sign_in", success: response.ok })
    );
  }
  return response;
});
