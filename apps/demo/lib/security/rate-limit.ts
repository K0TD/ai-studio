import { createHash } from "node:crypto";

import { pool } from "../db";
import { ApiError } from "./errors";
export const rateLimitKey = (category: string, identity: string) =>
  createHash("sha256")
    .update(`${process.env.BETTER_AUTH_SECRET}:${category}:${identity}`)
    .digest("hex");
export const rateLimit = async (
  key: string,
  limit: number,
  windowSeconds: number
): Promise<void> => {
  const windowStart =
    Math.floor(Date.now() / (windowSeconds * 1000)) * windowSeconds * 1000;
  const hashedKey = rateLimitKey("application", key);
  const counter = await pool.query<{
    count: number;
  }>(
    `
    INSERT INTO rate_limit (id, key, count, last_request) VALUES ($1, $1, 1, $2)
    ON CONFLICT (key) DO UPDATE SET
      count = CASE WHEN rate_limit.last_request < $2 THEN 1 ELSE rate_limit.count + 1 END,
      last_request = $2
    RETURNING count`,
    [hashedKey, windowStart]
  );
  if (counter.rows[0].count > limit) {
    throw new ApiError(
      429,
      "Слишком много запросов. Попробуйте позже.",
      "RATE_LIMITED"
    );
  }
};
export const clientNetwork = (request: Request): string =>
  // Caddy overwrites this header; the web container must not be publicly exposed.
  request.headers.get("x-forwarded-for")?.split(",").at(-1)?.trim() ?? "local";
