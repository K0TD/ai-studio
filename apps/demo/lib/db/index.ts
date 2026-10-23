import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { drizzle as drizzleSqlite } from "drizzle-orm/sqlite-proxy";
import type {
  AsyncRemoteCallback,
  SqliteRemoteDatabase,
} from "drizzle-orm/sqlite-proxy";
import type { QueryResultRow } from "pg";
import { Pool } from "pg";

// biome-ignore lint/performance/noNamespaceImport: Drizzle needs the complete schema namespace.
import * as pgSchema from "./schema";
import { SqliteDriver } from "./sqlite";
// biome-ignore lint/performance/noNamespaceImport: Drizzle needs the complete schema namespace.
import * as sqliteSchema from "./sqlite-schema";
import { getSqlitePath } from "./storage-path";

const rawDatabaseUrl = process.env.DATABASE_URL?.trim() || "";
export const isPostgres = /^postgres(ql)?:\/\//iu.test(rawDatabaseUrl);

const getDatabaseUrl = () => {
  if (!rawDatabaseUrl) {
    return rawDatabaseUrl;
  }
  // When running locally on host in dev, rewrite docker hostname '@postgres:' to '@127.0.0.1:'
  if (
    process.env.NODE_ENV !== "production" &&
    (rawDatabaseUrl.includes("@postgres:") ||
      rawDatabaseUrl.includes("@postgres/"))
  ) {
    return rawDatabaseUrl
      .replace("@postgres:", "@127.0.0.1:")
      .replace("@postgres/", "@127.0.0.1/");
  }
  return rawDatabaseUrl;
};

// ==========================================
// PostgreSQL Pool & Drizzle
// ==========================================
let pgPoolInstance: Pool | undefined;
const getPgPool = (): Pool => {
  if (!pgPoolInstance) {
    pgPoolInstance = new Pool({
      connectionString: getDatabaseUrl(),
      connectionTimeoutMillis: 5000,
      idleTimeoutMillis: 30_000,
      max: 10,
    });
    pgPoolInstance.on("error", () =>
      console.error(JSON.stringify({ event: "database.pool_error" }))
    );
  }
  return pgPoolInstance;
};

// Raw repository queries and Drizzle share one serialized SQLite connection.
const sqlite = new SqliteDriver(getSqlitePath);

export interface DatabaseClient {
  query<T = QueryResultRow>(
    sql: string,
    params?: unknown[]
  ): Promise<{ rows: T[]; rowCount: number }>;
  release(): void;
}

export type AppDb = ReturnType<typeof drizzlePg<typeof pgSchema>>;
type SqliteDb = SqliteRemoteDatabase<typeof sqliteSchema>;
let drizzleInstance: AppDb | SqliteDb | undefined;

export const pool = {
  async connect(): Promise<DatabaseClient> {
    if (!isPostgres) {
      return sqlite.connect();
    }
    const client = await getPgPool().connect();
    return {
      async query<T = QueryResultRow>(sql: string, params: unknown[] = []) {
        const result = await client.query(sql, params);
        return {
          rowCount: result.rowCount ?? result.rows.length,
          // SAFETY: Repository callers supply T for their owned, parameterized SQL projection.
          rows: result.rows as T[],
        };
      },
      release: () => client.release(),
    };
  },
  async end() {
    if (pgPoolInstance) {
      await pgPoolInstance.end();
      pgPoolInstance = undefined;
    }
    await sqlite.close();
    drizzleInstance = undefined;
  },
  // Event listeners are the pg pool's native error notification API.
  // oxlint-disable-next-line promise/prefer-await-to-callbacks
  on(event: "error", callback: (error: Error) => void) {
    if (isPostgres) {
      getPgPool().on(event, callback);
    }
  },
  async query<T = QueryResultRow>(
    sql: string,
    params: unknown[] = []
  ): Promise<{ rows: T[]; rowCount: number }> {
    if (!isPostgres) {
      return sqlite.query<T>(sql, params);
    }
    const result = await getPgPool().query(sql, params);
    return {
      rowCount: result.rowCount ?? result.rows.length,
      // SAFETY: Repository callers supply T for their owned, parameterized SQL projection.
      rows: result.rows as T[],
    };
  },
};

// Round each stored decimal to integer kopecks BEFORE summing in SQLite.
// Column names are internal SQL expressions, never request input.
export const sumRubSql = (column: string, negate = false): string =>
  isPostgres
    ? `coalesce(${negate ? "-" : ""}sum(${column}),0)::text`
    : `printf('%.2f', coalesce(${negate ? "-" : ""}sum(CAST(round(CAST(${column} AS REAL)*100) AS INTEGER)),0)/100.0)`;

export const getDb = () => {
  if (!drizzleInstance) {
    if (isPostgres) {
      drizzleInstance = drizzlePg({ client: getPgPool(), schema: pgSchema });
    } else {
      const instance = drizzleSqlite(
        async (sql, params, method) => {
          const result = await sqlite.orm(sql, params, method);
          // SAFETY: Drizzle's get mapper expects undefined for missing rows, although its callback type only declares arrays.
          return result as Awaited<ReturnType<AsyncRemoteCallback>>;
        },
        { schema: sqliteSchema }
      );
      const transaction = instance.transaction.bind(instance);
      // SAFETY: The wrapper preserves Drizzle's callback/result contract and fixes the SQLite transaction mode.
      // oxlint-disable-next-line promise/prefer-await-to-callbacks
      instance.transaction = ((callback: Parameters<typeof transaction>[0]) =>
        sqlite.exclusive(() =>
          transaction(callback, { behavior: "immediate" })
        )) as typeof instance.transaction;
      drizzleInstance = instance;
    }
  }
  return drizzleInstance;
};

// The application-facing schema is identical across dialects. Dialect-specific
// locking and SQL stay behind the database boundary.
export const db: AppDb = new Proxy(
  // SAFETY: All property access is forwarded to the initialized dialect-specific Drizzle instance.
  {} as AppDb,
  {
    get(_target, property) {
      const instance = getDb();
      // The Proxy forwards Drizzle's dynamic public property keys to its concrete dialect.
      // oxlint-disable-next-line anti-slop/no-reflect-get
      const value = Reflect.get(instance, property);
      // Function binding is required to preserve Drizzle methods' receivers across the Proxy.
      // oxlint-disable-next-line anti-slop/no-runtime-typeof
      return typeof value === "function" ? value.bind(instance) : value;
    },
  }
);
export const studioDb = db;
