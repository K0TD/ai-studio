import { formatKopecks, parseRub } from "../billing/money";
import { toIsoDate } from "../db/date";
import type { user } from "../db/schema";
import type { AdminUser } from "./types";

export const userView = (account: typeof user.$inferSelect): AdminUser => {
  const balanceKopecks = parseRub(String(account.balanceRub ?? "0.00"));
  const reservedKopecks = parseRub(String(account.reservedRub ?? "0.00"));
  const availableKopecks = balanceKopecks - reservedKopecks;
  return {
    activatedAt: account.activatedAt ? toIsoDate(account.activatedAt) : null,
    availableRub: formatKopecks(availableKopecks),
    balanceRub: formatKopecks(balanceKopecks),
    createdAt: toIsoDate(account.createdAt),
    email: account.email,
    id: account.id,
    isApproved: Boolean(account.isApproved),
    isBanned: Boolean(account.isBanned),
    isEnvAdmin: Boolean(account.isEnvAdmin),
    lastActiveAt: toIsoDate(account.updatedAt),
    name: account.name,
    permissions: account.permissions,
    reservedRub: formatKopecks(reservedKopecks),
    role: account.role,
    totalGenerations: 0,
  };
};
