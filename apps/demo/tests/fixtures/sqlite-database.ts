import { Database } from "bun:sqlite";
import assert from "node:assert/strict";

import { eq } from "drizzle-orm";

import { AdminService } from "../../lib/admin/admin-service";
import { adjustBalance } from "../../lib/admin/balance";
import { synchronizeAdmin } from "../../lib/admin/bootstrap";
import { activateAccount, renewInvitation } from "../../lib/admin/invitations";
import { auth } from "../../lib/auth";
import { db, getDb, pool, sumRubSql } from "../../lib/db";
import { session, user } from "../../lib/db/active-schema";
import { ensureDatabase, waitForDatabase } from "../../lib/db/auto-migrate";
import { toIsoDate } from "../../lib/db/date";
import { migrateSchema, SCHEMA_VERSION } from "../../lib/db/migrations";
import { SQLITE_INIT_DDL } from "../../lib/db/schema-ddl";
import { user as sqliteUser } from "../../lib/db/sqlite-schema";

const [scenario] = process.argv.slice(2);
const password = "sqlite-test-password-429!";
const credentials = {
  email: "sqlite-admin@example.invalid",
  login: "sqlite_admin",
  password,
};
const singleRow = async (sql: string, params: unknown[] = []) => {
  const { rows } = await pool.query(sql, params);
  const [row] = rows;
  assert.ok(row, `Expected a row for ${sql}`);
  return row;
};
const assertBalance = async (userId: string, expected: string) => {
  const [account] = await db.select().from(user).where(eq(user.id, userId));
  assert.ok(account);
  assert.equal(account.balanceRub, expected);
};
const assertLegacyChildren = async () => {
  const account = await singleRow(
    "SELECT * FROM account WHERE user_id='legacy'"
  );
  assert.equal(account.password, "preserved-password-hash");
  const legacySession = await singleRow(
    "SELECT * FROM session WHERE user_id='legacy'"
  );
  assert.equal(legacySession.token, "preserved-session-token");
  const invitation = await singleRow(
    "SELECT * FROM invitation WHERE user_id='legacy'"
  );
  assert.equal(invitation.token_hash, "preserved-invitation-hash");
  const foreignKeys = await singleRow("PRAGMA foreign_keys");
  assert.equal(foreignKeys.foreign_keys, 1);
  const violations = await pool.query("PRAGMA foreign_key_check");
  assert.equal(violations.rowCount, 0);
};

if (scenario === "legacy" || scenario === "invalid") {
  const sqlitePath = process.env.SQLITE_PATH;
  assert.ok(sqlitePath);
  const old = new Database(sqlitePath);
  const ddl = SQLITE_INIT_DDL.replaceAll(
    /("(?:created_at|updated_at|expires_at|deleted_at|submitted_at|settled_at|leased_until|poll_at|verified_at)" )INTEGER/gu,
    "$1TEXT"
  ).replaceAll("(unixepoch())", "(datetime('now'))");
  old.exec(ddl);
  old.run("PRAGMA foreign_keys=ON");
  old
    .query(
      'INSERT INTO "user" (id,name,email,balance_rub,reserved_rub) VALUES (?,?,?,?,?)'
    )
    .run("legacy", "Существующий", "legacy@example.invalid", "19.23", "0.00");
  old
    .query(
      "INSERT INTO account (id,user_id,account_id,provider_id,password) VALUES (?,?,?,?,?)"
    )
    .run(
      "legacy-account",
      "legacy",
      "legacy",
      "credential",
      "preserved-password-hash"
    );
  old
    .query("INSERT INTO session (id,user_id,token,expires_at) VALUES (?,?,?,?)")
    .run(
      "legacy-session",
      "legacy",
      "preserved-session-token",
      "2099-01-02 03:04:05"
    );
  old
    .query(
      "INSERT INTO invitation (id,user_id,token_hash,expires_at) VALUES (?,?,?,?)"
    )
    .run(
      "legacy-invitation",
      "legacy",
      "preserved-invitation-hash",
      "2099-01-02 03:04:05"
    );
  old
    .query(
      "INSERT INTO syntx_chats (id,user_id,title,tab,created_at) VALUES (?,?,?,?,?)"
    )
    .run(
      "legacy-chat",
      "legacy",
      "История",
      "image",
      scenario === "invalid" ? "not-a-date" : "2026-01-02 03:04:05"
    );
  old.close();
}

