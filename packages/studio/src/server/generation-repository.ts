import { auth as triggerAuth, runs } from "@trigger.dev/sdk";
import { and, desc, eq, inArray, isNull, notInArray } from "drizzle-orm";
import { pgTable, text } from "drizzle-orm/pg-core";

import type { RunpodConfig, StudioConfig } from "../config/types";
import type { GenerationStatus } from "../schema/generation";
import { createGenerationTable } from "../schema/generation";

const placeholderUserTable = pgTable("user", { id: text("id").primaryKey() });
const generationTable = createGenerationTable(() => placeholderUserTable.id);

const ACTIVE_STATUSES: GenerationStatus[] = [
  "preparing",
  "queued",
  "generating",
  "post_processing",
];
const ACTIVE_STATUS_SET = new Set<string>(ACTIVE_STATUSES);
const TERMINAL_STATUSES: GenerationStatus[] = [
  "completed",
  "failed",
  "cancelled",
];
const TERMINAL_STATUS_SET = new Set(TERMINAL_STATUSES);
const PUBLIC_TOKEN_EXPIRATION = "15m";
const TOKEN_REUSE_MS = 5 * 60 * 1000;

export interface CreateGenerationInput {
  userId: string;
  requestId: string;
  modelId: string;
  prompt: string;
  seed: number;
  loras: string[];
  pose?: string;
  ratio: string;
  resolution: string;
  priceCoins: number;
  mediaType?: "image" | "video";
  sourceGenerationId?: string;
  durationSeconds?: number;
  title?: string;
  queuedAt?: Date;
  status?: GenerationStatus;
}

export interface AttachRunpodJobInput {
  runpodJobId: string;
  prompt: string;
  originalPrompt?: string;
  moderationAction: "allow" | "rewrite";
  moderatedPrompt?: string;
  referenceImageUrl?: string;
  pose?: string;
}

export interface RunMetrics {
  runpodStatus?: string;
  delayTimeMs?: number;
  executionTimeMs?: number;
  workerId?: string;
}

export interface TerminalWin {
  runpodJobId: string | null;
  modelId: string;
}

export interface RealtimeInfo {
  requestIds: string[];
  publicAccessToken: string;
}

export const canTransitionGeneration = (
  from: GenerationStatus,
  to: GenerationStatus
): boolean => {
  if (TERMINAL_STATUS_SET.has(from)) {
    return false;
  }
  if (TERMINAL_STATUS_SET.has(to)) {
    return true;
  }
  const order: GenerationStatus[] = [
    "preparing",
    "queued",
    "generating",
    "post_processing",
  ];
  return order.indexOf(to) > order.indexOf(from);
};

const cancelRunpodJob = async (
  runpod: RunpodConfig,
  modelId: string,
  jobId: string
): Promise<void> => {
  const endpointId = runpod.endpoints[modelId];
  if (!endpointId) {
    throw new Error(`no RunPod endpoint for model "${modelId}"`);
  }
  const response = await fetch(
    `https://api.runpod.ai/v2/${endpointId}/cancel/${jobId}`,
    { headers: { Authorization: `Bearer ${runpod.apiKey}` }, method: "POST" }
  );
  if (!response.ok) {
    throw new Error(`runpod cancel failed: ${response.status}`);
  }
};

export class GenerationRepository {
  readonly #config: StudioConfig;
  readonly #tokenCache = new Map<string, { token: string; mintedAt: number }>();

  constructor(config: StudioConfig) {
    this.#config = config;
  }

