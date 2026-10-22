CREATE TABLE "admin_audit" (
	"id" text PRIMARY KEY NOT NULL,
	"actor_id" text,
	"target_id" text,
	"action" text NOT NULL,
	"details" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"request_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "invitation" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invitation_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "rate_limit" (
	"id" text PRIMARY KEY NOT NULL,
	"key" text NOT NULL,
	"count" integer DEFAULT 0 NOT NULL,
	"last_request" bigint NOT NULL,
	CONSTRAINT "rate_limit_key_unique" UNIQUE("key")
);
--> statement-breakpoint
CREATE TABLE "transactions" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"actor_id" text,
	"job_id" text,
	"amount_rub" numeric(12, 2) NOT NULL,
	"type" text NOT NULL,
	"reason" text NOT NULL,
	"balance_before_rub" numeric(12, 2) NOT NULL,
	"balance_after_rub" numeric(12, 2) NOT NULL,
	"idempotency_key" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transactions_idempotency_key_unique" UNIQUE("idempotency_key")
);
--> statement-breakpoint
CREATE TABLE "syntx_artifacts" (
	"id" text PRIMARY KEY NOT NULL,
	"job_id" text NOT NULL,
	"user_id" text NOT NULL,
	"ordinal" integer NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syntx_catalog" (
	"id" text PRIMARY KEY NOT NULL,
	"data" jsonb NOT NULL,
	"verified_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syntx_chats" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"title" text NOT NULL,
	"tab" text NOT NULL,
	"is_favorite" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "syntx_files" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"filename" text NOT NULL,
	"storage_key" text NOT NULL,
	"mime_type" text NOT NULL,
	"size_bytes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syntx_jobs" (
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
--> statement-breakpoint
CREATE TABLE "syntx_quotes" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" text NOT NULL,
	"request_hash" text NOT NULL,
	"estimated_cost_rub" numeric(12, 2) NOT NULL,
	"max_cost_rub" numeric(12, 2) NOT NULL,
	"catalog_snapshot" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "syntx_worker_heartbeats" (
	"id" text PRIMARY KEY NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "display_username" text;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "role" text DEFAULT 'user' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "balance_rub" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "reserved_rub" numeric(12, 2) DEFAULT '0.00' NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_approved" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_banned" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "is_env_admin" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "permissions" jsonb DEFAULT '{"sections":[],"modelIds":[],"dailyLimitRub":"0.00","maxConcurrentJobs":1}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "invitation" ADD CONSTRAINT "invitation_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_actor_id_user_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "admin_audit_created_idx" ON "admin_audit" USING btree ("created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_user_unique" ON "invitation" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "transactions_user_created_idx" ON "transactions" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "syntx_artifacts_job_idx" ON "syntx_artifacts" USING btree ("job_id","ordinal");--> statement-breakpoint
CREATE INDEX "syntx_artifacts_owner_idx" ON "syntx_artifacts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "syntx_chats_owner_idx" ON "syntx_chats" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "syntx_files_owner_idx" ON "syntx_files" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "syntx_jobs_idempotency_idx" ON "syntx_jobs" USING btree ("user_id","idempotency_key");--> statement-breakpoint
CREATE UNIQUE INDEX "syntx_jobs_quote_idx" ON "syntx_jobs" USING btree ("quote_id");--> statement-breakpoint
CREATE INDEX "syntx_jobs_queue_idx" ON "syntx_jobs" USING btree ("status","poll_at");--> statement-breakpoint
CREATE INDEX "syntx_jobs_owner_idx" ON "syntx_jobs" USING btree ("user_id","created_at");--> statement-breakpoint
CREATE INDEX "syntx_quotes_owner_idx" ON "syntx_quotes" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_env_admin_unique" ON "user" USING btree ("is_env_admin") WHERE "user"."is_env_admin" = true;--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_username_unique" UNIQUE("username");--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_role_check" CHECK ("user"."role" in ('user', 'vip', 'admin'));--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT "user_balance_check" CHECK ("user"."balance_rub" >= "user"."reserved_rub" and "user"."reserved_rub" >= 0);