if (scenario === "invalid") {
  await assert.rejects(migrateSchema(), /Invalid existing date/u);
  const chat = await singleRow("SELECT id,title,created_at FROM syntx_chats");
  assert.equal(chat.created_at, "not-a-date");
  const account = await singleRow('SELECT balance_rub FROM "user"');
  assert.equal(account.balance_rub, "19.23");
  const migrations = await pool.query(
    "SELECT 1 FROM sqlite_master WHERE name='studio_schema_migrations'"
  );
  assert.equal(migrations.rowCount, 0);
  await assertLegacyChildren();
} else {
  await ensureDatabase();
  await waitForDatabase(100);
  const version = await singleRow(
    "SELECT max(version) AS version FROM studio_schema_migrations"
  );
  assert.equal(version.version, SCHEMA_VERSION);
  const runtimeDb = getDb();
  assert.ok("run" in runtimeDb);
  const missing = await runtimeDb
    .select()
    .from(sqliteUser)
    .where(eq(sqliteUser.id, "missing-user"))
    .get();
  assert.equal(missing, undefined);
  if (scenario === "legacy") {
    const chat = await singleRow(
      "SELECT * FROM syntx_chats WHERE id='legacy-chat'"
    );
    assert.equal(toIsoDate(chat.created_at), "2026-01-02T03:04:05.000Z");
    assert.equal(Number.isInteger(chat.created_at), true);
    const account = await singleRow(
      "SELECT balance_rub FROM \"user\" WHERE id='legacy'"
    );
    assert.equal(account.balance_rub, "19.23");
    await assertLegacyChildren();
    const legacySession = await singleRow(
      "SELECT created_at,expires_at FROM session WHERE user_id='legacy'"
    );
    assert.equal(Number.isInteger(legacySession.created_at), true);
    assert.equal(
      toIsoDate(legacySession.expires_at),
      "2099-01-02T03:04:05.000Z"
    );
  }
  await synchronizeAdmin(credentials);
  const [admin] = await db.select().from(user).where(eq(user.isEnvAdmin, true));
  assert.ok(admin);
  assert.equal(admin.balanceRub, "10000.00");
  const initialCredits = await singleRow(
    "SELECT count(*) AS count FROM transactions WHERE user_id=$1",
    [admin.id]
  );
  assert.equal(initialCredits.count, 1);

  if (scenario === "rollback") {
    await assert.rejects(
      db.transaction(async (tx) => {
        await tx
          .update(user)
          .set({ balanceRub: "9999.00" })
          .where(eq(user.id, admin.id));
        await Promise.resolve();
        throw new Error("rollback after await");
      }),
      /rollback after await/u
    );
    await assertBalance(admin.id, "10000.00");
    // A raw transaction cannot commit another request's ORM write.
    const client = await pool.connect();
    await client.query("BEGIN");
    await client.query('UPDATE "user" SET balance_rub=$2 WHERE id=$1', [
      admin.id,
      "9000.00",
    ]);
    let completed = false;
    const concurrent = (async () => {
      const rows = await db.select().from(user).where(eq(user.id, admin.id));
      completed = true;
      return rows;
    })();
    await Bun.sleep(10);
    assert.equal(completed, false);
    await client.query("ROLLBACK");
    client.release();
    const [afterRollback] = await concurrent;
    assert.equal(afterRollback.balanceRub, "10000.00");
    const abandoned = await pool.connect();
    await abandoned.query("BEGIN");
    await abandoned.query('UPDATE "user" SET balance_rub=$2 WHERE id=$1', [
      admin.id,
      "8000.00",
    ]);
    abandoned.release();
    await assertBalance(admin.id, "10000.00");
  }

  const created = await AdminService.createUser(admin.id, {
    email: "member@example.invalid",
    initialBalanceRub: "100.00",
    isApproved: true,
    name: "Member %_\\ literal",
    role: "user",
  });
  const targetId = created.user.id;
  if (scenario === "concurrent") {
    const adjustment = {
      actorId: admin.id,
      amountRub: "0.01",
      key: crypto.randomUUID(),
      reason: "concurrent credit",
      userId: targetId,
    };
    await Promise.all([adjustBalance(adjustment), adjustBalance(adjustment)]);
    await db
      .update(user)
      .set({ reservedRub: "60.00" })
      .where(eq(user.id, targetId));
    const outcomes = await Promise.allSettled(
      [1, 2].map(() =>
        adjustBalance({
          ...adjustment,
          amountRub: "-30.00",
          key: crypto.randomUUID(),
        })
      )
    );
    assert.equal(
      outcomes.filter((outcome) => outcome.status === "fulfilled").length,
      1
    );
    const [target] = await db.select().from(user).where(eq(user.id, targetId));
    assert.equal(target.balanceRub, "70.01");
    assert.equal(target.reservedRub, "60.00");
  }
  const search = await AdminService.getUsers({ limit: 10, page: 1, q: "%_\\" });
  assert.equal(search.users.length, 1);
  assert.equal(search.users[0].id, targetId);
  const token = new URLSearchParams(
    new URL(created.activationUrl).hash.slice(1)
  ).get("token");
  assert.ok(token);
  // Maintenance must preserve a future INTEGER invitation while deleting expired rows.
  await pool.query("DELETE FROM invitation WHERE expires_at<now()");
  const invitations = await pool.query(
    "SELECT id FROM invitation WHERE user_id=$1",
    [targetId]
  );
  assert.equal(invitations.rowCount, 1);
  await activateAccount(token, password);
  await assert.rejects(activateAccount(token, password), /Ссылка/u);
  const signIn = await auth.api.signInEmail({
    asResponse: true,
    body: { email: "member@example.invalid", password },
  });
  assert.equal(signIn.status, 200);
  const sessionsBeforeRenewal = await db
    .select()
    .from(session)
    .where(eq(session.userId, targetId));
  assert.ok(sessionsBeforeRenewal.length);
  await renewInvitation(admin.id, targetId);
  const sessionsAfterRenewal = await db
    .select()
    .from(session)
    .where(eq(session.userId, targetId));
  assert.equal(sessionsAfterRenewal.length, 0);
  // Zero is a real balance, never a signal to grant a new initial credit.
  await db
    .update(user)
    .set({ balanceRub: "0.00" })
    .where(eq(user.id, admin.id));
  await synchronizeAdmin(credentials);
  await ensureDatabase();
  await assertBalance(admin.id, "0.00");
  await assert.rejects(
    pool.query("UPDATE \"user\" SET balance_rub='-1.00' WHERE id=$1", [
      admin.id,
    ])
  );
  await assert.rejects(
    pool.query("DELETE FROM transactions WHERE user_id=$1", [admin.id])
  );
  const total = await singleRow(
    `SELECT ${sumRubSql("amount_rub")} AS total FROM transactions WHERE user_id=$1`,
    [targetId]
  );
  assert.equal(total.total, scenario === "concurrent" ? "70.01" : "100.00");
  // Reopen as a new runtime and run startup migrations again.
  await pool.end();
  await ensureDatabase();
  const accountAfterRestart = await singleRow(
    'SELECT balance_rub FROM "user" WHERE id=$1',
    [admin.id]
  );
  assert.equal(accountAfterRestart.balance_rub, "0.00");
  const memberAfterRestart = await pool.query(
    'SELECT id FROM "user" WHERE id=$1',
    [targetId]
  );
  assert.equal(memberAfterRestart.rowCount, 1);
  const integrity = await singleRow("PRAGMA integrity_check");
  assert.equal(integrity.integrity_check, "ok");
}
await pool.end();
