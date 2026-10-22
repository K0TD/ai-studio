import { hashPassword, verifyPassword } from "better-auth/crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";

import { db } from "../db";
import { account, adminAudit, session, user } from "../db/schema";
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
export const synchronizeAdmin = (
  credentials: z.input<typeof adminCredentialsSchema>
) => {
  const validated = adminCredentialsSchema.safeParse(credentials);
  if (!validated.success) {
    throw new Error("Проверьте ADMIN_LOGIN, ADMIN_PASSWORD и ADMIN_EMAIL");
  }
  const settings = validated.data;
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(71442103)`);
    const [existing] = await tx
      .select()
      .from(user)
      .where(eq(user.isEnvAdmin, true))
      .for("update");
    const id = existing?.id ?? crypto.randomUUID();
    const [credential] = await tx
      .select()
      .from(account)
      .where(and(eq(account.userId, id), eq(account.providerId, "credential")));
    const passwordMatches = credential?.password
      ? await verifyPassword({
          hash: credential.password,
          password: settings.password,
        })
      : false;
    const changed =
      !existing ||
      !passwordMatches ||
      existing.username !== settings.login ||
      existing.email !== settings.email;
    if (!changed) {
      return { changed: false };
    }
    await tx
      .insert(user)
      .values({
        activatedAt: new Date(),
        displayUsername: settings.login,
        email: settings.email,
        id,
        isEnvAdmin: true,
        name: "Администратор",
        role: "admin",
        username: settings.login,
      })
      .onConflictDoUpdate({
        set: {
          displayUsername: settings.login,
          email: settings.email,
          updatedAt: new Date(),
          username: settings.login,
        },
        target: user.id,
      });
    if (!passwordMatches) {
      const passwordHash = await hashPassword(settings.password);
      await tx
        .insert(account)
        .values({
          accountId: id,
          id: credential?.id ?? crypto.randomUUID(),
          password: passwordHash,
          providerId: "credential",
          updatedAt: new Date(),
          userId: id,
        })
        .onConflictDoUpdate({
          set: { password: passwordHash, updatedAt: new Date() },
          target: account.id,
        });
    }
    await tx.delete(session).where(eq(session.userId, id));
    await tx.insert(adminAudit).values({
      action: existing ? "admin.environment_sync" : "admin.bootstrap",
      actorId: id,
      details: { sessionsRevoked: true },
      id: crypto.randomUUID(),
      targetId: id,
    });
    return { changed: true };
  });
};
