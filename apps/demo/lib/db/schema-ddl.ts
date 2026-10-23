export const SQLITE_INIT_DDL = `
CREATE TABLE IF NOT EXISTS "user" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "name" TEXT NOT NULL,
  "email" TEXT NOT NULL UNIQUE,
  "email_verified" INTEGER NOT NULL DEFAULT 0,
  "image" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch()),
  "username" TEXT UNIQUE,
  "display_username" TEXT,
  "role" TEXT NOT NULL DEFAULT 'user',
  "balance_rub" TEXT NOT NULL DEFAULT '0.00',
  "reserved_rub" TEXT NOT NULL DEFAULT '0.00',
  "is_approved" INTEGER NOT NULL DEFAULT 1,
  "is_banned" INTEGER NOT NULL DEFAULT 0,
  "is_env_admin" INTEGER NOT NULL DEFAULT 0,
  "activated_at" INTEGER,
  "permissions" TEXT NOT NULL DEFAULT '{"sections":["video","image","audio"],"modelIds":[],"dailyLimitRub":null,"maxConcurrentJobs":3}'
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_env_admin_unique" ON "user" ("is_env_admin") WHERE "is_env_admin" = 1;

CREATE TABLE IF NOT EXISTS "session" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "token" TEXT NOT NULL UNIQUE,
  "expires_at" INTEGER NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session"("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "account_id" TEXT NOT NULL,
  "provider_id" TEXT NOT NULL,
  "password" TEXT,
  "access_token" TEXT,
  "refresh_token" TEXT,
  "id_token" TEXT,
  "access_token_expires_at" INTEGER,
  "refresh_token_expires_at" INTEGER,
  "scope" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account"("user_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "identifier" TEXT NOT NULL,
  "value" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification"("identifier");

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE RESTRICT,
  "actor_id" TEXT REFERENCES "user"("id") ON DELETE RESTRICT,
  "job_id" TEXT,
  "amount_rub" TEXT NOT NULL,
  "balance_before_rub" TEXT NOT NULL,
  "balance_after_rub" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "reason" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL UNIQUE,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "transactions_user_created_idx" ON "transactions"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "admin_audit" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "actor_id" TEXT,
  "target_id" TEXT,
  "action" TEXT NOT NULL,
  "details" TEXT NOT NULL DEFAULT '{}',
  "request_id" TEXT,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "admin_audit_created_idx" ON "admin_audit"("created_at");

CREATE TABLE IF NOT EXISTS "invitation" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL REFERENCES "user"("id") ON DELETE CASCADE,
  "token_hash" TEXT NOT NULL UNIQUE,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS "invitation_user_unique" ON "invitation"("user_id");

CREATE TABLE IF NOT EXISTS "rate_limit" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "key" TEXT NOT NULL UNIQUE,
  "count" INTEGER NOT NULL DEFAULT 0,
  "last_request" INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS "syntx_chats" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "tab" TEXT NOT NULL,
  "is_favorite" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()),
  "deleted_at" INTEGER
);
CREATE INDEX IF NOT EXISTS "syntx_chats_owner_idx" ON "syntx_chats"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "syntx_quotes" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "estimated_cost_rub" TEXT NOT NULL,
  "max_cost_rub" TEXT NOT NULL,
  "catalog_snapshot" TEXT NOT NULL,
  "expires_at" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "syntx_quotes_owner_idx" ON "syntx_quotes"("user_id");

CREATE TABLE IF NOT EXISTS "syntx_jobs" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "chat_id" TEXT NOT NULL,
  "quote_id" TEXT NOT NULL,
  "idempotency_key" TEXT NOT NULL,
  "request_hash" TEXT NOT NULL,
  "tab" TEXT NOT NULL,
  "model_id" TEXT NOT NULL,
  "prompt" TEXT NOT NULL,
  "request" TEXT NOT NULL,
  "catalog_snapshot" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'queued',
  "provider_id" TEXT,
  "provider_result" TEXT,
  "estimated_cost_rub" TEXT NOT NULL,
  "max_cost_rub" TEXT NOT NULL,
  "charged_cost_rub" TEXT,
  "provider_cost_rub" TEXT,
  "variance_rub" TEXT,
  "pricing_source" TEXT,
  "error" TEXT,
  "submitted_at" INTEGER,
  "settled_at" INTEGER,
  "lease_token" TEXT,
  "leased_until" INTEGER,
  "poll_at" INTEGER NOT NULL DEFAULT (unixepoch()),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch()),
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS "syntx_jobs_idempotency_idx" ON "syntx_jobs"("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "syntx_jobs_quote_idx" ON "syntx_jobs"("quote_id");
CREATE INDEX IF NOT EXISTS "syntx_jobs_queue_idx" ON "syntx_jobs"("status", "poll_at");
CREATE INDEX IF NOT EXISTS "syntx_jobs_owner_idx" ON "syntx_jobs"("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "syntx_files" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "user_id" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE INDEX IF NOT EXISTS "syntx_files_owner_idx" ON "syntx_files"("user_id");

CREATE TABLE IF NOT EXISTS "syntx_artifacts" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "job_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "ordinal" INTEGER NOT NULL,
  "storage_key" TEXT NOT NULL,
  "mime_type" TEXT NOT NULL,
  "size_bytes" INTEGER NOT NULL,
  "created_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
CREATE UNIQUE INDEX IF NOT EXISTS "syntx_artifacts_job_idx" ON "syntx_artifacts"("job_id", "ordinal");
CREATE INDEX IF NOT EXISTS "syntx_artifacts_owner_idx" ON "syntx_artifacts"("user_id");

CREATE TABLE IF NOT EXISTS "syntx_catalog" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "data" TEXT NOT NULL,
  "verified_at" INTEGER NOT NULL DEFAULT (unixepoch())
);

CREATE TABLE IF NOT EXISTS "syntx_worker_heartbeats" (
  "id" TEXT PRIMARY KEY NOT NULL,
  "updated_at" INTEGER NOT NULL DEFAULT (unixepoch())
);
`;

