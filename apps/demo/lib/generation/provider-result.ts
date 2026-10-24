import { z } from "zod";

import type { ProviderFailureContext } from "@/lib/routerai/error";

import type { StoredProviderResult } from "./rows";

const videoStatusSchema = z.enum([
  "pending",
  "in_progress",
  "completed",
  "failed",
  "cancelled",
  "expired",
]);
const storedProviderResultSchema = z
  .object({
    confirmedFailure: z.boolean().optional(),
    cost: z.number().nonnegative().optional(),
    diagnostic: z
      .object({
        endpoint: z.string().optional(),
        finishReasons: z.array(z.string()).optional(),
        outputCount: z.number().int().nonnegative().optional(),
        responseKeys: z.array(z.string()).optional(),
        status: z.number().int().optional(),
      })
      .passthrough()
      .optional(),
    generationId: z.string().optional(),
    id: z.string().optional(),
    status: videoStatusSchema.optional(),
    unsigned_urls: z.array(z.string()).optional(),
    urls: z.array(z.string()).optional(),
    usage: z.object({ cost: z.number().nonnegative().optional() }).optional(),
  })
  .passthrough();
const serializedProviderResultSchema = z
  .string()
  .transform((serialized, context) => {
    try {
      return JSON.parse(serialized);
    } catch {
      context.addIssue({ code: "custom", message: "Invalid stored JSON" });
      return z.NEVER;
    }
  })
  .pipe(storedProviderResultSchema);
const storedProviderResultInputSchema = z.union([
  storedProviderResultSchema,
  serializedProviderResultSchema,
]);
interface MergedProviderResult {
  confirmedFailure?: boolean;
  cost?: number;
  diagnostic?: {
    endpoint?: string;
    finishReasons?: string[];
    outputCount?: number;
    responseKeys?: string[];
    status?: number;
  };
  generationId?: string;
  id?: string;
  status?: StoredProviderResult["status"];
  unsigned_urls?: string[];
  urls?: string[];
  usage?: StoredProviderResult["usage"];
}

export const mergeUncertainProviderResult = (
  existing: StoredProviderResult | string | null,
  context?: ProviderFailureContext
) => {
  const parsed = storedProviderResultInputSchema.safeParse(existing);
  const result: MergedProviderResult = parsed.success
    ? { ...parsed.data }
    : {};
  result.confirmedFailure = false;
  if (result.cost === undefined && context?.cost !== undefined) {
    result.cost = context.cost;
  }
  if (!result.diagnostic && context?.diagnostic) {
    result.diagnostic = context.diagnostic;
  }
  if (!result.generationId && context?.generationId) {
    result.generationId = context.generationId;
  }
  return result;
};
