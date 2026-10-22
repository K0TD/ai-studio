import { AdminService, updateAccessSchema } from "@/lib/admin/admin-service";
import {
  apiRoute,
  rateLimit,
  readJson,
  requireAdmin,
} from "@/lib/security/http";

export const POST = apiRoute(
  async (request, context: { params: Promise<{ id: string }> }) => {
    const actor = await requireAdmin(request);
    await rateLimit(`access:${actor.id}`, 60, 60);
    const { id } = await context.params;
    const change = await readJson(request, updateAccessSchema);
    return Response.json({
      user: await AdminService.updateAccess(actor.id, id, change),
    });
  }
);
