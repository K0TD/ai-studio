import { beforeAll, describe, expect, test } from "bun:test";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { POST as authPost } from "../app/api/auth/[...all]/route";
import { AdminService, createUserSchema } from "../lib/admin/admin-service";
import { adjustBalance } from "../lib/admin/balance";
import { synchronizeAdmin } from "../lib/admin/bootstrap";
import { activateAccount, renewInvitation } from "../lib/admin/invitations";
import { auth } from "../lib/auth";
import { db, pool } from "../lib/db";
import { session, user } from "../lib/db/schema";
import { requireAdmin, requireUser } from "../lib/security/http";

const testUrl = process.env.TEST_DATABASE_URL;
if (
  testUrl &&
  (testUrl !== process.env.DATABASE_URL ||
    !new URL(testUrl).pathname.endsWith("_test"))
) {
  throw new Error(
    "Integration tests require a dedicated *_test database and matching DATABASE_URL"
  );
}
const databaseTests = testUrl ? describe : describe.skip;
const password = "isolated-admin-password-927";
let actorId: string;
let sessionCookie: string;
const nextEmail = () => `test-${crypto.randomUUID()}@example.invalid`;

databaseTests("PostgreSQL: аккаунты, права и финансовый журнал", () => {
  beforeAll(async () => {
    await synchronizeAdmin({
      email: "test-admin@example.invalid",
      login: "integration_admin",
      password,
    });
    const [actor] = await db
      .select()
      .from(user)
      .where(eq(user.isEnvAdmin, true));
    actorId = actor.id;
    const response = await auth.api.signInUsername({
      asResponse: true,
      body: { password, username: "integration_admin" },
    });
    expect(response.status).toBe(200);
    sessionCookie = response.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
  });

  test("создает настоящий аккаунт с единственным начальным начислением", async () => {
    const created = await AdminService.createUser(
      actorId,
      createUserSchema.parse({
        email: nextEmail(),
        initialBalanceRub: "1250.00",
        name: "Новый пользователь",
      })
    );
    expect(created.user.balanceRub).toBe("1250.00");
    expect(created.user.permissions.sections).toEqual([]);
    const ledger = await pool.query(
      "select count(*)::int as count, sum(amount_rub)::text as total from transactions where user_id=$1",
      [created.user.id]
    );
    expect(ledger.rows[0]).toEqual({ count: 1, total: "1250.00" });
    const token = z
      .string()
      .parse(
        new URLSearchParams(new URL(created.activationUrl).hash.slice(1)).get(
          "token"
        )
      );
    await activateAccount(token, "new-user-password-927");
    await expect(
      activateAccount(token, "new-user-password-927")
    ).rejects.toMatchObject({ status: 400 });
    const [activated] = await db
      .select()
      .from(user)
      .where(eq(user.id, created.user.id));
    expect(activated.activatedAt).not.toBeNull();
  });

  test("повтор начисления не увеличивает баланс второй раз", async () => {
    const created = await AdminService.createUser(
      actorId,
      createUserSchema.parse({ email: nextEmail(), name: "Идемпотентность" })
    );
    const adjustment = {
      actorId,
      amountRub: "100.01",
      key: crypto.randomUUID(),
      reason: "Тест начисления",
      userId: created.user.id,
    };
    await Promise.all([adjustBalance(adjustment), adjustBalance(adjustment)]);
    const [target] = await db
      .select()
      .from(user)
      .where(eq(user.id, created.user.id));
    expect(target.balanceRub).toBe("100.01");
    await expect(
      adjustBalance({ ...adjustment, amountRub: "99.00" })
    ).rejects.toMatchObject({ status: 409 });
  });

  test("два отзыва одновременно не расходуют резерв", async () => {
    const created = await AdminService.createUser(
      actorId,
      createUserSchema.parse({
        email: nextEmail(),
        initialBalanceRub: "100.00",
        name: "Резерв",
      })
    );
    await db
      .update(user)
      .set({ reservedRub: "60.00" })
      .where(eq(user.id, created.user.id));
    const operations = await Promise.allSettled(
      [1, 2].map(() =>
        adjustBalance({
          actorId,
          amountRub: "-30.00",
          key: crypto.randomUUID(),
          reason: "Отзыв",
          userId: created.user.id,
        })
      )
    );
    expect(
      operations.filter((operation) => operation.status === "fulfilled")
    ).toHaveLength(1);
    const [target] = await db
      .select()
      .from(user)
      .where(eq(user.id, created.user.id));
    expect(target.balanceRub).toBe("70.00");
    expect(target.reservedRub).toBe("60.00");
  });

  test("частичное обновление доступа сохраняет остальные поля и отзывает сессии", async () => {
    const created = await AdminService.createUser(
      actorId,
      createUserSchema.parse({
        email: nextEmail(),
        isApproved: false,
        name: "Доступ",
      })
    );
    await db.insert(session).values({
      expiresAt: new Date(Date.now() + 100_000),
      id: crypto.randomUUID(),
      token: crypto.randomUUID(),
      updatedAt: new Date(),
      userId: created.user.id,
    });
    const updated = await AdminService.updateAccess(actorId, created.user.id, {
      reason: "Проверка",
      role: "vip",
    });
    expect(updated.role).toBe("vip");
    expect(updated.isApproved).toBe(false);
    expect(updated.isBanned).toBe(false);
    expect(
      await db.select().from(session).where(eq(session.userId, created.user.id))
    ).toHaveLength(0);
  });

  test("перевыпуск ссылки отзывает предыдущую", async () => {
    const created = await AdminService.createUser(
      actorId,
      createUserSchema.parse({ email: nextEmail(), name: "Ссылка" })
    );
    const previousToken = z
      .string()
      .parse(
        new URLSearchParams(new URL(created.activationUrl).hash.slice(1)).get(
          "token"
        )
      );
    await renewInvitation(actorId, created.user.id);
    await expect(
      activateAccount(previousToken, "new-user-password-927")
    ).rejects.toMatchObject({ status: 400 });
  });

  test("нельзя понизить или заблокировать администратора из окружения", async () => {
    await expect(
      AdminService.updateAccess(actorId, actorId, {
        reason: "Проверка",
        role: "user",
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      AdminService.updateAccess(actorId, actorId, {
        isBanned: true,
        reason: "Проверка",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  test("поддельная cookie не дает сессию, настоящая проходит проверку роли", async () => {
    await expect(
      requireUser(
        new Request("http://localhost:3000", {
          headers: { Cookie: "better-auth.session_token=fake" },
        })
      )
    ).rejects.toMatchObject({ status: 401 });
    const admin = await requireAdmin(
      new Request("http://localhost:3000", {
        headers: { Cookie: sessionCookie },
      })
    );
    expect(admin.id).toBe(actorId);
  });

  test("БД запрещает редактирование журнала и отрицательный доступный остаток", async () => {
    await expect(
      pool.query("update transactions set reason='tampered' where user_id=$1", [
        actorId,
      ])
    ).resolves.toMatchObject({ rowCount: 0 });
    const created = await AdminService.createUser(
      actorId,
      createUserSchema.parse({
        email: nextEmail(),
        initialBalanceRub: "10.00",
        name: "Журнал",
      })
    );
    await expect(
      pool.query("update transactions set reason='tampered' where user_id=$1", [
        created.user.id,
      ])
    ).rejects.toMatchObject({ code: "23514" });
    await expect(
      pool.query('update "user" set balance_rub=-1 where id=$1', [
        created.user.id,
      ])
    ).rejects.toMatchObject({ code: "23514" });
  });

  test("HTTP API не дает менять env учетные данные и закрывает регистрацию", async () => {
    const { origin } = new URL(
      process.env.BETTER_AUTH_URL ?? "http://localhost:3000"
    );
    for (const [path, expected] of [
      ["sign-up/email", 403],
      ["update-user", 404],
      ["change-password", 403],
    ] as const) {
      const response = await authPost(
        new Request(`${origin}/api/auth/${path}`, {
          body: JSON.stringify({
            newPassword: "injected-password-927",
            role: "admin",
            username: "injected",
          }),
          headers: {
            "Content-Type": "application/json",
            Cookie: sessionCookie,
            Origin: origin,
          },
          method: "POST",
        })
      );
      expect(response.status).toBe(expected);
    }
    const crossOrigin = await authPost(
      new Request(`${origin}/api/auth/sign-out`, {
        body: "{}",
        headers: {
          "Content-Type": "application/json",
          Cookie: sessionCookie,
          Origin: "https://evil.invalid",
        },
        method: "POST",
      })
    );
    expect(crossOrigin.status).toBe(403);
    const [unchanged] = await db
      .select()
      .from(user)
      .where(eq(user.id, actorId));
    expect(unchanged.username).toBe("integration_admin");
  });

  test("приостановленный дополнительный администратор не меняет права и деньги", async () => {
    const id = crypto.randomUUID();
    await db.insert(user).values({
      activatedAt: new Date(),
      email: nextEmail(),
      id,
      isApproved: false,
      name: "Приостановленный администратор",
      role: "admin",
    });
    await expect(
      adjustBalance({
        actorId: id,
        amountRub: "1.00",
        key: crypto.randomUUID(),
        reason: "Недопустимое начисление",
        userId: actorId,
      })
    ).rejects.toMatchObject({ status: 403 });
    await expect(
      AdminService.updateAccess(id, id, {
        isApproved: true,
        reason: "Самоодобрение",
      })
    ).rejects.toMatchObject({ status: 403 });
  });

  test("смена env пароля сохраняет аккаунт и отзывает старую сессию", async () => {
    const outcome = await synchronizeAdmin({
      email: "test-admin@example.invalid",
      login: "integration_admin",
      password: "rotated-admin-password-927",
    });
    expect(outcome.changed).toBe(true);
    const [actor] = await db
      .select()
      .from(user)
      .where(eq(user.isEnvAdmin, true));
    expect(actor.id).toBe(actorId);
    await expect(
      requireAdmin(
        new Request("http://localhost:3000", {
          headers: { Cookie: sessionCookie },
        })
      )
    ).rejects.toMatchObject({ status: 401 });
  });
});
