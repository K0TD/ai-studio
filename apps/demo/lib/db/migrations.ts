import { formatKopecks, parseRub } from "../billing/money";
import { isPostgres, pool } from "./index";
import { POSTGRES_INTEGRITY_DDL } from "./postgres-integrity";
import { POSTGRES_INIT_DDL, SQLITE_INIT_DDL } from "./schema-ddl";
import { sqliteIntegrity } from "./sqlite-integrity";

type Client = Awaited<ReturnType<typeof pool.connect>>;
interface TableColumn {
  name: string;
  type: string;
}
const statements = (ddl: string) =>
  ddl
    .split(";")
    .map((sql) => sql.trim())
    .filter(Boolean);
const tableDefinitions = (ddl: string) =>
  statements(ddl).filter((sql) => /^CREATE TABLE/iu.test(sql));
const queryRows = async <T>(
  client: Client,
  sql: string,
  params: unknown[] = []
) => {
  const response = await client.query<T>(sql, params);
  return response.rows;
};
const tableName = (definition: string) => {
  const match = /^CREATE TABLE IF NOT EXISTS "([a-z_]+)"/iu.exec(definition);
  if (!match) {
    throw new Error("Invalid internal schema definition");
  }
  return match[1];
};
const createIndexes = async (client: Client, ddl: string) => {
  for (const sql of statements(ddl).filter((entry) =>
    /^CREATE (?:UNIQUE )?INDEX/iu.test(entry)
  )) {
    await client.query(sql);
  }
};

const ensureColumns = async (client: Client, definition: string) => {
  const table = tableName(definition);
  const columns = isPostgres
    ? await queryRows<TableColumn>(
        client,
        "SELECT column_name AS name FROM information_schema.columns WHERE table_schema='public' AND table_name=$1",
        [table]
      )
    : await queryRows<TableColumn>(client, `PRAGMA table_info("${table}")`);
  for (const line of definition.split("\n")) {
    const column = /^\s*"([a-z_]+)"\s+(.+?)(?:,)?$/u.exec(line);
    if (!column || columns.some((existing) => existing.name === column[1])) {
      continue;
    }
    if (/PRIMARY KEY/iu.test(column[2])) {
      throw new Error(`Missing primary key in ${table}`);
    }
    await client.query(
      `ALTER TABLE "${table}" ADD COLUMN "${column[1]}" ${column[2].replace(/,$/u, "")}`
    );
  }
};
const ensureTables = async (client: Client) => {
  const ddl = isPostgres ? POSTGRES_INIT_DDL : SQLITE_INIT_DDL;
  for (const definition of tableDefinitions(ddl)) {
    await client.query(definition);
    await ensureColumns(client, definition);
  }
  await createIndexes(client, ddl);
};

const epochExpression = (
  column: string
) => `CASE WHEN "${column}" IS NULL THEN NULL
  WHEN typeof("${column}") IN ('integer','real') OR (CAST("${column}" AS TEXT) <> '' AND CAST("${column}" AS TEXT) NOT GLOB '*[^0-9]*')
  THEN CASE WHEN CAST("${column}" AS INTEGER) >= 100000000000 THEN CAST("${column}" AS INTEGER)/1000 ELSE CAST("${column}" AS INTEGER) END
  ELSE unixepoch("${column}") END`;
const isDateColumn = (column: TableColumn) =>
  /^(?:created_at|updated_at|expires_at|deleted_at|submitted_at|settled_at|leased_until|poll_at|verified_at|activated_at|access_token_expires_at|refresh_token_expires_at)$/u.test(
    column.name
  );
