import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { pool } from "@/lib/db";
import { downloadMedia } from "@/lib/media/download";
import {
  ensureMediaStorage,
  ensureMediaCapacity,
  imageMime,
  readMedia,
  saveMedia,
} from "@/lib/media/storage";
import { limitedBody, routerai, RouterAIError } from "@/lib/routerai/client";
import type { VideoGenerateRequest } from "@/lib/routerai/types";
import { ApiError } from "@/lib/security/http";

import { catalogModels, syncCatalog } from "./catalog";
import { referencedFileIds, localReferenceId, referenceId } from "./contracts";
import type {
  JobRow,
  JobState,
  StoredProviderResult,
  FileRow,
  WalletRow,
} from "./rows";
import { assertAccountAccess } from "./service";
import { settleJob } from "./settlement";

const workerId = randomUUID();
let currentLease: { id: string; token: string } | undefined;
let lastCatalogSync = 0;

type Job = JobRow;
const heartbeat = async () => {
  await pool.query(
    "INSERT INTO syntx_worker_heartbeats (id,updated_at) VALUES ($1,now()) ON CONFLICT(id) DO UPDATE SET updated_at=now()",
    [workerId]
  );
  if (currentLease) {
    await pool.query(
      "UPDATE syntx_jobs SET leased_until=now()+interval '120 seconds' WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL",
      [currentLease.id, currentLease.token]
    );
  }
};
export const workerHeartbeatIsHealthy = async (): Promise<boolean> => {
  const result = await pool.query(
    "SELECT 1 FROM syntx_worker_heartbeats WHERE updated_at>now()-interval '90 seconds' LIMIT 1"
  );
  return Boolean(result.rowCount);
};

const claimJob = async (): Promise<Job | null> => {
  // An expired paid submission is never retried: it may already have been accepted.
  await pool.query(
    "UPDATE syntx_jobs SET status='reconciling',error='Не удалось подтвердить отправку провайдеру. Резерв сохранён до сверки.',lease_token=NULL,leased_until=NULL,updated_at=now() WHERE status='submitting' AND leased_until<now() AND settled_at IS NULL"
  );
  const token = randomUUID();
  const result = await pool.query<JobRow>(
    `UPDATE syntx_jobs SET lease_token=$1,leased_until=now()+interval '120 seconds',attempts=attempts+1
    WHERE id=(SELECT id FROM syntx_jobs WHERE status IN ('queued','running','persisting') AND settled_at IS NULL
      AND poll_at<=now() AND (leased_until IS NULL OR leased_until<now()) ORDER BY poll_at,created_at FOR UPDATE SKIP LOCKED LIMIT 1) RETURNING *`,
    [token]
  );
  return result.rows[0] ?? null;
};

const recordProvider = async (
  job: Job,
  result: StoredProviderResult,
  status: JobState,
  providerId?: string
) => {
  const changed = await pool.query(
    "UPDATE syntx_jobs SET provider_result=$3,status=$4,provider_id=coalesce($5,provider_id),updated_at=now() WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL",
    [
      job.id,
      job.lease_token,
      JSON.stringify(result),
      status,
      providerId ?? null,
    ]
  );
  if (!changed.rowCount) {
    throw new Error("Job lease was lost");
  }
  job.provider_result = result;
  job.status = status;
  job.provider_id = providerId ?? job.provider_id;
};
const markReconciling = async (job: Job) => {
  await pool.query(
    "UPDATE syntx_jobs SET status='reconciling',error='Результат запроса не подтверждён. Средства остаются в резерве до сверки.',lease_token=NULL,leased_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL",
    [job.id, job.lease_token]
  );
  console.error(
    JSON.stringify({ event: "generation.reconciling", jobId: job.id })
  );
};
const retryLater = async (job: Job) => {
  await pool.query(
    "UPDATE syntx_jobs SET poll_at=now()+interval '10 seconds',lease_token=NULL,leased_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL",
    [job.id, job.lease_token]
  );
};

const prepareReferences = async (job: Job) => {
  const { request } = job;
  const ids = referencedFileIds(request.settings);
  const queryResult1 = await pool.query<
    Pick<FileRow, "id" | "storage_key" | "mime_type">
  >(
    "SELECT id,storage_key,mime_type FROM syntx_files WHERE user_id=$1 AND id=ANY($2::text[])",
    [job.user_id, ids]
  );
  const rows = ids.length ? queryResult1.rows : [];
  const dataById = new Map<string, string>();
  for (const row of rows) {
    const queryResult2 = await readMedia(row.storage_key);
    dataById.set(
      row.id,
      `data:${row.mime_type};base64,${queryResult2.toString("base64")}`
    );
  }
  if (new Set(ids).size !== dataById.size) {
    throw new ApiError(404, "Референс недоступен");
  }
  const urlFor = (id: string): string => {
    const data = dataById.get(id);
    if (!data) {
      throw new ApiError(404, "Референс недоступен");
    }
    return data;
  };
  return {
    frames: (request.settings.frameImages ?? []).map((frame) => ({
      ...frame,
      image_url: { url: urlFor(localReferenceId(frame.image_url.url)) },
    })),
    input: (request.settings.inputReferences ?? []).map((ref) => ({
      image_url: {
        url: urlFor(referenceId(ref)),
      },
      type: "image_url" as const,
    })),
  };
};

