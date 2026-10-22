import { isAbsolute } from "node:path";

import { z } from "zod";
const runtimeSchema = z.object({
  ADMIN_LOGIN: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_.]+$/u),
  ADMIN_PASSWORD: z.string().min(12).max(128),
  BETTER_AUTH_SECRET: z.string().min(32),
  BETTER_AUTH_URL: z.url().refine((url) => {
    const parsed = new URL(url);
    return (
      parsed.pathname === "/" &&
      !parsed.search &&
      !parsed.hash &&
      !parsed.username &&
      !parsed.password
    );
  }),
  DATABASE_URL: z.url().refine((url) => /^postgres(ql)?:/u.test(url)),
  MEDIA_ROOT: z.string().refine(isAbsolute),
  ROUTERAI_API_KEY: z.string().min(8),
});
export const validateRuntimeEnv = () => {
  const parsed = runtimeSchema.safeParse(process.env);
  if (!parsed.success) {
    const fields = [
      ...new Set(parsed.error.issues.map((issue) => issue.path[0])),
    ];
    throw new Error(`Не заданы обязательные настройки: ${fields.join(", ")}`);
  }
  const settings = parsed.data;
  if (
    process.env.NODE_ENV === "production" &&
    new URL(settings.BETTER_AUTH_URL).protocol !== "https:"
  ) {
    throw new Error("BETTER_AUTH_URL должен использовать HTTPS в production");
  }
  if (
    /^(change|your_|k0td-studio-super-secret)/iu.test(
      settings.BETTER_AUTH_SECRET
    )
  ) {
    throw new Error("BETTER_AUTH_SECRET должен быть случайным секретом");
  }
  return settings;
};
