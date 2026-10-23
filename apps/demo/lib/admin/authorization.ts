import { eq, inArray } from "drizzle-orm";

import { isPostgres } from "../db";
import * as s from "../db/active-schema";
import type { DatabaseTransaction } from "../db/transaction";
import { ApiError } from "../security/errors";

export const lockAdminUsers = async (
  tx: DatabaseTransaction,
  actorId: string,
  targetId: string
) => {
  const query = tx
    .select()
    .from(s.user)
    .where(inArray(s.user.id, [actorId, targetId]))
    .orderBy(s.user.id);

  const accounts = isPostgres ? await query.for("update") : await query;

  const actor = accounts.find((account) => account.id === actorId);
  if (
    !actor ||
    actor.role !== "admin" ||
    !actor.isApproved ||
    actor.isBanned ||
    (!actor.activatedAt && !actor.isEnvAdmin)
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
  const query = tx.select().from(s.user).where(eq(s.user.id, actorId));
  const [actor] = isPostgres ? await query.for("update") : await query;

  if (
    !actor ||
    actor.role !== "admin" ||
    !actor.isApproved ||
    actor.isBanned ||
    (!actor.activatedAt && !actor.isEnvAdmin)
  ) {
    throw new ApiError(403, "Требуются права администратора");
  }
  return actor;
};
