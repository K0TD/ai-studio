import { formatKopecks, parseRub } from "../billing/money";
import { toIsoDate } from "../db/date";
import type { user } from "../db/schema";
import type { AdminUser } from "./types";

export const userView = (account: typeof user.$inferSelect): AdminUser => {
  const balanceKopecks = parseRub(String(account.balanceRub ?? "0.00"));
  const reservedKopecks = parseRub(String(account.reservedRub ?? "0.00"));
  return {
    activatedAt: account.activatedAt ? toIsoDate(account.activatedAt) : null,
    availableRub: formatKopecks(balanceKopecks - reservedKopecks),
    balanceRub: formatKopecks(balanceKopecks),
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
    reservedRub: formatKopecks(reservedKopecks),
    role: account.role,
    totalGenerations: 0,
  };
};
