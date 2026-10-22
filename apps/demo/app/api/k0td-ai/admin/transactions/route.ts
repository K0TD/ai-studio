import { AdminService } from "@/lib/admin/admin-service";
import { adminQuery } from "@/lib/admin/query";
import { apiRoute, requireAdmin } from "@/lib/security/http";

export const GET = apiRoute(async (request) => {
  await requireAdmin(request);
  return Response.json(await AdminService.getTransactions(adminQuery(request)));
});
