import { AdminService, createUserSchema } from "@/lib/admin/admin-service";
import { adminQuery } from "@/lib/admin/query";
import {
  apiRoute,
  rateLimit,
  readJson,
  requireAdmin,
} from "@/lib/security/http";

export const GET = apiRoute(async (request) => {
  await requireAdmin(request);
  return Response.json(await AdminService.getUsers(adminQuery(request)));
});
export const POST = apiRoute(async (request) => {
  const actor = await requireAdmin(request);
  await rateLimit(`create-user:${actor.id}`, 20, 60);
  return Response.json(
    await AdminService.createUser(
      actor.id,
      await readJson(request, createUserSchema)
    ),
    { status: 201 }
  );
});
