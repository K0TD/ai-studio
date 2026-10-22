import { z } from "zod";

import { renewInvitation } from "@/lib/admin/invitations";
import {
  apiRoute,
  rateLimit,
  readJson,
  requireAdmin,
} from "@/lib/security/http";

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireAdmin(request);
    await rateLimit(`invite:${actor.id}`, 20, 60);
    await readJson(request, z.strictObject({}));
    const { id } = await context.params;
    return Response.json({
      activationUrl: await renewInvitation(actor.id, id),
    });
  }
);
