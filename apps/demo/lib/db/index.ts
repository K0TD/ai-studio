import { existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

import { drizzle as drizzlePg } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import { getSqlitePath, getStorageDir } from "./storage-path";

import * as pgSchema from "./schema";

const rawDatabaseUrl = process.env.DATABASE_URL?.trim() || "";
export const isPostgres = /^postgres(ql)?:\/\//i.test(rawDatabaseUrl);

const getDatabaseUrl = () => {
  if (!rawDatabaseUrl) {
    return rawDatabaseUrl;
  }
  // When running locally on host in dev, rewrite docker hostname '@postgres:' to '@127.0.0.1:'
  if (process.env.NODE_ENV !== "production") {
    if (
      rawDatabaseUrl.includes("@postgres:") ||
      rawDatabaseUrl.includes("@postgres/")
    ) {
      return rawDatabaseUrl
        .replace("@postgres:", "@127.0.0.1:")
        .replace("@postgres/", "@127.0.0.1/");
    }
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

// ==========================================
// SQLite Database (via bun:sqlite)
// ==========================================
let sqliteInstance: any;
const getSqliteDb = () => {
  if (!sqliteInstance) {
    // Dynamic import to prevent bundler errors in non-bun environments
    const { Database } = require("bun:sqlite");
    const sqlitePath = getSqlitePath();
    const dir = dirname(sqlitePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    const logsDir = resolve(getStorageDir(), "logs");
    if (!existsSync(logsDir)) {
      mkdirSync(logsDir, { recursive: true });
    }

    sqliteInstance = new Database(sqlitePath, { create: true });
    sqliteInstance.run("PRAGMA journal_mode = WAL;");
    sqliteInstance.run("PRAGMA foreign_keys = ON;");
    sqliteInstance.run("PRAGMA busy_timeout = 15000;");
    sqliteInstance.run("PRAGMA synchronous = NORMAL;");
  }
  return sqliteInstance;
};

// ==========================================
// SQL Translation for SQLite Compatibility
// ==========================================
const translatePgToSqlite = (sqlText: string, params: any[] = []) => {
  let sql = sqlText;
  const boundParams = params.map((p) => {
    if (p instanceof Date) {
      return isNaN(p.getTime())
        ? new Date().toISOString().replace("T", " ").slice(0, 19)
        : p.toISOString().replace("T", " ").slice(0, 19);
    }
    if (typeof p === "boolean") {
      return p ? 1 : 0;
    }
    return p;
  });

  // 1. Array comparison: id = ANY($2::text[]) or id = ANY($2)
  sql = sql.replace(
    /(=|\bin\b)\s*ANY\s*\(\s*\$([0-9]+)(?:::text\[\])?\s*\)/gi,
    (_match, _op, paramIdxStr) => {
      const idx = Number(paramIdxStr) - 1;
      if (boundParams[idx] === undefined || boundParams[idx] === null) {
        boundParams[idx] = "[]";
      } else if (Array.isArray(boundParams[idx])) {
        boundParams[idx] = JSON.stringify(boundParams[idx]);
      } else if (
        typeof boundParams[idx] === "string" &&
        !boundParams[idx].startsWith("[")
      ) {
        boundParams[idx] = JSON.stringify([boundParams[idx]]);
      }
      return ` IN (SELECT value FROM json_each(?${paramIdxStr}))`;
    }
  );
  sql = sql.replace(
    /\bIN\s*\(\s*\$([0-9]+)(?:::text\[\])?\s*\)/gi,
    (_match, paramIdxStr) => {
      const idx = Number(paramIdxStr) - 1;
      if (boundParams[idx] === undefined || boundParams[idx] === null) {
        boundParams[idx] = "[]";
      } else if (Array.isArray(boundParams[idx])) {
        boundParams[idx] = JSON.stringify(boundParams[idx]);
      } else if (
        typeof boundParams[idx] === "string" &&
        !boundParams[idx].startsWith("[")
      ) {
        boundParams[idx] = JSON.stringify([boundParams[idx]]);
      }
      return ` IN (SELECT value FROM json_each(?${paramIdxStr}))`;
    }
  );

  // 2. Replace parameter placeholders $1, $2 -> ?1, ?2 (SQLite indexed params)
  sql = sql.replace(/\$([0-9]+)/g, "?$1");

  // 3. PostgreSQL intervals and timestamps
  sql = sql.replace(
    /now\(\)\s*\+\s*interval\s*'([0-9]+)\s*seconds'/gi,
    "datetime('now', '+$1 seconds')"
  );
  sql = sql.replace(
    /now\(\)\s*-\s*interval\s*'([0-9]+)\s*seconds'/gi,
    "datetime('now', '-$1 seconds')"
  );
  sql = sql.replace(
    /now\(\)\s*-\s*interval\s*'([0-9]+)\s*hours?'/gi,
    "datetime('now', '-$1 hours')"
  );
  sql = sql.replace(
    /now\(\)\s*-\s*interval\s*'([0-9]+)\s*days?'/gi,
    "datetime('now', '-$1 days')"
  );
  sql = sql.replace(
    /date_trunc\('day',\s*now\(\)\s*at\s*time\s*zone\s*'Europe\/Moscow'\)\s*at\s*time\s*zone\s*'Europe\/Moscow'/gi,
    "date('now', '+3 hours')"
  );
  sql = sql.replace(/date_trunc\([^)]+\)/gi, "date('now')");
  sql = sql.replace(/now\(\)/gi, "datetime('now')");

  // 4. Strip PostgreSQL type casts (::numeric, ::int, ::text, etc.)
  sql = sql.replace(/::[a-zA-Z0-9_]+(\[\])?/g, "");

  // 5. Remove PostgreSQL lock clauses
  sql = sql.replace(/\bFOR\s+UPDATE(\s+SKIP\s+LOCKED)?\b/gi, "");
  sql = sql.replace(/select\s+pg_advisory_xact_lock\([^)]+\)/gi, "SELECT 1");

  // 6. Remove table aliases in DELETE FROM statements (e.g. DELETE FROM table alias WHERE -> DELETE FROM table WHERE)
  sql = sql.replace(
    /\bDELETE\s+FROM\s+([a-zA-Z0-9_"]+)\s+([a-zA-Z0-9_"]+)\s+WHERE\b/gi,
    (_match, tbl, alias) => {
      const aliasPattern = new RegExp(`\\b${alias}\\.`, "g");
      sql = sql.replace(aliasPattern, `${tbl}.`);
      return `DELETE FROM ${tbl} WHERE`;
    }
  );

  return { boundParams, sql };
};

// ==========================================
// Unified Pool Interface
// ==========================================
export const pool = {
  async connect() {
    if (isPostgres) {
      return getPgPool().connect();
    }
    return {
      query: (text: string, params?: any[]) => pool.query(text, params),
      release: () => {},
    };
  },
  async end() {
    if (isPostgres && pgPoolInstance) {
      await pgPoolInstance.end();
      pgPoolInstance = undefined;
    } else if (sqliteInstance) {
      sqliteInstance.close();
      sqliteInstance = undefined;
    }
  },
  on(event: string, callback: (...args: any[]) => void) {
    if (isPostgres) {
      getPgPool().on(event as any, callback);
    }
  },
  async query<T = any>(
    sqlText: string,
    params: any[] = []
  ): Promise<{ rows: T[]; rowCount: number }> {
    if (isPostgres) {
      const res = await getPgPool().query(sqlText, params);
      return {
        rowCount: res.rowCount ?? res.rows.length,
        rows: res.rows as T[],
      };
    }

    const db = getSqliteDb();
    const { sql, boundParams } = translatePgToSqlite(sqlText, params);

    const trimmed = sql.trim();
    const isSelect = /^(SELECT|PRAGMA)\b/i.test(trimmed);
    const hasReturning = /\bRETURNING\b/i.test(trimmed);

    // Transaction controls
    if (/^BEGIN\b/i.test(trimmed)) {
      db.run("BEGIN IMMEDIATE");
      return { rowCount: 0, rows: [] };
    }
    if (/^COMMIT\b/i.test(trimmed)) {
      db.run("COMMIT");
      return { rowCount: 0, rows: [] };
    }
    if (/^ROLLBACK\b/i.test(trimmed)) {
      db.run("ROLLBACK");
      return { rowCount: 0, rows: [] };
    }

    try {
      const stmt = db.prepare(sql);
      if (isSelect || hasReturning) {
        const rawRows = stmt.all(...boundParams) as any[];
        const rows = rawRows.map((row) => {
          if (!row || typeof row !== "object") {
            return row;
          }
          const normalized: any = { ...row };
          for (const bKey of [
            "is_approved",
            "is_banned",
            "is_env_admin",
            "email_verified",
            "is_favorite",
          ]) {
            if (bKey in normalized && typeof normalized[bKey] === "number") {
              normalized[bKey] = normalized[bKey] === 1;
            }
          }
          for (const jKey of [
            "request",
            "catalog_snapshot",
            "provider_result",
            "permissions",
            "details",
            "data",
          ]) {
            if (jKey in normalized && typeof normalized[jKey] === "string") {
              try {
                normalized[jKey] = JSON.parse(normalized[jKey]);
              } catch {
                // keep string if not json
              }
            }
          }
          return normalized;
        }) as T[];
        return { rowCount: rows.length, rows };
      }
      const info = stmt.run(...boundParams);
      return { rowCount: info.changes, rows: [] };
    } catch (error) {
      console.error(
        JSON.stringify({
          error: error instanceof Error ? error.message : String(error),
          event: "database.sqlite_query_error",
          originalSql: sqlText.slice(0, 160),
          translatedSql: sql.slice(0, 160),
        })
      );
      throw error;
    }
  },
};

// ==========================================
// Drizzle ORM Instance
// ==========================================
let drizzleInstance: any;
export const getDb = () => {
  if (!drizzleInstance) {
    if (isPostgres) {
      drizzleInstance = drizzlePg({ client: getPgPool(), schema: pgSchema });
    } else {
      const { drizzle: drizzleSqlite } = require("drizzle-orm/bun-sqlite");
      const sqliteSchema = require("./sqlite-schema");
      drizzleInstance = drizzleSqlite({
        client: getSqliteDb(),
        schema: sqliteSchema,
      });
    }
  }
  return drizzleInstance;
};

export type AppDb = ReturnType<typeof drizzlePg<typeof pgSchema>>;

export const db: AppDb = new Proxy({} as AppDb, {
  get(_target, prop) {
    const instance = getDb();
    const value = instance[prop];
    return typeof value === "function" ? value.bind(instance) : value;
  },
});

export const studioDb = db;
