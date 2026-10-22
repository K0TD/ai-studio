import { formatKopecks, parseRub } from "../billing/money";
import type { user } from "../db/schema";
import type { AdminUser } from "./types";
export const userView = (account: typeof user.$inferSelect): AdminUser => ({
  activatedAt: account.activatedAt?.toISOString() ?? null,
  availableRub: formatKopecks(
    parseRub(account.balanceRub) - parseRub(account.reservedRub)
  ),
  balanceRub: account.balanceRub,
  createdAt: account.createdAt.toISOString(),
  email: account.email,
  id: account.id,
  isApproved: account.isApproved,
  isBanned: account.isBanned,
  isEnvAdmin: account.isEnvAdmin,
  lastActiveAt: account.updatedAt.toISOString(),
  name: account.name,
  permissions: account.permissions,
  reservedRub: account.reservedRub,
  role: account.role,
  totalGenerations: 0,
});
