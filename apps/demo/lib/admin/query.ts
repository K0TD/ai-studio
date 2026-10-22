import { z } from "zod";

import { ApiError } from "../security/errors";
const paginationSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  page: z.coerce.number().int().min(1).max(100_000).default(1),
  q: z.string().trim().max(120).default(""),
  userId: z.string().trim().min(1).max(128).optional(),
});
export const adminQuery = (request: Request) => {
  const parsed = paginationSchema.safeParse(
    Object.fromEntries(new URL(request.url).searchParams)
  );
  if (!parsed.success) {
    throw new ApiError(400, "Некорректные параметры списка");
  }
  return parsed.data;
};
