// Drizzle table fragment for the `generation` table. The host owns
// its own `user` table (auth), so this is a factory rather than a bare
// `pgTable` export: the host passes a thunk resolving to its user table's
// `id` column, keeping the FK (and thus `drizzle-kit generate`'s diff)
// byte-identical to today's inline definition. Host usage:
//
//   export const generation = createGenerationTable(() => user.id);
//   export const generationRelations = relations(generation, ({ one }) => ({
//     user: one(user, { fields: [generation.userId], references: [user.id] }),
//   }));

import {
  bigint,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";
import type { AnyPgColumn } from "drizzle-orm/pg-core";

export const GENERATION_STATUSES = [
  "preparing",
  "queued",
  "generating",
  "post_processing",
  "completed",
  "failed",
  "cancelled",
] as const;
export type GenerationStatus = (typeof GENERATION_STATUSES)[number];

export const createGenerationTable = (userIdColumn: () => AnyPgColumn) =>
  pgTable(
    "generation",
    {
      createdAt: timestamp("created_at").defaultNow().notNull(),
      // RunPod job metrics, reported on terminal payloads (both success and
      // failure). Null when the payload didn't carry them.
      delayTimeMs: integer("delay_time_ms"),
      // Soft delete — hidden from the gallery but kept for the ledger/audit.
      deletedAt: timestamp("deleted_at"),
      // For video rows: requested clip length; frames = 24fps × this.
      durationSeconds: integer("duration_seconds"),
      error: text("error"),
      executionTimeMs: integer("execution_time_ms"),
      id: uuid("id").defaultRandom().primaryKey(),
      // Enabled predefined LoRA ids at submit time.
      loras: text("loras").array().notNull().default([]),
      // What the row produces: "image" (default) or "video". Video rows reuse
      // the same lifecycle/columns; resultUrls then holds an mp4 URL.
      mediaType: text("media_type").default("image").notNull(),
      modelId: text("model_id").notNull(),
      // Set only when the content-policy gate rewrote the prompt; `prompt`
      // stays what the user submitted, this is what actually ran.
      moderatedPrompt: text("moderated_prompt"),
      // Content-policy gate verdict ("allow" | "rewrite"). A blocked run is
      // marked failed with error "content_policy" and never carries "block"
      // here; null also marks rows created before the gate existed.
      moderationAction: text("moderation_action"),
      // The prompt the user typed, set only when enhancement rewrote it
      // before submit; `prompt` then holds the enhanced text. Null = no
      // enhancement.
      originalPrompt: text("original_prompt"),
      // Pose control: a preset id, or the storage URL of a custom uploaded
      // pose (best-effort, like the reference).
      pose: text("pose"),
      priceCoins: integer("price_coins").notNull(),
      prompt: text("prompt").notNull(),
      // Stamped by the orchestrator once its children are batch-triggered —
      // the row is past the prompt pipeline and waiting for a worker. Null
      // while still preparing, and forever on legacy/failed-early rows.
      queuedAt: timestamp("queued_at"),
      // UI-facing presentation values (RatioKey / ResolutionKey), stored
      // verbatim so a reloaded card renders identically without
      // recomputation.
      ratio: text("ratio").notNull(),
      // Public storage URL of the uploaded reference image. Best-effort: null
      // when no reference was used or its upload failed.
      referenceImageUrl: text("reference_image_url"),
      // Orchestrator batch id — the Trigger.dev run for this row is tagged
      // `req_<requestId>`, so a reloaded page can mint a realtime token scoped
      // to still-pending batches. Null on rows predating the column.
      requestId: text("request_id"),
      resolution: text("resolution").notNull(),
      resultUrls: text("result_urls").array().notNull().default([]),
      // The external RunPod job id. R2 result keys and the coin spend/refund
      // ledger entries are keyed by this value. Null while the background
      // pipeline (enhance → moderate → submit) hasn't submitted the job yet.
      runpodJobId: text("runpod_job_id"),
      // Raw RunPod terminal status (COMPLETED / FAILED / CANCELLED / …),
      // stored verbatim. Null for internal failures (timeout, no_images) and
      // legacy rows.
      runpodStatus: text("runpod_status"),
      // Workflow seed the run was submitted with; server-generated when the
      // client didn't pin one. -1 only on legacy rows (workflow randomized
      // internally, real seed unknown). Null marks rows predating the column.
      seed: bigint("seed", { mode: "number" }),
      // For video rows: the completed image generation the video animates.
      sourceGenerationId: uuid("source_generation_id"),
      // Lifecycle transitions are owned by GenerationRepository. Terminal
      // statuses are sticky.
      status: text("status").default("preparing").notNull(),
      // Short LLM-generated display title (2-4 words, from the user prompt).
      // Best-effort: null when generation failed or for rows predating the
      // feature — the UI falls back to the model name.
      title: text("title"),
      updatedAt: timestamp("updated_at")
        .defaultNow()
        .$onUpdate(() => new Date())
        .notNull(),
      userId: text("user_id")
        .notNull()
        .references(userIdColumn, { onDelete: "cascade" }),
      workerId: text("worker_id"),
    },
    (table) => [
      index("generation_userId_idx").on(table.userId),
      index("generation_runpodJobId_idx").on(table.runpodJobId),
    ]
  );

export type GenerationTable = ReturnType<typeof createGenerationTable>;