const authorizeSubmission = async (job: Job) => {
  const models = await catalogModels();
  if (!models.some((m) => m.id === job.model_id && m.enabled)) {
    throw new ApiError(422, "Модель временно недоступна");
  }
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const queryResult3 = await client.query<WalletRow>(
      'SELECT * FROM "user" WHERE id=$1 FOR UPDATE',
      [job.user_id]
    );
    const [owner] = queryResult3.rows;
    if (!owner) {
      throw new ApiError(403, "Пользователь недоступен");
    }
    assertAccountAccess(owner, job.tab, job.model_id);
    const changed = await client.query(
      "UPDATE syntx_jobs SET status='submitting',submitted_at=now(),updated_at=now() WHERE id=$1 AND lease_token=$2 AND status='queued' RETURNING id",
      [job.id, job.lease_token]
    );
    if (!changed.rowCount) {
      throw new Error("Job lease was lost");
    }
    await client.query("COMMIT");
    job.status = "submitting";
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

const submit = async (job: Job) => {
  const { settings, prompt, modelId } = job.request;
  await ensureMediaCapacity();
  const references = await prepareReferences(job);
  await authorizeSubmission(job);
  if (job.tab === "video") {
    const payload: VideoGenerateRequest = {
      aspect_ratio: settings.aspectRatio,
      duration: settings.duration,
      frame_images: references.frames.length ? references.frames : undefined,
      generate_audio: settings.generateAudio,
      input_references: references.input.length ? references.input : undefined,
      model: modelId,
      negative_prompt: settings.negativePrompt,
      prompt,
      resolution: settings.resolution,
      seed: settings.seed,
    };
    if (settings.heygenVoiceId) {
      payload.provider = {
        options: { heygen: { voice_id: settings.heygenVoiceId } },
      };
    }
    const result = await routerai.generateVideo(payload);
    await recordProvider(job, result, "running", result.id);
  } else if (job.tab === "image") {
    const result = await routerai.generateImage({
      aspect_ratio: settings.aspectRatio,
      background: settings.background,
      input_references: references.input.length ? references.input : undefined,
      model: modelId,
      n: settings.n,
      output_format: settings.outputFormat,
      prompt,
      quality: settings.quality,
      resolution: settings.resolution,
      seed: settings.seed,
    });
    await recordProvider(job, result, "persisting", result.generationId);
  } else {
    if (!settings.voiceId) {
      throw new ApiError(422, "Голос не выбран");
    }
    const result = await routerai.generateSpeech({
      input: prompt,
      model: modelId,
      response_format: "mp3",
      voice: settings.voiceId,
    });
    await recordProvider(job, result, "persisting", result.generationId);
  }
};

const persistArtifact = async (
  job: Job,
  ordinal: number,
  bytes: Buffer,
  mime: string
) => {
  if (
    job.tab === "image" &&
    mime !== "image/svg+xml" &&
    imageMime(bytes) !== mime
  ) {
    throw new Error("Invalid provider image content");
  }
  const key = await saveMedia(bytes, job.id, String(ordinal));
  await pool.query(
    "INSERT INTO syntx_artifacts (id,job_id,user_id,ordinal,storage_key,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(job_id,ordinal) DO UPDATE SET storage_key=excluded.storage_key,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes",
    [randomUUID(), job.id, job.user_id, ordinal, key, mime, bytes.length]
  );
};
const persistResult = async (job: Job) => {
  const result = job.provider_result;
  if (!result) {
    throw new Error("Provider result is missing");
  }
  if (job.tab === "video") {
    const response = result;
    const count = Math.max(1, Math.min(4, response.unsigned_urls?.length ?? 1));
    for (let i = 0; i < count; i += 1) {
      const queryResult4 = await pool.query(
        "SELECT id FROM syntx_artifacts WHERE job_id=$1 AND ordinal=$2",
        [job.id, i]
      );
      if (queryResult4.rowCount) {
        continue;
      }
      const content = await routerai.getVideoContent(job.provider_id ?? "", i);
      await persistArtifact(job, i, await limitedBody(content), "video/mp4");
    }
    await settleJob({
      jobId: job.id,
      leaseToken: job.lease_token ?? undefined,
      providerCost: response.usage?.cost,
      status: "completed",
    });
  } else {
    if (
      !Array.isArray(result.urls) ||
      !result.urls.length ||
      result.urls.length > 4
    ) {
      throw new Error("Invalid provider outputs");
    }
    for (const [i, source] of result.urls.entries()) {
      const queryResult5 = await pool.query(
        "SELECT id FROM syntx_artifacts WHERE job_id=$1 AND ordinal=$2",
        [job.id, i]
      );
      if (queryResult5.rowCount) {
        continue;
      }
      const { bytes, mime } = await downloadMedia(source);
      await persistArtifact(job, i, bytes, mime);
    }
    await settleJob({
      jobId: job.id,
      leaseToken: job.lease_token ?? undefined,
      providerCost: result.cost,
      status: "completed",
    });
  }
};

let lastMaintenance = 0;
const runMaintenance = async () => {
  if (Date.now() - lastMaintenance < 15 * 60_000) {
    return;
  }
  lastMaintenance = Date.now();
  try {
    await pool.query(
      "DELETE FROM syntx_quotes WHERE expires_at<now() AND NOT EXISTS (SELECT 1 FROM syntx_jobs WHERE syntx_jobs.quote_id=syntx_quotes.id)"
    );
    await pool.query("DELETE FROM invitation WHERE expires_at<now()");
    await pool.query("DELETE FROM rate_limit WHERE last_request<$1", [
      Date.now() - 24 * 60 * 60_000,
    ]);
    await pool.query(
      "DELETE FROM syntx_worker_heartbeats WHERE updated_at<now()-interval '1 day'"
    );
  } catch {
    console.error(JSON.stringify({ event: "worker.maintenance_failed" }));
  }
};

const refreshCatalogIfNeeded = async () => {
  if (Date.now() - lastCatalogSync > 15 * 60_000) {
    try {
      await syncCatalog();
      lastCatalogSync = Date.now();
    } catch {
      console.error(JSON.stringify({ event: "catalog.sync_failed" }));
      lastCatalogSync = Date.now() - 14 * 60_000;
    }
  }
};

const handleJobError = async (job: Job, error: Error) => {
  if (
    job.status === "queued" ||
    (error instanceof RouterAIError &&
      !error.uncertain &&
      job.status === "submitting")
  ) {
    await settleJob({
      jobId: job.id,
      leaseToken: job.lease_token ?? undefined,
      reason:
        error instanceof ApiError || error instanceof RouterAIError
          ? error.message
          : "Не удалось подготовить запрос генерации",
      status: "failed",
    });
  } else if (job.status === "submitting") {
    await markReconciling(job);
  } else if (job.status === "running" || job.status === "persisting") {
    // GET/download/storage retries are safe. A reservation never expires with a browser timeout.
    const exhausted =
      job.attempts > 500 ||
      Date.now() - new Date(job.created_at).getTime() > 7 * 24 * 60 * 60_000;
    await (exhausted ? markReconciling(job) : retryLater(job));
  } else {
    throw error;
  }
};

export const workerTick = async (): Promise<number> => {
  await heartbeat();
  await runMaintenance();
  await refreshCatalogIfNeeded();
  const job = await claimJob();
  if (!job) {
    return 0;
  }
  currentLease = { id: job.id, token: job.lease_token ?? "" };
  try {
    if (job.status === "queued") {
      await submit(job);
    }
    if (job.status === "running") {
      const status = await routerai.getVideoStatus(job.provider_id ?? "");
      if (["failed", "cancelled", "expired"].includes(status.status)) {
        await settleJob({
          jobId: job.id,
          leaseToken: job.lease_token ?? undefined,
          providerCost: status.usage?.cost,
          reason: "Провайдер подтвердил отказ генерации",
          status: "failed",
        });
        return 1;
      }
      if (status.status === "completed") {
        await recordProvider(
          job,
          status,
          "persisting",
          job.provider_id ?? undefined
        );
      } else {
        await retryLater(job);
        return 1;
      }
    }
    if (job.status === "persisting") {
      await persistResult(job);
    }
  } catch (error) {
    await handleJobError(
      job,
      error instanceof Error ? error : new Error("Worker operation failed")
    );
    console.error(
      JSON.stringify({
        event: "generation.worker_retry",
        jobId: job.id,
        state: job.status,
      })
    );
  } finally {
    currentLease = undefined;
  }
  return 1;
};

export const runWorker = async (
  options: { signal?: AbortSignal; pollIntervalMs?: number } = {}
): Promise<void> => {
  await ensureMediaStorage();
  await heartbeat();
  const keepalive = setInterval(async () => {
    try {
      await heartbeat();
    } catch {
      console.error(JSON.stringify({ event: "worker.heartbeat_failed" }));
    }
  }, 15_000);
  try {
    while (!options.signal?.aborted) {
      try {
        const worked = await workerTick();
        if (!worked) {
          await delay(options.pollIntervalMs ?? 2000, undefined, {
            signal: options.signal,
          });
        }
      } catch {
        if (options.signal?.aborted) {
          break;
        }
        console.error(JSON.stringify({ event: "worker.tick_failed" }));
        try {
          await delay(options.pollIntervalMs ?? 2000, undefined, {
            signal: options.signal,
          });
        } catch {
          if (options.signal?.aborted) {
            break;
          }
          throw new Error("Worker delay interrupted");
        }
      }
    }
  } finally {
    clearInterval(keepalive);
    await pool.query("DELETE FROM syntx_worker_heartbeats WHERE id=$1", [
      workerId,
    ]);
  }
};