const validateDates = async (
  client: Client,
  table: string,
  dates: TableColumn[]
) => {
  for (const { name } of dates) {
    const invalid = await client.query(
      `SELECT 1 FROM "${table}" WHERE "${name}" IS NOT NULL AND (${epochExpression(name)}) IS NULL LIMIT 1`
    );
    if (invalid.rowCount) {
      throw new Error(
        `Invalid existing date in ${table}.${name}; restore or repair the backup before retrying migration`
      );
    }
  }
};
const rebuildTable = async (
  client: Client,
  definition: string,
  columns: TableColumn[]
) => {
  const table = tableName(definition);
  const temporary = `migrate_${table}`;
  await client.query(
    definition.replace(`IF NOT EXISTS "${table}"`, `"${temporary}"`)
  );
  const names = columns.map(({ name }) => `"${name}"`).join(",");
  const values = columns
    .map((column) =>
      isDateColumn(column) ? epochExpression(column.name) : `"${column.name}"`
    )
    .join(",");
  await client.query(
    `INSERT INTO "${temporary}" (${names}) SELECT ${values} FROM "${table}"`
  );
  await client.query(`DROP TABLE "${table}"`);
  await client.query(`ALTER TABLE "${temporary}" RENAME TO "${table}"`);
};
const migrateTableDates = async (client: Client, definition: string) => {
  const table = tableName(definition);
  const columns = await queryRows<TableColumn>(
    client,
    `PRAGMA table_info("${table}")`
  );
  const dates = columns.filter(isDateColumn);
  await validateDates(client, table, dates);
  if (dates.some(({ type }) => type.toUpperCase() !== "INTEGER")) {
    await rebuildTable(client, definition, columns);
  } else {
    // INTEGER affinity can still contain TEXT written by legacy raw SQL.
    for (const { name } of dates) {
      await client.query(
        `UPDATE "${table}" SET "${name}"=${epochExpression(name)} WHERE "${name}" IS NOT NULL`
      );
    }
  }
};
const migrateSqliteDates = async (client: Client) => {
  for (const definition of tableDefinitions(SQLITE_INIT_DDL)) {
    await migrateTableDates(client, definition);
  }
  await createIndexes(client, SQLITE_INIT_DDL);
};
const normalizeBalances = async (client: Client) => {
  const users = await queryRows<{
    id: string;
    balance_rub: string;
    reserved_rub: string;
  }>(client, 'SELECT id,balance_rub,reserved_rub FROM "user"');
  for (const user of users) {
    const balance = parseRub(String(user.balance_rub));
    const reserved = parseRub(String(user.reserved_rub));
    if (balance < reserved || reserved < 0n) {
      throw new Error(
        `Invalid existing wallet ${user.id}; migration leaves the database unchanged`
      );
    }
    await client.query(
      'UPDATE "user" SET balance_rub=$2,reserved_rub=$3 WHERE id=$1',
      [user.id, formatKopecks(balance), formatKopecks(reserved)]
    );
  }
};

const ensurePostgresWalletChecks = async (client: Client) => {
  await client.query(
    'ALTER TABLE "user" DROP CONSTRAINT IF EXISTS user_balance_check'
  );
  await client.query(
    'ALTER TABLE "user" ADD CONSTRAINT user_balance_check CHECK (reserved_rub >= 0)'
  );
  await client.query(
    "ALTER TABLE syntx_jobs DROP CONSTRAINT IF EXISTS syntx_jobs_amounts"
  );
  await client.query(
    "ALTER TABLE syntx_jobs ADD CONSTRAINT syntx_jobs_amounts CHECK (estimated_cost_rub >= 0 AND max_cost_rub >= estimated_cost_rub AND (charged_cost_rub IS NULL OR charged_cost_rub >= 0))"
  );
  for (const [name, expression] of [
    ["user_role_check", "role IN ('user','vip','admin')"],
  ]) {
    const existing = await client.query(
      "SELECT 1 FROM pg_constraint WHERE conname=$1",
      [name]
    );
    if (!existing.rowCount) {
      await client.query(
        `ALTER TABLE "user" ADD CONSTRAINT ${name} CHECK (${expression})`
      );
    }
  }
};
const postgresObjectExists = async (client: Client, statement: string) => {
  const constraint = /ADD CONSTRAINT ([a-z_]+)/iu.exec(statement);
  const trigger = /CREATE TRIGGER ([a-z_]+)/iu.exec(statement);
  if (constraint) {
    const existing = await queryRows(
      client,
      "SELECT 1 FROM pg_constraint WHERE conname=$1",
      [constraint[1]]
    );
    return existing.length > 0;
  }
  if (trigger) {
    const existing = await queryRows(
      client,
      "SELECT 1 FROM pg_trigger WHERE tgname=$1",
      [trigger[1]]
    );
    return existing.length > 0;
  }
  return false;
};
const postgresIntegrity = async (client: Client) => {
  await ensurePostgresWalletChecks(client);
  for (const statement of POSTGRES_INTEGRITY_DDL.split(
    "--> statement-breakpoint"
  )
    .map((part) => part.trim())
    .filter(Boolean)) {
    if (await postgresObjectExists(client, statement)) {
      continue;
    }
    await client.query(
      statement
        .replace(/CREATE UNIQUE INDEX /iu, "CREATE UNIQUE INDEX IF NOT EXISTS ")
        .replace(/CREATE FUNCTION /iu, "CREATE OR REPLACE FUNCTION ")
    );
  }
};

