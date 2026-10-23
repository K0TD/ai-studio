import { eq } from "drizzle-orm";

import { formatKopecks, parseRub } from "../billing/money";
import { db } from "../db";
import { adminAudit, transactions, user } from "../db/active-schema";
import type { DatabaseTransaction } from "../db/transaction";
import { ApiError } from "../security/errors";
import { lockAdminUsers } from "./authorization";
import { userView } from "./user-view";
interface BalanceAdjustment {
  actorId: string;
  userId: string;
  amountRub: string;
  reason: string;
  key: string;
}
export const adjustBalance = (adjustment: BalanceAdjustment) =>
  db.transaction(async (tx: DatabaseTransaction) => {
    const target = await lockAdminUsers(
      tx,
      adjustment.actorId,
      adjustment.userId
    );
    const operationKey = `admin:${adjustment.actorId}:${adjustment.key}`;
    const [previous] = await tx
      .select()
      .from(transactions)
      .where(eq(transactions.idempotencyKey, operationKey));
    if (previous) {
      if (
        previous.userId !== target.id ||
        previous.amountRub !== adjustment.amountRub ||
        previous.reason !== adjustment.reason
      ) {
        throw new ApiError(
          409,
          "Ключ операции уже использован для другого запроса"
        );
      }
      return { transaction: previous, user: userView(target) };
    }
    const delta = parseRub(adjustment.amountRub);
    const next = parseRub(target.balanceRub) + delta;
    if (delta === 0n) {
      throw new ApiError(400, "Сумма должна отличаться от нуля");
    }
    if (delta < 0n && next < parseRub(target.reservedRub)) {
      throw new ApiError(409, "Можно отозвать только доступный остаток");
    }
    const nextRub = formatKopecks(next);
    try {
      parseRub(nextRub);
    } catch {
      throw new ApiError(400, "Баланс превышает допустимый предел");
    }
    const [updated] = await tx
      .update(user)
      .set({ balanceRub: nextRub, updatedAt: new Date() })
      .where(eq(user.id, target.id))
      .returning();
    const [transaction] = await tx
      .insert(transactions)
      .values({
        actorId: adjustment.actorId,
        amountRub: adjustment.amountRub,
        balanceAfterRub: nextRub,
        balanceBeforeRub: target.balanceRub,
        id: crypto.randomUUID(),
        idempotencyKey: operationKey,
        reason: adjustment.reason || "Корректировка администратором",
        type: delta > 0n ? "topup" : "admin_debit",
        userId: target.id,
      })
      .returning();
    await tx.insert(adminAudit).values({
      action: "balance.adjust",
      actorId: adjustment.actorId,
      details: {
        amountRub: adjustment.amountRub,
        reason: adjustment.reason || "Корректировка администратором",
        transactionId: transaction.id,
      },
      id: crypto.randomUUID(),
      targetId: target.id,
    });
    return { transaction, user: userView(updated) };
  });
