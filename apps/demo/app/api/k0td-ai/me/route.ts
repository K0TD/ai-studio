import { userView } from "@/lib/admin/user-view";
import { apiRoute, requireUser } from "@/lib/security/http";

export const GET = apiRoute(async (request) =>
  Response.json({ user: userView(await requireUser(request)) })
);
