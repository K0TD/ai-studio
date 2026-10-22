import { z } from "zod";

import { adjustBalance } from "@/lib/admin/balance";
import {
  apiRoute,
  idempotencyKey,
  rateLimit,
  readJson,
  requireAdmin,
} from "@/lib/security/http";
import { signedRubSchema } from "@/lib/security/permissions";

const adjustmentSchema = z.strictObject({
  amountRub: signedRubSchema,
  reason: z.string().trim().max(500).optional().default(""),
});
export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireAdmin(request);
    await rateLimit(`balance:${actor.id}`, 60, 60);
    const { id: userId } = await context.params;
    const adjustment = await readJson(request, adjustmentSchema);
    return Response.json(
      await adjustBalance({
        ...adjustment,
        actorId: actor.id,
        key: idempotencyKey(request),
        userId,
      })
    );
  }
);