const migrations = [
  ensureTables,
  async (client: Client) => {
    if (!isPostgres) {
      await migrateSqliteDates(client);
    }
    await normalizeBalances(client);
  },
  async (client: Client) => {
    if (isPostgres) {
      await postgresIntegrity(client);
    } else {
      for (const statement of sqliteIntegrity) {
        await client.query(statement);
      }
    }
  },
  async (client: Client) => {
    if (isPostgres) {
      await postgresIntegrity(client);
    } else {
      for (const trigger of [
        "user_wallet_integrity_insert",
        "user_wallet_integrity_update",
        "syntx_jobs_job_amounts_insert",
        "syntx_jobs_job_amounts_update",
      ]) {
        await client.query(`DROP TRIGGER IF EXISTS "${trigger}"`);
      }
      for (const statement of sqliteIntegrity) {
        await client.query(statement);
      }
    }
  },
];
export const SCHEMA_VERSION = migrations.length;
const applyMigrations = async (client: Client) => {
  await client.query(
    "CREATE TABLE IF NOT EXISTS studio_schema_migrations (version INTEGER PRIMARY KEY, applied_at BIGINT NOT NULL)"
  );
  const versions = await queryRows<{ version: number }>(
    client,
    "SELECT version FROM studio_schema_migrations ORDER BY version"
  );
  const applied = new Set(versions.map(({ version }) => Number(version)));
  if (versions.some(({ version }) => Number(version) > SCHEMA_VERSION)) {
    throw new Error("Database schema is newer than this application");
  }
  for (const [index, migrate] of migrations.entries()) {
    const version = index + 1;
    if (applied.has(version)) {
      continue;
    }
    await migrate(client);
    await client.query(
      "INSERT INTO studio_schema_migrations (version,applied_at) VALUES ($1,$2)",
      [version, Math.floor(Date.now() / 1000)]
    );
  }
  return applied.size !== SCHEMA_VERSION;
};

export const migrateSchema = async () => {
  const client = await pool.connect();
  let began = false;
  try {
    // Rebuilding a parent under FK enforcement can cascade-delete children.
    // The exclusive gate holds all other queries until the snapshot is checked.
    if (!isPostgres) {
      await client.query("PRAGMA foreign_keys=OFF");
    }
    await client.query("BEGIN");
    began = true;
    if (isPostgres) {
      await client.query("SELECT pg_advisory_xact_lock(71442104)");
    }
    const migrated = await applyMigrations(client);
    const violations = isPostgres
      ? []
      : await queryRows(client, "PRAGMA foreign_key_check");
    if (violations.length) {
      throw new Error(
        "Foreign key check failed; migration leaves the database unchanged"
      );
    }
    await client.query("COMMIT");
    began = false;
    console.info(
      JSON.stringify({
        event: "database.schema_ready",
        migrated,
        provider: isPostgres ? "postgres" : "sqlite",
        version: SCHEMA_VERSION,
      })
    );
  } catch (error) {
    if (began) {
      await client.query("ROLLBACK");
    }
    throw error;
  } finally {
    try {
      if (!isPostgres) {
        await client.query("PRAGMA foreign_keys=ON");
      }
    } finally {
      client.release();
    }
  }
};
