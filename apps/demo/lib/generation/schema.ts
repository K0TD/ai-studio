import {
  boolean,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

const money = (name: string) => numeric(name, { precision: 12, scale: 2 });
const time = (name: string) => timestamp(name, { withTimezone: true });

export const syntxChats = pgTable(
  "syntx_chats",
  {
    createdAt: time("created_at").defaultNow().notNull(),
    deletedAt: time("deleted_at"),
    id: text("id").primaryKey(),
    isFavorite: boolean("is_favorite").default(false).notNull(),
    tab: text("tab").notNull(),
    title: text("title").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [index("syntx_chats_owner_idx").on(t.userId, t.createdAt)]
);

export const syntxQuotes = pgTable(
  "syntx_quotes",
  {
    catalogSnapshot: jsonb("catalog_snapshot").notNull(),
    createdAt: time("created_at").defaultNow().notNull(),
    estimatedCostRub: money("estimated_cost_rub").notNull(),
    expiresAt: time("expires_at").notNull(),
    id: text("id").primaryKey(),
    maxCostRub: money("max_cost_rub").notNull(),
    requestHash: text("request_hash").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [index("syntx_quotes_owner_idx").on(t.userId)]
);

export const syntxJobs = pgTable(
  "syntx_jobs",
  {
    attempts: integer("attempts").default(0).notNull(),
    catalogSnapshot: jsonb("catalog_snapshot").notNull(),
    chargedCostRub: money("charged_cost_rub"),
    chatId: text("chat_id").notNull(),
    createdAt: time("created_at").defaultNow().notNull(),
    error: text("error"),
    estimatedCostRub: money("estimated_cost_rub").notNull(),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull(),
    leaseToken: text("lease_token"),
    leasedUntil: time("leased_until"),
    maxCostRub: money("max_cost_rub").notNull(),
    modelId: text("model_id").notNull(),
    pollAt: time("poll_at").defaultNow().notNull(),
    pricingSource: text("pricing_source"),
    prompt: text("prompt").notNull(),
    providerCostRub: money("provider_cost_rub"),
    providerId: text("provider_id"),
    providerResult: jsonb("provider_result"),
    quoteId: text("quote_id").notNull(),
    request: jsonb("request").notNull(),
    requestHash: text("request_hash").notNull(),
    settledAt: time("settled_at"),
    status: text("status").default("queued").notNull(),
    submittedAt: time("submitted_at"),
    tab: text("tab").notNull(),
    updatedAt: time("updated_at").defaultNow().notNull(),
    userId: text("user_id").notNull(),
    varianceRub: money("variance_rub"),
  },
  (t) => [
    uniqueIndex("syntx_jobs_idempotency_idx").on(t.userId, t.idempotencyKey),
    uniqueIndex("syntx_jobs_quote_idx").on(t.quoteId),
    index("syntx_jobs_queue_idx").on(t.status, t.pollAt),
    index("syntx_jobs_owner_idx").on(t.userId, t.createdAt),
  ]
);

export const syntxFiles = pgTable(
  "syntx_files",
  {
    createdAt: time("created_at").defaultNow().notNull(),
    filename: text("filename").notNull(),
    id: text("id").primaryKey(),
    mimeType: text("mime_type").notNull(),
    sizeBytes: integer("size_bytes").notNull(),
    storageKey: text("storage_key").notNull(),
    userId: text("user_id").notNull(),
  },
  (t) => [index("syntx_files_owner_idx").on(t.userId)]
);

export const syntxArtifacts = pgTable(
  "syntx_artifacts",
  {
    createdAt: time("created_at").defaultNow().notNull(),
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

export const syntxCatalog = pgTable("syntx_catalog", {
  data: jsonb("data").notNull(),
  id: text("id").primaryKey(),
  verifiedAt: time("verified_at").defaultNow().notNull(),
});

export const syntxWorkerHeartbeats = pgTable("syntx_worker_heartbeats", {
  id: text("id").primaryKey(),
  updatedAt: time("updated_at").defaultNow().notNull(),
});
