import { z } from "zod";

import { activateAccount } from "@/lib/admin/invitations";
import {
  apiRoute,
  clientNetwork,
  rateLimit,
  readJson,
} from "@/lib/security/http";
const activationSchema = z.strictObject({
  password: z.string().min(12).max(128),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/u),
});
export const POST = apiRoute(async (request) => {
  await rateLimit(`activate:${clientNetwork(request)}`, 10, 600);
  const activation = await readJson(request, activationSchema);
  await activateAccount(activation.token, activation.password);
  return Response.json({ activated: true });
});
