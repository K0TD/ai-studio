import { count, desc, eq, ilike, or, sql } from "drizzle-orm";
import { z } from "zod";

import { db, pool } from "../db";
import { adminAudit, session, transactions, user } from "../db/active-schema";
import { toIsoDate } from "../db/date";
import type { DatabaseTransaction } from "../db/transaction";
import { ApiError } from "../security/errors";
import {
  CLOSED_PERMISSIONS,
  DEFAULT_ADMIN_PERMISSIONS,
  DEFAULT_USER_PERMISSIONS,
  DEFAULT_VIP_PERMISSIONS,
  permissionsSchema,
  roleSchema,
  rubSchema,
} from "../security/permissions";
import { lockAdmin, lockAdminUsers } from "./authorization";
import { createInvitation } from "./invitations";
import type { SystemStats } from "./types";
import { userView } from "./user-view";
export const createUserSchema = z.strictObject({
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  initialBalanceRub: rubSchema.default("0.00"),
  isApproved: z.boolean().default(true),
  name: z.string().trim().min(1).max(120),
  permissions: permissionsSchema.optional(),
  role: roleSchema.default("user"),
});
export const updateAccessSchema = z
  .strictObject({
    isApproved: z.boolean().optional(),
    isBanned: z.boolean().optional(),
    permissions: permissionsSchema.optional(),
    reason: z.string().trim().max(500).optional().default(""),
    role: roleSchema.optional(),
  })
  .refine((change) => Object.keys(change).some((key) => key !== "reason"));
