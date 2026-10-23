import type * as BunSqliteModule from "bun:sqlite";
import type { Database, SQLQueryBindings, Statement } from "bun:sqlite";
import { AsyncLocalStorage } from "node:async_hooks";
import { existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

import type { QueryResultRow } from "pg";

type Bindings = SQLQueryBindings[];
interface Scope {
  active: boolean;
}
type PositionalRows = ReturnType<Statement["values"]>;
type RunResult = ReturnType<Statement["run"]>;
type Release = () => void;

/** Only the PostgreSQL constructs used by our parameterized repository queries. */
export const translatePgToSqlite = (source: string, params: unknown[] = []) => {
  const boundParams = params.map((value) => {
    if (value instanceof Date) {
      if (!Number.isFinite(value.getTime())) {
        throw new TypeError("Invalid database date");
      }
      return Math.floor(value.getTime() / 1000);
    }
    // SQLite binds booleans as integers at this dialect boundary.
    // oxlint-disable-next-line anti-slop/no-runtime-typeof
    return typeof value === "boolean" ? Number(value) : value;
  });
  let sql = source.replaceAll(
    /(=|\bin\b)\s*ANY\s*\(\s*\$(\d+)(?:::text\[\])?\s*\)|\bIN\s*\(\s*\$(\d+)(?:::text\[\])?\s*\)/giu,
    (_match, _operator, anyIndex, inIndex) => {
      const index = Number(anyIndex ?? inIndex);
      const value = boundParams[index - 1];
      boundParams[index - 1] = JSON.stringify(
        Array.isArray(value)
          ? value
          : [value].filter((entry) => entry !== null && entry !== undefined)
      );
      return ` IN (SELECT value FROM json_each(?${index}))`;
    }
  );
  sql = sql.replaceAll(/\$(\d+)/gu, "?$1");
  sql = sql.replaceAll(
    /date_trunc\('day',\s*now\(\)\s*at\s*time\s*zone\s*'Europe\/Moscow'\)\s*at\s*time\s*zone\s*'Europe\/Moscow'/giu,
    "(unixepoch(date('now', '+3 hours')) - 10800)"
  );
  sql = sql.replaceAll(
    /now\(\)\s*([+-])\s*interval\s*'(\d+)\s*(seconds?|minutes?|hours?|days?)'/giu,
    (_match, sign, count, unit) => `unixepoch('now', '${sign}${count} ${unit}')`
  );
  sql = sql.replaceAll(/now\(\)/giu, "unixepoch()");
  sql = sql.replaceAll(/::[a-zA-Z0-9_]+(?:\[\])?/gu, "");
  sql = sql.replaceAll(/\bFOR\s+UPDATE(?:\s+SKIP\s+LOCKED)?\b/giu, "");
  sql = sql.replaceAll(
    /select\s+pg_advisory_xact_lock\([^)]*\)/giu,
    "SELECT 1"
  );
  // SAFETY: Repository parameters are scalar SQLite bindings; arrays in ANY/IN were encoded above.
  return { boundParams: boundParams as Bindings, sql };
};

const booleanColumns = new Set([
  "is_approved",
  "is_banned",
  "is_env_admin",
  "email_verified",
  "is_favorite",
]);
const jsonColumns = new Set([
  "request",
  "catalog_snapshot",
  "provider_result",
  "permissions",
  "details",
  "data",
]);
const moneyColumns = new Set([
  "balance_rub",
  "reserved_rub",
  "amount_rub",
  "balance_before_rub",
  "balance_after_rub",
  "estimated_cost_rub",
  "max_cost_rub",
  "charged_cost_rub",
  "provider_cost_rub",
  "variance_rub",
]);
const normalizeRow = (row: QueryResultRow) =>
  Object.fromEntries(
    Object.entries(row).map(([key, value]) => {
      // Column names and their SQLite representations are owned by this adapter.
      // oxlint-disable-next-line anti-slop/no-runtime-typeof
      if (booleanColumns.has(key) && typeof value === "number") {
        return [key, value === 1];
      }
      // JSON columns are stored as TEXT by the owned SQLite schema.
      // oxlint-disable-next-line anti-slop/no-runtime-typeof
      if (jsonColumns.has(key) && typeof value === "string") {
        return [key, JSON.parse(value)];
      }
      if (moneyColumns.has(key) && value !== null && value !== undefined) {
        const match = /^(-?)(\d+)(?:\.(\d{1,2}))?$/u.exec(String(value));
        if (match) {
          return [
            key,
            `${match[1]}${match[2]}.${(match[3] ?? "").padEnd(2, "0")}`,
          ];
        }
      }
      return [key, value];
    })
  );

/** One gate covers raw SQL, ORM, and async transactions within this process. */
export class SqliteDriver {
  private database?: Database;
  private tail: Promise<void> = Promise.resolve();
  private scope = new AsyncLocalStorage<Scope>();

  private path: () => string;

  constructor(path: () => string) {
    this.path = path;
  }

