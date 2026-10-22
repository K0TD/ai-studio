import { relations, sql } from "drizzle-orm";
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import type { AdminAuditDetails } from "../admin/types";
import { DEFAULT_USER_PERMISSIONS } from "../security/permissions";
import type { UserPermissions, UserRole } from "../security/permissions";

export const user = sqliteTable(
  "user",
  {
    activatedAt: integer("activated_at", { mode: "timestamp" }),
    balanceRub: text("balance_rub").default("0.00").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    displayUsername: text("display_username"),
    email: text("email").notNull().unique(),
    emailVerified: integer("email_verified", { mode: "boolean" })
      .default(false)
      .notNull(),
    id: text("id").primaryKey(),
    image: text("image"),
    isApproved: integer("is_approved", { mode: "boolean" })
      .default(true)
      .notNull(),
    isBanned: integer("is_banned", { mode: "boolean" })
      .default(false)
      .notNull(),
    isEnvAdmin: integer("is_env_admin", { mode: "boolean" })
      .default(false)
      .notNull(),
    name: text("name").notNull(),
    permissions: text("permissions", { mode: "json" })
      .$type<UserPermissions>()
      .default(DEFAULT_USER_PERMISSIONS)
      .notNull(),
    reservedRub: text("reserved_rub").default("0.00").notNull(),
    role: text("role").$type<UserRole>().default("user").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    username: text("username").unique(),
  },
  (table) => [
    uniqueIndex("user_env_admin_unique")
      .on(table.isEnvAdmin)
      .where(sql`${table.isEnvAdmin} = 1`),
  ]
);

export const transactions = sqliteTable(
  "transactions",
  {
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    amountRub: text("amount_rub").notNull(),
    balanceAfterRub: text("balance_after_rub").notNull(),
    balanceBeforeRub: text("balance_before_rub").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    jobId: text("job_id"),
    reason: text("reason").notNull(),
    type: text("type").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("transactions_user_created_idx").on(table.userId, table.createdAt),
  ]
);

export const adminAudit = sqliteTable(
  "admin_audit",
  {
    action: text("action").notNull(),
    actorId: text("actor_id"),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    details: text("details", { mode: "json" })
      .$type<AdminAuditDetails>()
      .default({})
      .notNull(),
    id: text("id").primaryKey(),
    requestId: text("request_id"),
    targetId: text("target_id"),
  },
  (table) => [index("admin_audit_created_idx").on(table.createdAt)]
);

export const invitation = sqliteTable(
  "invitation",
  {
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("invitation_user_unique").on(table.userId)]
);

export const rateLimit = sqliteTable("rate_limit", {
  count: integer("count").default(0).notNull(),
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  lastRequest: integer("last_request").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    id: text("id").primaryKey(),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);

export const account = sqliteTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: integer("access_token_expires_at", {
      mode: "timestamp",
    }),
    accountId: text("account_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: integer("refresh_token_expires_at", {
      mode: "timestamp",
    }),
    scope: text("scope"),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);

export const verification = sqliteTable(
  "verification",
  {
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);

export const syntxChats = sqliteTable(
  "syntx_chats",
  {
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    deletedAt: integer("deleted_at", { mode: "timestamp" }),
    id: text("id").primaryKey(),
    isFavorite: integer("is_favorite", { mode: "boolean" })
      .default(false)
      .notNull(),
    tab: text("tab").notNull(),
    title: text("title").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [index("syntx_chats_owner_idx").on(t.userId, t.createdAt)]
);

export const syntxQuotes = sqliteTable(
  "syntx_quotes",
  {
    catalogSnapshot: text("catalog_snapshot", { mode: "json" }).notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    estimatedCostRub: text("estimated_cost_rub").notNull(),
    expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
    id: text("id").primaryKey(),
    maxCostRub: text("max_cost_rub").notNull(),
    requestHash: text("request_hash").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [index("syntx_quotes_owner_idx").on(t.userId)]
);

export const syntxJobs = sqliteTable(
  "syntx_jobs",
  {
    attempts: integer("attempts").default(0).notNull(),
    catalogSnapshot: text("catalog_snapshot", { mode: "json" }).notNull(),
    chargedCostRub: text("charged_cost_rub"),
    chatId: text("chat_id").notNull(),
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    error: text("error"),
    estimatedCostRub: text("estimated_cost_rub").notNull(),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    leaseToken: text("lease_token"),
    leasedUntil: integer("leased_until", { mode: "timestamp" }),
    maxCostRub: text("max_cost_rub").notNull(),
    modelId: text("model_id").notNull(),
    pollAt: integer("poll_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    pricingSource: text("pricing_source"),
    prompt: text("prompt").notNull(),
    providerCostRub: text("provider_cost_rub"),
    providerId: text("provider_id"),
    providerResult: text("provider_result", { mode: "json" }),
    quoteId: text("quote_id").notNull(),
    request: text("request", { mode: "json" }).notNull(),
    requestHash: text("request_hash").notNull(),
    settledAt: integer("settled_at", { mode: "timestamp" }),
    status: text("status").default("queued").notNull(),
    submittedAt: integer("submitted_at", { mode: "timestamp" }),
    tab: text("tab").notNull(),
    updatedAt: integer("updated_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    userId: text("user_id").notNull(),
    varianceRub: text("variance_rub"),
  },
  (t) => [
    uniqueIndex("syntx_jobs_idempotency_idx").on(t.userId, t.idempotencyKey),
    uniqueIndex("syntx_jobs_quote_idx").on(t.quoteId),
    index("syntx_jobs_queue_idx").on(t.status, t.pollAt),
    index("syntx_jobs_owner_idx").on(t.userId, t.createdAt),
  ]
);

export const syntxFiles = sqliteTable(
  "syntx_files",
  {
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    filename: text("filename").notNull(),
    id: text("id").primaryKey(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [index("syntx_files_owner_idx").on(t.userId)]
);

export const syntxArtifacts = sqliteTable(
  "syntx_artifacts",
  {
    createdAt: integer("created_at", { mode: "timestamp" })
      .default(sql`(unixepoch())`)
      .notNull(),
    id: text("id").primaryKey(),
    jobId: text("job_id").notNull(),
    mimeType: text("mime_type").notNull(),
    ordinal: integer("ordinal").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [
    uniqueIndex("syntx_artifacts_job_idx").on(t.jobId, t.ordinal),
    index("syntx_artifacts_owner_idx").on(t.userId),
  ]
);

export const syntxCatalog = sqliteTable("syntx_catalog", {
  data: text("data", { mode: "json" }).notNull(),
  id: text("id").primaryKey(),
  verifiedAt: integer("verified_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const syntxWorkerHeartbeats = sqliteTable("syntx_worker_heartbeats", {
  id: text("id").primaryKey(),
  updatedAt: integer("updated_at", { mode: "timestamp" })
    .default(sql`(unixepoch())`)
    .notNull(),
});

export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  sessions: many(session),
}));

export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));

export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