export const POSTGRES_INIT_DDL = `
CREATE TABLE IF NOT EXISTS "user" (
  "id" text PRIMARY KEY NOT NULL,
  "name" text NOT NULL,
  "email" text NOT NULL UNIQUE,
  "email_verified" boolean DEFAULT false NOT NULL,
  "image" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL,
  "username" text UNIQUE,
  "display_username" text,
  "role" text DEFAULT 'user' NOT NULL,
  "balance_rub" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "reserved_rub" numeric(12, 2) DEFAULT '0.00' NOT NULL,
  "is_approved" boolean DEFAULT true NOT NULL,
  "is_banned" boolean DEFAULT false NOT NULL,
  "is_env_admin" boolean DEFAULT false NOT NULL,
  "activated_at" timestamp with time zone,
  "permissions" jsonb DEFAULT '{"sections":["video","image","audio"],"modelIds":[],"dailyLimitRub":null,"maxConcurrentJobs":3}'::jsonb NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_env_admin_unique" ON "user" ("is_env_admin") WHERE "is_env_admin" = true;

CREATE TABLE IF NOT EXISTS "session" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "token" text NOT NULL UNIQUE,
  "expires_at" timestamp NOT NULL,
  "ip_address" text,
  "user_agent" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "session_userId_idx" ON "session" ("user_id");

CREATE TABLE IF NOT EXISTS "account" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "account_id" text NOT NULL,
  "provider_id" text NOT NULL,
  "password" text,
  "access_token" text,
  "refresh_token" text,
  "id_token" text,
  "access_token_expires_at" timestamp,
  "refresh_token_expires_at" timestamp,
  "scope" text,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "account_userId_idx" ON "account" ("user_id");

CREATE TABLE IF NOT EXISTS "verification" (
  "id" text PRIMARY KEY NOT NULL,
  "identifier" text NOT NULL,
  "value" text NOT NULL,
  "expires_at" timestamp NOT NULL,
  "created_at" timestamp DEFAULT now() NOT NULL,
  "updated_at" timestamp DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "verification_identifier_idx" ON "verification" ("identifier");

CREATE TABLE IF NOT EXISTS "transactions" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE restrict,
  "actor_id" text REFERENCES "user"("id") ON DELETE restrict,
  "job_id" text,
  "amount_rub" numeric(12, 2) NOT NULL,
  "balance_before_rub" numeric(12, 2) NOT NULL,
  "balance_after_rub" numeric(12, 2) NOT NULL,
  "type" text NOT NULL,
  "reason" text NOT NULL,
  "idempotency_key" text NOT NULL UNIQUE,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "transactions_user_created_idx" ON "transactions" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "admin_audit" (
  "id" text PRIMARY KEY NOT NULL,
  "actor_id" text,
  "target_id" text,
  "action" text NOT NULL,
  "details" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "request_id" text,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "admin_audit_created_idx" ON "admin_audit" ("created_at");

CREATE TABLE IF NOT EXISTS "invitation" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL REFERENCES "user"("id") ON DELETE cascade,
  "token_hash" text NOT NULL UNIQUE,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "invitation_user_unique" ON "invitation" ("user_id");

CREATE TABLE IF NOT EXISTS "rate_limit" (
  "id" text PRIMARY KEY NOT NULL,
  "key" text NOT NULL UNIQUE,
  "count" integer DEFAULT 0 NOT NULL,
  "last_request" bigint NOT NULL
);

CREATE TABLE IF NOT EXISTS "syntx_chats" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "tab" text NOT NULL,
  "is_favorite" boolean DEFAULT false NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "deleted_at" timestamp with time zone
);
CREATE INDEX IF NOT EXISTS "syntx_chats_owner_idx" ON "syntx_chats" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "syntx_quotes" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "request_hash" text NOT NULL,
  "estimated_cost_rub" numeric(12, 2) NOT NULL,
  "max_cost_rub" numeric(12, 2) NOT NULL,
  "catalog_snapshot" jsonb NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "syntx_quotes_owner_idx" ON "syntx_quotes" ("user_id");

CREATE TABLE IF NOT EXISTS "syntx_jobs" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "chat_id" text NOT NULL,
  "quote_id" text NOT NULL,
  "idempotency_key" text NOT NULL,
  "request_hash" text NOT NULL,
  "tab" text NOT NULL,
  "model_id" text NOT NULL,
  "prompt" text NOT NULL,
  "request" jsonb NOT NULL,
  "catalog_snapshot" jsonb NOT NULL,
  "status" text DEFAULT 'queued' NOT NULL,
  "provider_id" text,
  "provider_result" jsonb,
  "estimated_cost_rub" numeric(12, 2) NOT NULL,
  "max_cost_rub" numeric(12, 2) NOT NULL,
  "charged_cost_rub" numeric(12, 2),
  "provider_cost_rub" numeric(12, 2),
  "variance_rub" numeric(12, 2),
  "pricing_source" text,
  "error" text,
  "submitted_at" timestamp with time zone,
  "settled_at" timestamp with time zone,
  "lease_token" text,
  "leased_until" timestamp with time zone,
  "poll_at" timestamp with time zone DEFAULT now() NOT NULL,
  "attempts" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "syntx_jobs_idempotency_idx" ON "syntx_jobs" ("user_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "syntx_jobs_quote_idx" ON "syntx_jobs" ("quote_id");
CREATE INDEX IF NOT EXISTS "syntx_jobs_queue_idx" ON "syntx_jobs" ("status", "poll_at");
CREATE INDEX IF NOT EXISTS "syntx_jobs_owner_idx" ON "syntx_jobs" ("user_id", "created_at");

CREATE TABLE IF NOT EXISTS "syntx_files" (
  "id" text PRIMARY KEY NOT NULL,
  "user_id" text NOT NULL,
  "filename" text NOT NULL,
  "storage_key" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE INDEX IF NOT EXISTS "syntx_files_owner_idx" ON "syntx_files" ("user_id");

CREATE TABLE IF NOT EXISTS "syntx_artifacts" (
  "id" text PRIMARY KEY NOT NULL,
  "job_id" text NOT NULL,
  "user_id" text NOT NULL,
  "ordinal" integer NOT NULL,
  "storage_key" text NOT NULL,
  "mime_type" text NOT NULL,
  "size_bytes" integer NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS "syntx_artifacts_job_idx" ON "syntx_artifacts" ("job_id", "ordinal");
CREATE INDEX IF NOT EXISTS "syntx_artifacts_owner_idx" ON "syntx_artifacts" ("user_id");

CREATE TABLE IF NOT EXISTS "syntx_catalog" (
  "id" text PRIMARY KEY NOT NULL,
  "data" jsonb NOT NULL,
  "verified_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE TABLE IF NOT EXISTS "syntx_worker_heartbeats" (
  "id" text PRIMARY KEY NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
`;
