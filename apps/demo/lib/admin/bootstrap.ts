import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { formatKopecks, parseRub } from "../billing/money";
import { db, isPostgres } from "../db";
import * as s from "../db/active-schema";
import { DEFAULT_ADMIN_PERMISSIONS } from "../security/permissions";

const adminCredentialsSchema = z.strictObject({
  email: z.email().max(254),
  login: z
    .string()
    .trim()
    .min(3)
    .max(64)
    .regex(/^[a-zA-Z0-9_.]+$/u)
    .transform((login) => login.toLowerCase()),
  password: z.string().min(12).max(128),
});

export const synchronizeAdmin = async (
  credentials: z.input<typeof adminCredentialsSchema>
) => {
  const validated = adminCredentialsSchema.safeParse(credentials);
  if (!validated.success) {
    throw new Error("Проверьте ADMIN_LOGIN, ADMIN_PASSWORD и ADMIN_EMAIL");
  }
  const settings = validated.data;

  return await db.transaction(async (tx) => {
    if (isPostgres) {
      await tx.execute(sql`select pg_advisory_xact_lock(71442103)`);
    }

    const query = tx.select().from(s.user).where(eq(s.user.isEnvAdmin, true));

    const [existing] = isPostgres ? await query.for("update") : await query;

    const id = existing?.id ?? crypto.randomUUID();
    const [credential] = await tx
      .select()
      .from(s.account)
      .where(
        and(eq(s.account.userId, id), eq(s.account.providerId, "credential"))
      );

    const passwordMatches = credential?.password
      ? await verifyPassword({
          hash: credential.password,
          password: settings.password,
        })
      : false;

    const initialBalance = existing
      ? formatKopecks(parseRub(String(existing.balanceRub)))
      : "10000.00";

    const changed =
      !existing ||
      !passwordMatches ||
      existing.username !== settings.login ||
      existing.email !== settings.email;

    if (!changed) {
      return { changed: false };
    }

    const now = new Date();
    await tx
      .insert(s.user)
      .values({
        activatedAt: now,
        balanceRub: initialBalance,
        displayUsername: settings.login,
        email: settings.email,
        id,
        isApproved: true,
        isBanned: false,
        isEnvAdmin: true,
        name: "Администратор",
        permissions: DEFAULT_ADMIN_PERMISSIONS,
        role: "admin",
        username: settings.login,
      })
      .onConflictDoUpdate({
        set: {
          activatedAt: isPostgres
            ? sql`coalesce(${s.user.activatedAt}, now())`
            : (existing?.activatedAt ?? now),
          balanceRub: initialBalance,
          displayUsername: settings.login,
          email: settings.email,
          isApproved: true,
          isBanned: false,
          permissions: DEFAULT_ADMIN_PERMISSIONS,
          role: "admin",
          updatedAt: now,
          username: settings.login,
        },
        target: s.user.id,
      });

    if (!existing) {
      await tx.insert(s.transactions).values({
        actorId: id,
        amountRub: initialBalance,
        balanceAfterRub: initialBalance,
        balanceBeforeRub: "0.00",
        id: crypto.randomUUID(),
        idempotencyKey: `initial:${id}`,
        reason: "Начальный баланс администратора",
        type: "topup",
        userId: id,
      });
    }

    if (!passwordMatches) {
      const passwordHash = await hashPassword(settings.password);
      await tx
        .insert(s.account)
        .values({
          accountId: id,
          id: credential?.id ?? crypto.randomUUID(),
          password: passwordHash,
          providerId: "credential",
          updatedAt: now,
          userId: id,
        })
        .onConflictDoUpdate({
          set: { password: passwordHash, updatedAt: now },
          target: s.account.id,
        });

      // Only revoke sessions if password changed!
      await tx.delete(s.session).where(eq(s.session.userId, id));
    }

    await tx.insert(s.adminAudit).values({
      action: existing ? "admin.environment_sync" : "admin.bootstrap",
      actorId: id,
      details: {
        permissionsUpdated: true,
        sessionsRevoked: !passwordMatches,
      },
      id: crypto.randomUUID(),
      targetId: id,
    });

    return { changed: true };
  });
};
