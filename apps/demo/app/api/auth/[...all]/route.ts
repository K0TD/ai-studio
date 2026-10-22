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

const handlers = toNextJsHandler(auth);
export const GET = apiRoute(async (request) => {
  if (!["/get-session", "/list-sessions"].includes(authRequestPath(request))) {
    throw new ApiError(404, "Метод недоступен");
  }
  await rateLimit(`auth-read:${clientNetwork(request)}`, 120, 60);
  return handlers.GET(request);
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
  await validateAuthRequest(request);
  const response = await handlers.POST(request);
  if (path.includes("/sign-in/")) {
    console.info(
      JSON.stringify({ event: "auth.sign_in", success: response.ok })
    );
  }
  return response;
});