  private getDatabase(): Database {
    if (!this.database) {
      const filename = this.path();
      const existed = existsSync(filename);
      mkdirSync(dirname(filename), { recursive: true });
      const { Database: BunDatabase } =
        // SAFETY: Bun owns this module; defer loading because Next's build executes under Node.
        // oxlint-disable-next-line node/global-require, unicorn/prefer-module
        require("bun:sqlite") as typeof BunSqliteModule;
      const database = new BunDatabase(filename, { create: true });
      database.run("PRAGMA journal_mode=WAL");
      database.run("PRAGMA foreign_keys=ON");
      database.run("PRAGMA busy_timeout=15000");
      database.run("PRAGMA synchronous=NORMAL");
      this.database = database;
      console.info(
        JSON.stringify({
          event: "database.opened",
          existed,
          path: filename,
          provider: "sqlite",
        })
      );
    }
    return this.database;
  }

  private async acquire(): Promise<Release> {
    const previous = this.tail;
    // The gate signals completion without a value, matching the native Promise resolver contract.
    // oxlint-disable-next-line typescript/no-invalid-void-type
    const next = Promise.withResolvers<void>();
    this.tail = next.promise;
    await previous;
    return () => {
      next.resolve();
    };
  }

  async exclusive<T>(operation: () => T | Promise<T>): Promise<T> {
    const current = this.scope.getStore();
    if (current) {
      if (!current.active) {
        throw new Error("Database transaction has ended");
      }
      return operation();
    }
    const release = await this.acquire();
    const scope = { active: true };
    try {
      return await this.scope.run(scope, operation);
    } finally {
      scope.active = false;
      release();
    }
  }

  private execute(sql: string, params: Bindings, method: "run"): RunResult;
  private execute(
    sql: string,
    params: Bindings,
    method: "values"
  ): PositionalRows;
  private execute(
    sql: string,
    params: Bindings,
    method: "get"
  ): QueryResultRow | null;
  private execute(sql: string, params: Bindings): QueryResultRow[];
  private execute(
    sql: string,
    params: Bindings,
    method: "all" | "get" | "run" | "values" = "all"
  ) {
    const database = this.getDatabase();
    const statement = database.query<QueryResultRow, Bindings>(sql);
    if (method === "run") {
      return statement.run(...params);
    }
    if (method === "values") {
      return statement.values(...params);
    }
    if (method === "get") {
      return statement.get(...params);
    }
    return statement.all(...params);
  }

  orm(
    sql: string,
    params: unknown[],
    method: "all" | "get" | "run" | "values"
  ) {
    return this.exclusive(() => {
      // Drizzle maps positional rows to schema fields, including Date and JSON.
      if (method === "run") {
        // SAFETY: Drizzle encodes model fields into SQLite bindings before invoking its proxy.
        this.execute(sql, params as Bindings, "run");
        return { rows: [] };
      }
      // SAFETY: Drizzle encodes model fields into SQLite bindings before invoking its proxy.
      const rows = this.execute(sql, params as Bindings, "values");
      // Drizzle treats undefined as "not found"; an empty array is a real row.
      return { rows: method === "get" ? rows[0] : rows };
    });
  }

  query<T = QueryResultRow>(source: string, params: unknown[] = []) {
    return this.exclusive(() =>
      Promise.resolve(this.queryDirect<T>(source, params))
    );
  }

  private queryDirect<T>(source: string, params: unknown[]) {
    const { sql, boundParams } = translatePgToSqlite(source, params);
    try {
      if (
        /^\s*(?:SELECT|PRAGMA|WITH)\b/iu.test(sql) ||
        /\bRETURNING\b/iu.test(sql)
      ) {
        // SAFETY: Repository callers supply T for their owned SQL projection after dialect normalization.
        const rows = this.execute(sql, boundParams).map(normalizeRow) as T[];
        return { rowCount: rows.length, rows };
      }
      const result = this.execute(
        /^\s*BEGIN\s*$/iu.test(sql) ? "BEGIN IMMEDIATE" : sql,
        boundParams,
        "run"
      );
      return { rowCount: result.changes, rows: new Array<T>() };
    } catch (error) {
      console.error(
        JSON.stringify({
          error:
            error instanceof Error ? error.message : "SQLite operation failed",
          event: "database.sqlite_query_error",
        })
      );
      throw error;
    }
  }

  async connect() {
    if (this.scope.getStore()) {
      throw new Error("Use the existing database transaction");
    }
    const unlock = await this.acquire();
    let released = false;
    return {
      // Preserve Promise rejection semantics for synchronous SQLite exceptions.
      // oxlint-disable-next-line eslint/require-await
      query: async <T = QueryResultRow>(
        sql: string,
        params: unknown[] = []
      ) => {
        if (released) {
          throw new Error("Database connection has been released");
        }
        return this.queryDirect<T>(sql, params);
      },
      release: () => {
        if (released) {
          return;
        }
        try {
          if (this.database?.inTransaction) {
            this.database.run("ROLLBACK");
          }
        } finally {
          released = true;
          unlock();
        }
      },
    };
  }

  close() {
    return this.exclusive(() => {
      this.database?.close();
      this.database = undefined;
    });
  }
}
