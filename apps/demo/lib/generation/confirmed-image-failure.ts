import { z } from "zod";

import type { StoredProviderResult } from "./rows";

const confirmedImageFailureSchema = z
  .object({
    confirmedFailure: z.boolean().optional(),
    cost: z.number().nonnegative().optional(),
    diagnostic: z
      .object({
        endpoint: z.string(),
        finishReasons: z.array(z.string()).optional(),
        outputCount: z.number().int().nonnegative().optional(),
        responseKeys: z.array(z.string()).optional(),
        status: z.number().int(),
      })
      .optional(),
  })
  .passthrough()
  .transform((record) => ({
    ...record,
    hasMarker: Object.hasOwn(record, "confirmedFailure"),
    legacyHasErrorEnvelope:
      Object.hasOwn(record, "error") ||
      record.diagnostic?.responseKeys?.includes("error") === true,
    legacyHasParseFailure:
      record.diagnostic?.outputCount !== 0 &&
      (record.diagnostic?.responseKeys !== undefined ||
        record.diagnostic?.finishReasons !== undefined ||
        !record.generationId),
  }));
const serializedConfirmedImageFailureSchema = z
  .string()
  .transform((serialized, context) => {
    try {
      return JSON.parse(serialized);
    } catch {
      context.addIssue({ code: "custom", message: "Invalid stored JSON" });
      return z.NEVER;
    }
  })
  .pipe(confirmedImageFailureSchema);
const storedConfirmedImageFailureSchema = z.union([
  confirmedImageFailureSchema,
  serializedConfirmedImageFailureSchema,
]);
export const confirmedImageFailure = (
  storedValue: StoredProviderResult | string | null
) => {
  const parsed = storedConfirmedImageFailureSchema.safeParse(storedValue);
  if (!parsed.success) {
    return;
  }
  const { diagnostic } = parsed.data;
  if (
    (parsed.data.hasMarker
      ? parsed.data.confirmedFailure !== true
      : parsed.data.legacyHasErrorEnvelope ||
        parsed.data.legacyHasParseFailure) ||
    diagnostic?.status !== 200 ||
    (diagnostic.outputCount !== undefined && diagnostic.outputCount !== 0) ||
    !["/images", "/chat/completions"].includes(diagnostic.endpoint)
  ) {
    return;
  }
  return parsed.data;
};
