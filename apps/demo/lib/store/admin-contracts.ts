import { z } from "zod";

import {
  permissionsSchema,
  roleSchema,
  rubSchema,
  signedRubSchema,
} from "../security/permissions";
import { studioUserSchema } from "./client-contracts";

const text = z.string().max(10_000);
const identifier = z.string().min(1).max(160);
const accessState = z.object({
  isApproved: z.boolean().optional(),
  isBanned: z.boolean().optional(),
  permissions: permissionsSchema.optional(),
  role: roleSchema.optional(),
});
// Project only the fields the administrative interface displays; never render
// arbitrary provider responses or internal storage paths from a response object.
export const adminRowSchema = z.object({
  action: text.optional(),
  actorId: identifier.nullable().optional(),
  amountRub: signedRubSchema.optional(),
  balanceAfterRub: rubSchema.optional(),
  balanceBeforeRub: rubSchema.optional(),
  chargedCostRub: rubSchema.nullable().optional(),
  createdAt: z.iso.datetime({ offset: true }).optional(),
  details: z
    .object({
      after: accessState.optional(),
      amountRub: signedRubSchema.optional(),
      before: accessState.optional(),
      permissions: permissionsSchema.optional(),
      reason: text.optional(),
      role: roleSchema.optional(),
      sessionsRevoked: z.boolean().optional(),
      transactionId: identifier.optional(),
    })
    .optional(),
  estimatedCostRub: rubSchema.optional(),
  id: identifier.optional(),
  jobId: identifier.nullable().optional(),
  maxCostRub: rubSchema.optional(),
  modelId: identifier.optional(),
  pricingSource: z.enum(["actual", "estimated"]).nullable().optional(),
  prompt: text.optional(),
  providerCostRub: rubSchema.nullable().optional(),
  providerId: identifier.nullable().optional(),
  reason: text.optional(),
  settledAt: z.iso.datetime({ offset: true }).nullable().optional(),
  status: z.string().max(160).optional(),
  submittedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  targetId: identifier.nullable().optional(),
  type: z.string().max(160).optional(),
  userId: identifier.optional(),
  userName: z.string().max(500).optional(),
  varianceRub: signedRubSchema.nullable().optional(),
});
export const statsSchema = z.object({
  activeGenerations: z.number().int().nonnegative(),
  routerAiStatus: z.enum(["operational", "degraded", "down"]),
  supportedModelsCount: z.number().int().nonnegative(),
  totalBalanceRub: z.string().regex(/^\d+(?:\.\d{1,2})?$/u),
  totalSpentTodayRub: z.string().regex(/^\d+(?:\.\d{1,2})?$/u),
  totalUsers: z.number().int().nonnegative(),
});
export const adminUsersResponseSchema = z.object({
  stats: statsSchema,
  total: z.number().int().nonnegative(),
  users: z.array(studioUserSchema).max(100),
});
export const adminRowsResponseSchema = z.object({
  events: z.array(adminRowSchema).max(100).optional(),
  items: z.array(adminRowSchema).max(100).optional(),
  total: z.number().int().nonnegative(),
  transactions: z.array(adminRowSchema).max(100).optional(),
});
export const invitationResponseSchema = z.object({
  activationUrl: z
    .url()
    .max(2048)
    .regex(/^https?:\/\//u),
});