export const AdminService = {
  async createUser(actorId: string, params: z.infer<typeof createUserSchema>) {
    try {
      return await db.transaction(async (tx: DatabaseTransaction) => {
        await lockAdmin(tx, actorId);
        const id = crypto.randomUUID();
        const effectivePermissions =
          params.permissions ??
          (params.role === "admin"
            ? DEFAULT_ADMIN_PERMISSIONS
            : params.role === "vip"
            ? DEFAULT_VIP_PERMISSIONS
            : DEFAULT_USER_PERMISSIONS);
        const [created] = await tx
          .insert(user)
          .values({
            balanceRub: params.initialBalanceRub,
            email: params.email,
            id,
            isApproved: params.isApproved,
            name: params.name,
            permissions: effectivePermissions,
            role: params.role,
          })
          .returning();
        if (params.initialBalanceRub !== "0.00") {
          await tx.insert(transactions).values({
            actorId,
            amountRub: params.initialBalanceRub,
            balanceAfterRub: params.initialBalanceRub,
            balanceBeforeRub: "0.00",
            id: crypto.randomUUID(),
            idempotencyKey: `initial:${id}`,
            reason: "Начальный баланс при создании аккаунта",
            type: "topup",
            userId: id,
          });
        }
        const activationUrl = await createInvitation(tx, id);
        await tx.insert(adminAudit).values({
          action: "user.create",
          actorId,
          details: { permissions: params.permissions, role: params.role },
          id: crypto.randomUUID(),
          targetId: id,
        });
        return { activationUrl, user: userView(created) };
      });
    } catch (error) {
      const duplicate = z
        .object({ cause: z.object({ code: z.literal("23505") }) })
        .safeParse(error);
      const isSqliteDuplicate =
        error instanceof Error &&
        (error.message.includes("UNIQUE constraint failed") ||
          (error as any).code === "SQLITE_CONSTRAINT_UNIQUE");
      if (duplicate.success || isSqliteDuplicate) {
        throw new ApiError(409, "Учетная запись уже существует");
      }
      throw error;
    }
  },
  async getAudit(query: { page: number; limit: number }) {
    const events = await db
      .select()
      .from(adminAudit)
      .orderBy(desc(adminAudit.createdAt), adminAudit.id)
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);
    const [aggregate] = await db.select({ total: count() }).from(adminAudit);
    return {
      events: events.map((e: any) => ({
        ...e,
        createdAt: toIsoDate(e.createdAt),
      })),
      limit: query.limit,
      page: query.page,
      total: aggregate.total,
    };
  },
  async getStats(): Promise<SystemStats> {
    const totals = await pool.query<SystemStats>(`select
      (select cast(count(*) as integer) from "user") as "totalUsers",
      (select cast(coalesce(sum(balance_rub),0) as text) from "user") as "totalBalanceRub",
      (select cast(coalesce(-sum(amount_rub),0) as text) from transactions where type='generation_cost'
        and created_at >= date_trunc('day', now() at time zone 'Europe/Moscow') at time zone 'Europe/Moscow') as "totalSpentTodayRub",
      (select cast(count(*) as integer) from syntx_jobs where settled_at is null) as "activeGenerations",
      (select cast(count(*) as integer) from syntx_catalog) as "supportedModelsCount",
      case when exists(select 1 from syntx_catalog where verified_at > now()-interval '24 hours') then 'operational' else 'down' end as "routerAiStatus"`);
    return totals.rows[0];
  },
  async getTransactions(query: {
    userId?: string;
    page: number;
    limit: number;
  }) {
    const filter = query.userId
      ? eq(transactions.userId, query.userId)
      : undefined;
    const rows = await db
      .select({ transaction: transactions, userName: user.name })
      .from(transactions)
      .innerJoin(user, eq(user.id, transactions.userId))
      .where(filter)
      .orderBy(desc(transactions.createdAt), transactions.id)
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);
    const [aggregate] = await db
      .select({ total: count() })
      .from(transactions)
      .where(filter);
    return {
      limit: query.limit,
      page: query.page,
      total: aggregate.total,
      transactions: rows.map((row: any) => ({
        ...row.transaction,
        createdAt: toIsoDate(row.transaction.createdAt),
        userName: row.userName,
      })),
    };
  },
  async getUsers(query: { q: string; page: number; limit: number }) {
    const needle = query.q.replaceAll(
      /[\\%_]/gu,
      (character) => `\\${character}`
    );
    const filter = needle
      ? or(
          ilike(user.name, `%${needle}%`),
          ilike(user.email, `%${needle}%`),
          ilike(user.id, `%${needle}%`)
        )
      : undefined;
    const rows = await db
      .select({
        account: user,
        totalGenerations: sql<number>`(select count(*) from syntx_jobs where user_id = ${user.id})`,
      })
      .from(user)
      .where(filter)
      .orderBy(desc(user.createdAt), user.id)
      .limit(query.limit)
      .offset((query.page - 1) * query.limit);
    const [aggregate] = await db
      .select({ total: count() })
      .from(user)
      .where(filter);
    return {
      limit: query.limit,
      page: query.page,
      stats: await this.getStats(),
      total: aggregate.total,
      users: rows.map((row: any) => ({
        ...userView(row.account),
        totalGenerations: row.totalGenerations,
      })),
    };
  },
  updateAccess(
    actorId: string,
    targetId: string,
    change: z.infer<typeof updateAccessSchema>
  ) {
    return db.transaction(async (tx: DatabaseTransaction) => {
      const target = await lockAdminUsers(tx, actorId, targetId);
      if (
        target.isEnvAdmin &&
        ((change.role && change.role !== "admin") ||
          change.isBanned ||
          change.isApproved === false)
      ) {
        throw new ApiError(
          403,
          "Основной администратор управляется через окружение"
        );
      }
      const { reason, ...updates } = change;
      const [updated] = await tx
        .update(user)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(user.id, targetId))
        .returning();
      await tx.delete(session).where(eq(session.userId, targetId));
      await tx.insert(adminAudit).values({
        action: "user.access",
        actorId,
        details: {
          after: updates,
          before: {
            isApproved: target.isApproved,
            isBanned: target.isBanned,
            permissions: target.permissions,
            role: target.role,
          },
          reason: reason || "Изменение параметров доступа",
        },
        id: crypto.randomUUID(),
        targetId,
      });
      return userView(updated);
    });
  },
};
