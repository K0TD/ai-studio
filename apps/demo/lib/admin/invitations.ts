import { createHash, randomBytes } from "node:crypto";

import { hashPassword } from "better-auth/crypto";
import { and, eq, gt } from "drizzle-orm";

import { db, isPostgres } from "../db";
import {
  account,
  adminAudit,
  invitation,
  session,
  user,
} from "../db/active-schema";
import type { DatabaseTransaction } from "../db/transaction";
import { ApiError } from "../security/errors";
import { lockAdminUsers } from "./authorization";
export const tokenDigest = (token: string) =>
  createHash("sha256").update(token).digest("hex");
export const createInvitation = async (
  tx: DatabaseTransaction,
  userId: string
): Promise<string> => {
  const token = randomBytes(32).toString("base64url");
  await tx.delete(invitation).where(eq(invitation.userId, userId));
  await tx.insert(invitation).values({
    expiresAt: new Date(Date.now() + 86_400_000),
    id: crypto.randomUUID(),
    tokenHash: tokenDigest(token),
    userId,
  });
  return `${process.env.BETTER_AUTH_URL ?? "http://localhost:3000"}/activate#token=${token}`;
};
export const renewInvitation = (
  actorId: string,
  userId: string
): Promise<string> =>
  db.transaction(async (tx: DatabaseTransaction) => {
    const target = await lockAdminUsers(tx, actorId, userId);
    if (target.isEnvAdmin || target.isBanned) {
      throw new ApiError(403, "Для этого аккаунта ссылка недоступна");
    }
    const activationUrl = await createInvitation(tx, userId);
    await tx.delete(session).where(eq(session.userId, userId));
    await tx.insert(adminAudit).values({
      action: "invitation.renew",
      actorId,
      id: crypto.randomUUID(),
      targetId: userId,
    });
    return activationUrl;
  });
export const activateAccount = async (
  token: string,
  password: string
): Promise<void> => {
  const tokenHash = tokenDigest(token);
  const [candidate] = await db
    .select()
    .from(invitation)
    .where(
      and(
        eq(invitation.tokenHash, tokenHash),
        gt(invitation.expiresAt, new Date())
      )
    );
  if (!candidate) {
    throw new ApiError(400, "Ссылка недействительна или истекла");
  }
  const passwordHash = await hashPassword(password);
  await db.transaction(async (tx: DatabaseTransaction) => {
    const targetQuery = tx
      .select()
      .from(user)
      .where(eq(user.id, candidate.userId));
    const [target] = isPostgres
      ? await targetQuery.for("update")
      : await targetQuery;

    const validQuery = tx
      .select()
      .from(invitation)
      .where(
        and(
          eq(invitation.tokenHash, tokenHash),
          gt(invitation.expiresAt, new Date())
        )
      );
    const [valid] = isPostgres
      ? await validQuery.for("update")
      : await validQuery;
    if (!valid || !target || target.isBanned || target.isEnvAdmin) {
      throw new ApiError(400, "Ссылка недействительна или истекла");
    }
    const credentials = await tx
      .select()
      .from(account)
      .where(
        and(eq(account.userId, target.id), eq(account.providerId, "credential"))
      );
    await tx
      .insert(account)
      .values({
        accountId: target.id,
        id: credentials[0]?.id ?? crypto.randomUUID(),
        password: passwordHash,
        providerId: "credential",
        updatedAt: new Date(),
        userId: target.id,
      })
      .onConflictDoUpdate({
        set: { password: passwordHash, updatedAt: new Date() },
        target: account.id,
      });
    await tx
      .update(user)
      .set({
        activatedAt: target.activatedAt ?? new Date(),
        updatedAt: new Date(),
      })
      .where(eq(user.id, target.id));
    await tx.delete(session).where(eq(session.userId, target.id));
    await tx.delete(invitation).where(eq(invitation.id, valid.id));
    await tx.insert(adminAudit).values({
      action: "account.password_set",
      id: crypto.randomUUID(),
      targetId: target.id,
    });
  });
};