  async create(inputs: CreateGenerationInput[]) {
    const rows = await this.#config.db
      .insert(generationTable)
      .values(inputs)
      .returning();
    const userId = inputs[0]?.userId;
    const firstId = rows[0]?.id;
    if (userId && firstId) {
      await this.#config.notify?.({
        generationId: firstId,
        type: "created",
        userId,
      });
    }
    return rows;
  }

  async list(userId: string) {
    return await this.#config.db
      .select()
      .from(generationTable)
      .where(
        and(
          eq(generationTable.userId, userId),
          isNull(generationTable.deletedAt)
        )
      )
      .orderBy(desc(generationTable.createdAt));
  }

  async getOwned(userId: string, id: string) {
    const [row] = await this.#config.db
      .select()
      .from(generationTable)
      .where(
        and(eq(generationTable.userId, userId), eq(generationTable.id, id))
      );
    return row;
  }

  async attachRunpodJob(
    userId: string,
    id: string,
    input: AttachRunpodJobInput
  ): Promise<boolean> {
    const updated = await this.#config.db
      .update(generationTable)
      .set(input)
      .where(
        and(
          eq(generationTable.userId, userId),
          eq(generationTable.id, id),
          inArray(generationTable.status, ["preparing", "queued"])
        )
      )
      .returning({ id: generationTable.id });
    return updated.length > 0;
  }

  async markGenerating(userId: string, id: string): Promise<boolean> {
    const updated = await this.#config.db
      .update(generationTable)
      .set({ status: "generating" })
      .where(
        and(
          eq(generationTable.userId, userId),
          eq(generationTable.id, id),
          inArray(generationTable.status, ["preparing", "queued"])
        )
      )
      .returning({ id: generationTable.id });
    return updated.length > 0;
  }

  async markManyQueued(userId: string, ids: string[]): Promise<void> {
    await this.#config.db
      .update(generationTable)
      .set({ queuedAt: new Date(), status: "queued" })
      .where(
        and(
          eq(generationTable.userId, userId),
          inArray(generationTable.id, ids),
          eq(generationTable.status, "preparing")
        )
      );
  }

  async markPostProcessing(userId: string, id: string): Promise<boolean> {
    const updated = await this.#config.db
      .update(generationTable)
      .set({ status: "post_processing" })
      .where(
        and(
          eq(generationTable.userId, userId),
          eq(generationTable.id, id),
          eq(generationTable.status, "generating")
        )
      )
      .returning({ id: generationTable.id });
    return updated.length > 0;
  }

  async markCompleted(
    userId: string,
    id: string,
    resultUrls: string[],
    metrics?: RunMetrics
  ): Promise<TerminalWin | undefined> {
    return await this.#setTerminal(userId, id, {
      resultUrls,
      status: "completed",
      ...metrics,
    });
  }

  async markFailed(
    userId: string,
    id: string,
    error: string,
    metrics?: RunMetrics
  ): Promise<TerminalWin | undefined> {
    return await this.#setTerminal(userId, id, {
      error,
      status: "failed",
      ...metrics,
    });
  }

  async markManyFailed(userId: string, ids: string[], error: string) {
    await this.#config.db
      .update(generationTable)
      .set({ error, resultUrls: [], status: "failed" })
      .where(
        and(
          eq(generationTable.userId, userId),
          inArray(generationTable.id, ids),
          inArray(generationTable.status, ACTIVE_STATUSES)
        )
      );
  }

  async setTitles(userId: string, ids: string[], title: string): Promise<void> {
    await this.#config.db
      .update(generationTable)
      .set({ title })
      .where(
        and(
          eq(generationTable.userId, userId),
          inArray(generationTable.id, ids)
        )
      );
  }

  async cancel(userId: string, ids: string[]): Promise<void> {
    const active = await this.#config.db
      .select({ id: generationTable.id })
      .from(generationTable)
      .where(
        and(
          eq(generationTable.userId, userId),
          inArray(generationTable.id, ids),
          inArray(generationTable.status, ACTIVE_STATUSES),
          isNull(generationTable.deletedAt)
        )
      );
    await Promise.all(active.map((row) => this.#cancelOne(userId, row.id)));
  }

  async softDelete(userId: string, ids: string[]): Promise<string[]> {
    const deleted = await this.#config.db
      .update(generationTable)
      .set({ deletedAt: new Date() })
      .where(
        and(
          eq(generationTable.userId, userId),
          inArray(generationTable.id, ids),
          notInArray(generationTable.status, ACTIVE_STATUSES),
          isNull(generationTable.deletedAt)
        )
      )
      .returning({ id: generationTable.id });
    return deleted.map((row) => row.id);
  }

  async realtimeInfo(
    rows: { status: string; requestId: string | null }[]
  ): Promise<RealtimeInfo | null> {
    const requestIds = [
      ...new Set(
        rows.flatMap((row) =>
          ACTIVE_STATUS_SET.has(row.status) && row.requestId
            ? [row.requestId]
            : []
        )
      ),
    ];
    if (requestIds.length === 0) {
      return null;
    }
    const cacheKey = requestIds.toSorted().join(",");
    const cached = this.#tokenCache.get(cacheKey);
    if (cached && Date.now() - cached.mintedAt < TOKEN_REUSE_MS) {
      return { publicAccessToken: cached.token, requestIds };
    }
    const publicAccessToken = await triggerAuth.createPublicToken({
      expirationTime: PUBLIC_TOKEN_EXPIRATION,
      scopes: { read: { tags: requestIds.map((id) => `req_${id}`) } },
    });
    const now = Date.now();
    for (const [key, entry] of this.#tokenCache) {
      if (now - entry.mintedAt >= TOKEN_REUSE_MS) {
        this.#tokenCache.delete(key);
      }
    }
    this.#tokenCache.set(cacheKey, { mintedAt: now, token: publicAccessToken });
    return { publicAccessToken, requestIds };
  }

  async #setTerminal(
    userId: string,
    id: string,
    patch: RunMetrics & {
      status: "completed" | "failed";
      resultUrls?: string[];
      error?: string;
    }
  ): Promise<TerminalWin | undefined> {
    const [updated] = await this.#config.db
      .update(generationTable)
      .set({ error: null, resultUrls: [], ...patch })
      .where(
        and(
          eq(generationTable.userId, userId),
          eq(generationTable.id, id),
          inArray(generationTable.status, ACTIVE_STATUSES)
        )
      )
      .returning({
        modelId: generationTable.modelId,
        runpodJobId: generationTable.runpodJobId,
      });
    return updated;
  }

  async #cancelOne(userId: string, id: string): Promise<void> {
    try {
      for await (const run of runs.list({ tag: [`gen_${id}`] })) {
        if (!(run.isCompleted || run.isCancelled)) {
          await runs.cancel(run.id);
        }
      }
    } catch (error) {
      console.error("trigger run cancel failed", { error, id });
    }
    const [won] = await this.#config.db
      .update(generationTable)
      .set({ error: null, resultUrls: [], status: "cancelled" })
      .where(
        and(
          eq(generationTable.userId, userId),
          eq(generationTable.id, id),
          inArray(generationTable.status, ACTIVE_STATUSES)
        )
      )
      .returning({
        modelId: generationTable.modelId,
        runpodJobId: generationTable.runpodJobId,
      });
    if (!won?.runpodJobId) {
      return;
    }
    await this.#config.billing.refund(userId, won.runpodJobId);
    try {
      await cancelRunpodJob(this.#config.runpod, won.modelId, won.runpodJobId);
    } catch (error) {
      console.error("runpod cancel failed", { error, id });
    }
  }
}
