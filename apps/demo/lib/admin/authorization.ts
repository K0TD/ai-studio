import { eq, inArray } from "drizzle-orm";

import { user } from "../db/schema";
import type { DatabaseTransaction } from "../db/transaction";
import { ApiError } from "../security/errors";
export const lockAdminUsers = async (
  tx: DatabaseTransaction,
  actorId: string,
  targetId: string
) => {
  const accounts = await tx
    .select()
    .from(user)
    .where(inArray(user.id, [actorId, targetId]))
    .orderBy(user.id)
    .for("update");
  const actor = accounts.find((account) => account.id === actorId);
  if (
    !actor ||
    actor.role !== "admin" ||
    !actor.isApproved ||
    actor.isBanned ||
    !actor.activatedAt
  ) {
    throw new ApiError(403, "Требуются права администратора");
  }
  const target = accounts.find((account) => account.id === targetId);
  if (!target) {
    throw new ApiError(404, "Пользователь не найден");
  }
  return target;
};
export const lockAdmin = async (tx: DatabaseTransaction, actorId: string) => {
  const [actor] = await tx
    .select()
    .from(user)
    .where(eq(user.id, actorId))
    .for("update");
  if (
    !actor ||
    actor.role !== "admin" ||
    !actor.isApproved ||
    actor.isBanned ||
    !actor.activatedAt
  ) {
    throw new ApiError(403, "Требуются права администратора");
  }
  return actor;
};
