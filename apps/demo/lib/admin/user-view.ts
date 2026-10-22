import { formatKopecks, parseRub } from "../billing/money";
import { toIsoDate } from "../db/date";
import type { user } from "../db/schema";
import type { AdminUser } from "./types";

export const userView = (account: typeof user.$inferSelect): AdminUser => ({
  activatedAt: account.activatedAt ? toIsoDate(account.activatedAt) : null,
  availableRub: formatKopecks(
    parseRub(account.balanceRub) - parseRub(account.reservedRub)
  ),
  balanceRub: account.balanceRub,
  createdAt: toIsoDate(account.createdAt),
  email: account.email,
  id: account.id,
  isApproved: Boolean(account.isApproved),
  isBanned: Boolean(account.isBanned),
  isEnvAdmin: Boolean(account.isEnvAdmin),
  lastActiveAt: toIsoDate(account.updatedAt),
  name: account.name,
  permissions:
    typeof account.permissions === "string"
      ? JSON.parse(account.permissions)
      : account.permissions,
  reservedRub: account.reservedRub,
  role: account.role,
  totalGenerations: 0,
});
