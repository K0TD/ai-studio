import { z } from "zod";

import { ApiError } from "./errors";
import { clientNetwork, rateLimit } from "./rate-limit";
import { readJson } from "./request";

export const authRequestPath = (request: Request) =>
  new URL(request.url).pathname.replace(/^\/api\/auth/u, "");
const callbackSchema = z
  .string()
  .max(500)
  .refine(
    (path) =>
      path.startsWith("/") && !path.startsWith("//") && !path.includes("\\")
  );
const passwordSchema = z.string().max(128);
const signInOptions = {
  callbackURL: callbackSchema.optional(),
  password: passwordSchema,
  rememberMe: z.boolean().optional(),
};
const credentialSchemas = {
  "/sign-in/email": z.strictObject({
    ...signInOptions,
    email: z.email().max(254),
  }),
  "/sign-in/username": z.strictObject({
    ...signInOptions,
    username: z.string().min(3).max(64),
  }),
};
const sessionMutationSchema = z.strictObject({
  token: z.string().min(1).max(256),
});
const passwordChangeSchema = z.strictObject({
  currentPassword: passwordSchema,
  newPassword: z.string().min(12).max(128),
  revokeOtherSessions: z.literal(true),
});

export const validateAuthRequest = async (request: Request): Promise<void> => {
  const path = authRequestPath(request);
  await rateLimit(`auth:ip:${clientNetwork(request)}`, 30, 60);
  if (path === "/sign-in/email") {
    const credentials = await readJson(
      request.clone(),
      credentialSchemas[path]
    );
    await rateLimit(`auth:account:${credentials.email.toLowerCase()}`, 10, 600);
    return;
  }
  if (path === "/sign-in/username") {
    const credentials = await readJson(
      request.clone(),
      credentialSchemas[path]
    );
    await rateLimit(
      `auth:account:${credentials.username.toLowerCase()}`,
      10,
      600
    );
    return;
  }
  if (path === "/change-password") {
    await readJson(request.clone(), passwordChangeSchema);
    return;
  }
  if (path === "/revoke-session") {
    await readJson(request.clone(), sessionMutationSchema);
    return;
  }
  if (
    ["/sign-out", "/revoke-other-sessions", "/revoke-sessions"].includes(path)
  ) {
    await readJson(request.clone(), z.strictObject({}));
    return;
  }
  throw new ApiError(404, "Метод недоступен");
};
