import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";

import { z } from "zod";

import { pool } from "@/lib/db";
import { toIsoDate } from "@/lib/db/date";
import { downloadMedia } from "@/lib/media/download";
import {
  ensureMediaStorage,
  ensureMediaCapacity,
  imageMime,
  MAX_REFERENCE_TOTAL_BYTES,
  readMedia,
  saveMedia,
} from "@/lib/media/storage";
import { limitedBody, routerai, RouterAIError } from "@/lib/routerai/client";
import type { ProviderFailureContext } from "@/lib/routerai/error";
import type { VideoGenerateRequest } from "@/lib/routerai/types";
import { ApiError } from "@/lib/security/http";

import { catalogModels, syncCatalog } from "./catalog";
import { confirmedImageFailure } from "./confirmed-image-failure";
import { mergeUncertainProviderResult } from "./provider-result";
import {
  referencedFileIds,
  localReferenceId,
  referenceId,
  providerAudioSettings,
} from "./contracts";
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
let lastReconciliationSweep = 0;

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
  // A lost POST response does not prove the provider declined the request.
  // Fence the old worker and keep the reserve until its outcome is reconciled.
  await pool.query(
    "UPDATE syntx_jobs SET status='reconciling',error='Не удалось подтвердить результат у провайдера. Резерв сохранён до сверки.',lease_token=NULL,leased_until=NULL,updated_at=now() WHERE status='submitting' AND (leased_until<now() OR (leased_until IS NULL AND submitted_at<now()-interval '5 minutes')) AND settled_at IS NULL"
  );
  const token = randomUUID();
  const result = await pool.query<JobRow>(
    `UPDATE syntx_jobs SET lease_token=$1,leased_until=now()+interval '120 seconds',attempts=attempts+1
    WHERE id=(SELECT id FROM syntx_jobs WHERE
      (status IN ('queued','running','persisting') OR (status='reconciling' AND tab='video' AND provider_id IS NOT NULL))
      AND settled_at IS NULL
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
  console.info(
    JSON.stringify({
      event: "generation.provider_result_recorded",
      jobId: job.id,
      outputCount: result.urls?.length ?? result.unsigned_urls?.length,
      providerId: job.provider_id,
      providerStatus: result.status,
      state: status,
    })
  );
};
const markReconciling = async (job: Job, context?: ProviderFailureContext) => {
  const uncertainContext = mergeUncertainProviderResult(
    job.provider_result,
    context
  );
  await pool.query(
    "UPDATE syntx_jobs SET status='reconciling',error='Результат запроса не подтверждён. Средства остаются в резерве до сверки.',provider_id=coalesce($3,provider_id),provider_result=coalesce($4,provider_result),lease_token=NULL,leased_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL",
    [
      job.id,
      job.lease_token,
      uncertainContext.generationId ?? null,
      JSON.stringify(uncertainContext),
    ]
  );
  console.error(
    JSON.stringify({
      diagnostic: uncertainContext.diagnostic,
      event: "generation.reconciling",
      jobId: job.id,
      modelId: job.model_id,
      providerCostRub: uncertainContext.cost,
      providerId: uncertainContext.generationId ?? job.provider_id,
      tab: job.tab,
    })
  );
};
const providerOutputSchema = z
  .object({
    diagnostic: z
      .object({ outputCount: z.number().int().nonnegative().optional() })
      .passthrough()
      .optional(),
    unsigned_urls: z.array(z.string()).optional(),
    urls: z.array(z.string()).optional(),
  })
  .passthrough();
const serializedProviderOutputSchema = z
  .string()
  .transform((serialized, context) => {
    try {
      return JSON.parse(serialized);
    } catch {
      context.addIssue({ code: "custom", message: "Invalid stored JSON" });
      return z.NEVER;
    }
  })
  .pipe(providerOutputSchema);
const storedProviderOutputSchema = z.union([
  providerOutputSchema,
  serializedProviderOutputSchema,
]);
// SQLite stores JSON as text while PostgreSQL returns JSON objects; both are parsed here.
// oxlint-disable-next-line anti-slop/no-unknown-parameters -- Database JSON is parsed with the schemas above.
export const releaseConfirmedImageFailures = async () => {
  const { rows } = await pool.query<JobRow>(
    `SELECT * FROM syntx_jobs j WHERE j.status='reconciling' AND j.tab='image'
    AND j.settled_at IS NULL AND j.provider_result IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM syntx_artifacts a WHERE a.job_id=j.id)
    ORDER BY j.created_at LIMIT 100`
  );
  for (const job of rows) {
    const failure = confirmedImageFailure(job.provider_result);
    if (!failure) {
      continue;
    }
    await settleJob({
      jobId: job.id,
      providerCost: failure.cost,
      reason:
        "Провайдер подтвердил запрос, но не вернул изображение. Резерв возвращён, списания пользователю нет.",
      status: "failed",
    });
    console.error(
      JSON.stringify({
        endpoint: failure.diagnostic?.endpoint,
        event: "generation.confirmed_without_output_released",
        jobId: job.id,
        providerId: job.provider_id,
        responseStatus: failure.diagnostic?.status,
      })
    );
  }
};
export const releaseExpiredUnconfirmedSubmissions = async () => {
  const { rows } = await pool.query<JobRow>(
    `SELECT * FROM syntx_jobs j WHERE j.status='reconciling'
    AND j.settled_at IS NULL
    AND j.updated_at<now()-interval '15 minutes'
    AND NOT (j.tab='video' AND j.provider_id IS NOT NULL)
    AND NOT EXISTS (SELECT 1 FROM syntx_artifacts a WHERE a.job_id=j.id)
    ORDER BY j.created_at LIMIT 100`
  );
  for (const job of rows) {
    const parsedProviderOutput = storedProviderOutputSchema.safeParse(
      job.provider_result
    );
    let hasProviderOutput = Boolean(job.provider_result);
    if (parsedProviderOutput.success) {
      hasProviderOutput = Boolean(
        parsedProviderOutput.data.urls?.length ||
        parsedProviderOutput.data.unsigned_urls?.length ||
        (parsedProviderOutput.data.diagnostic?.outputCount ?? 0) > 0
      );
    }
    if (
      hasProviderOutput ||
      (job.tab === "video" && Boolean(job.provider_id))
    ) {
      continue;
    }
    await settleJob({
      jobId: job.id,
      reason:
        "Не удалось подтвердить и сохранить результат за 15 минут. Резерв возвращён; повторите генерацию.",
      status: "failed",
    });
    console.warn(
      JSON.stringify({
        event: "generation.unconfirmed_timeout_released",
        jobId: job.id,
        modelId: job.model_id,
        providerId: job.provider_id,
        tab: job.tab,
        waitMinutes: Math.floor(
          (Date.now() - new Date(toIsoDate(job.updated_at)).getTime()) / 60_000
        ),
      })
    );
  }
};
const retryLater = async (job: Job) => {
  await pool.query(
    "UPDATE syntx_jobs SET poll_at=now()+interval '10 seconds',lease_token=NULL,leased_until=NULL,updated_at=now() WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL",
    [job.id, job.lease_token]
  );
};

const pollVideoStatus = async (job: Job) => {
  const statusStartedAt = performance.now();
  const status = await routerai.getVideoStatus(job.provider_id ?? "");
  console.info(
    JSON.stringify({
      durationMs: Math.round(performance.now() - statusStartedAt),
      event: "generation.provider_status_received",
      jobId: job.id,
      providerCostRub: status.usage?.cost,
      providerId: job.provider_id,
      providerStatus: status.status,
      state: job.status,
    })
  );
  if (["failed", "cancelled", "expired"].includes(status.status)) {
    await settleJob({
      jobId: job.id,
      leaseToken: job.lease_token ?? undefined,
      providerCost: status.usage?.cost,
      reason: "Провайдер подтвердил отказ генерации",
      status: "failed",
    });
    job.status = "failed";
    return;
  }
  if (status.status === "completed") {
    await recordProvider(
      job,
      status,
      "persisting",
      job.provider_id ?? undefined
    );
    return;
  }
  await retryLater(job);
};

const settleConfirmedImageFailure = async (
  job: Job,
  context: ProviderFailureContext,
  reason?: string
): Promise<boolean> => {
  if (job.status !== "submitting" || job.tab !== "image") {
    return false;
  }
  const failure = confirmedImageFailure(context);
  if (!failure) {
    return false;
  }
  if (context.generationId) {
    job.provider_id = context.generationId;
    await pool.query(
      "UPDATE syntx_jobs SET provider_id=coalesce($3,provider_id) WHERE id=$1 AND lease_token=$2 AND settled_at IS NULL",
      [job.id, job.lease_token, job.provider_id]
    );
  }
  await settleJob({
    jobId: job.id,
    leaseToken: job.lease_token ?? undefined,
    providerCost: failure.cost,
    reason:
      reason ??
      "Провайдер подтвердил запрос, но не вернул изображение. Резерв возвращён, списания пользователю нет.",
    status: "failed",
  });
  job.status = "failed";
  return true;
};

const prepareReferences = async (job: Job) => {
  const { request } = job;
  const ids = referencedFileIds(request.settings);
  const references = ids.length
    ? await pool.query<
        Pick<FileRow, "id" | "storage_key" | "mime_type" | "size_bytes">
      >(
        "SELECT id,storage_key,mime_type,size_bytes FROM syntx_files WHERE user_id=$1 AND id=ANY($2::text[])",
        [job.user_id, ids]
      )
    : { rows: [] };
  const { rows } = references;
  if (
    rows.reduce((sum, row) => sum + Number(row.size_bytes), 0) >
    MAX_REFERENCE_TOTAL_BYTES
  ) {
    throw new ApiError(413, "Общий размер вложений не должен превышать 24 МБ");
  }
  const dataById = new Map<string, { url: string; mime: string }>();
  for (const row of rows) {
    const queryResult2 = await readMedia(row.storage_key);
    dataById.set(row.id, {
      mime: row.mime_type,
      url: `data:${row.mime_type};base64,${queryResult2.toString("base64")}`,
    });
  }
  if (new Set(ids).size !== dataById.size) {
    throw new ApiError(404, "Референс недоступен");
  }
  const mediaFor = (id: string): { url: string; mime: string } => {
    const data = dataById.get(id);
    if (!data) {
      throw new ApiError(404, "Референс недоступен");
    }
    return data;
  };
  return {
    frames: (request.settings.frameImages ?? []).map((frame) => ({
      ...frame,
      image_url: { url: mediaFor(localReferenceId(frame.image_url.url)).url },
    })),
    input: (request.settings.inputReferences ?? []).map((ref) => {
      const media = mediaFor(referenceId(ref));
      if (media.mime.startsWith("image/")) {
        return { image_url: { url: media.url }, type: "image_url" as const };
      }
      if (media.mime.startsWith("video/")) {
        return { type: "video_url" as const, video_url: { url: media.url } };
      }
      return { audio_url: { url: media.url }, type: "audio_url" as const };
    }),
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

const traceProviderOperation = async <Result>(
  job: Job,
  operation: "image_submit" | "speech_submit" | "video_submit",
  send: () => Promise<Result>
): Promise<Result> => {
  const startedAt = performance.now();
  try {
    const result = await send();
    console.info(
      JSON.stringify({
        durationMs: Math.round(performance.now() - startedAt),
        event: "generation.provider_response_received",
        jobId: job.id,
        modelId: job.model_id,
        operation,
      })
    );
    return result;
  } catch (error) {
    console.error(
      JSON.stringify({
        durationMs: Math.round(performance.now() - startedAt),
        errorType: error instanceof Error ? error.name : "UnknownError",
        event: "generation.provider_request_failed",
        jobId: job.id,
        modelId: job.model_id,
        operation,
        providerDiagnostic:
          error instanceof RouterAIError
            ? error.context?.diagnostic
            : undefined,
        uncertain: error instanceof RouterAIError && error.uncertain,
      })
    );
    throw error;
  }
};

const submit = async (job: Job) => {
  const { settings, prompt, modelId } = job.request;
  await ensureMediaCapacity();
  const references = await prepareReferences(job);
  await authorizeSubmission(job);
  console.info(
    JSON.stringify({
      event: "generation.provider_submit_started",
      hasFrameReferences: references.frames.length > 0,
      hasImageReferences: references.input.length > 0,
      jobId: job.id,
      modelId,
      tab: job.tab,
    })
  );
  if (job.tab === "video") {
    const payload: VideoGenerateRequest = {
      aspect_ratio: settings.aspectRatio,
      duration: settings.duration,
      frame_images: references.frames.length ? references.frames : undefined,
      ...providerAudioSettings(job.catalog_snapshot, settings.generateAudio),
      input_references: references.input.length ? references.input : undefined,
      model: modelId,
      negative_prompt: settings.negativePrompt,
      prompt,
      resolution: settings.resolution,
      seed: settings.seed,
    };
    if (settings.heygenVoiceId) {
      payload.provider = {
        allow_fallbacks: false,
        only: job.catalog_snapshot.providerRoute?.tag
          ? [job.catalog_snapshot.providerRoute.tag]
          : undefined,
        options: { heygen: { voice_id: settings.heygenVoiceId } },
      };
    } else if (job.catalog_snapshot.providerRoute?.tag) {
      payload.provider = {
        allow_fallbacks: false,
        only: [job.catalog_snapshot.providerRoute.tag],
      };
    }
    const result = await traceProviderOperation(job, "video_submit", () =>
      routerai.generateVideo(payload)
    );
    await recordProvider(job, result, "running", result.id);
    console.info(
      JSON.stringify({
        event: "generation.provider_submit_accepted",
        jobId: job.id,
        modelId,
        providerId: result.id,
        providerStatus: result.status,
        tab: job.tab,
      })
    );
  } else if (job.tab === "image") {
    const imageReferences = references.input.map((reference) => {
      if (reference.type !== "image_url") {
        throw new ApiError(
          422,
          "Модель изображения принимает только изображения"
        );
      }
      return {
        image_url: reference.image_url,
        type: "image_url" as const,
      };
    });
    const result = await traceProviderOperation(job, "image_submit", () =>
      routerai.generateImage({
        aspect_ratio: settings.aspectRatio,
        background: job.catalog_snapshot.supportedBackgrounds?.includes(
          settings.background ?? ""
        )
          ? settings.background
          : undefined,
        input_references: imageReferences.length ? imageReferences : undefined,
        model: modelId,
        n: settings.n,
        negative_prompt: job.catalog_snapshot.supportsNegativePrompt
          ? settings.negativePrompt
          : undefined,
        output_format: job.catalog_snapshot.supportedOutputFormats?.includes(
          settings.outputFormat ?? ""
        )
          ? settings.outputFormat
          : undefined,
        prompt,
        provider: job.catalog_snapshot.providerRoute?.tag
          ? {
              allow_fallbacks: false,
              only: [job.catalog_snapshot.providerRoute.tag],
            }
          : undefined,
        quality: job.catalog_snapshot.supportedQualities?.includes(
          settings.quality ?? ""
        )
          ? settings.quality
          : undefined,
        resolution: settings.resolution,
        seed: job.catalog_snapshot.supportsSeed ? settings.seed : undefined,
      })
    );
    await recordProvider(job, result, "persisting", result.generationId);
    console.info(
      JSON.stringify({
        event: "generation.provider_submit_accepted",
        imageCount: result.urls.length,
        jobId: job.id,
        modelId,
        providerCostRub: result.cost,
        providerId: result.generationId,
        tab: job.tab,
      })
    );
  } else {
    const { voiceId } = settings;
    if (!voiceId) {
      throw new ApiError(422, "Голос не выбран");
    }
    const result = await traceProviderOperation(job, "speech_submit", () =>
      routerai.generateSpeech({
        input: prompt,
        model: modelId,
        provider: job.catalog_snapshot.providerRoute?.tag
          ? {
              allow_fallbacks: false,
              only: [job.catalog_snapshot.providerRoute.tag],
            }
          : undefined,
        response_format: "mp3",
        voice: voiceId,
      })
    );
    await recordProvider(job, result, "persisting", result.generationId);
    console.info(
      JSON.stringify({
        event: "generation.provider_submit_accepted",
        jobId: job.id,
        modelId,
        providerCostRub: result.cost,
        providerId: result.generationId,
        tab: job.tab,
      })
    );
  }
};

const persistArtifact = async (
  job: Job,
  ordinal: number,
  bytes: Buffer,
  mime: string
) => {
  let finalMime = mime;
  if (job.tab === "image" && mime !== "image/svg+xml") {
    const detected = imageMime(bytes);
    if (detected) {
      finalMime = detected;
    } else if (mime !== "application/octet-stream") {
      throw new Error("Invalid provider image content");
    }
  }
  const key = await saveMedia(bytes, `${job.tab}/${job.id}`, String(ordinal));
  await pool.query(
    "INSERT INTO syntx_artifacts (id,job_id,user_id,ordinal,storage_key,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT(job_id,ordinal) DO UPDATE SET storage_key=excluded.storage_key,mime_type=excluded.mime_type,size_bytes=excluded.size_bytes",
    [randomUUID(), job.id, job.user_id, ordinal, key, finalMime, bytes.length]
  );
  console.info(
    JSON.stringify({
      bytes: bytes.length,
      event: "generation.artifact_persisted",
      jobId: job.id,
      mimeType: finalMime,
      ordinal,
    })
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
  } catch (error) {
    console.error(
      JSON.stringify({
        error:
          error instanceof Error ? error.message : "Unknown maintenance error",
        event: "worker.maintenance_failed",
      })
    );
  }
};

const runReconciliationSweep = async () => {
  if (Date.now() - lastReconciliationSweep < 30_000) {
    return;
  }
  lastReconciliationSweep = Date.now();
  try {
    await releaseConfirmedImageFailures();
    await releaseExpiredUnconfirmedSubmissions();
  } catch (error) {
    console.error(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
        event: "generation.reconciliation_sweep_failed",
      })
    );
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

const failJob = async (job: Job, reason: string) => {
  await settleJob({
    jobId: job.id,
    leaseToken: job.lease_token ?? undefined,
    reason,
    status: "failed",
  });
  job.status = "failed";
};

const handleSubmittingError = async (job: Job, error: Error) => {
  const providerError = error instanceof RouterAIError ? error : undefined;
  if (
    providerError?.context &&
    (await settleConfirmedImageFailure(
      job,
      providerError.context,
      providerError.message
    ))
  ) {
    job.status = "failed";
    return;
  }
  const confirmedRejection =
    (providerError || error instanceof ApiError) && !providerError?.uncertain;
  if (confirmedRejection) {
    await failJob(
      job,
      error.message || "Не удалось подготовить запрос генерации"
    );
    return;
  }
  await markReconciling(job, providerError?.context);
  job.status = "reconciling";
};

const retryOrReconcile = async (job: Job) => {
  const exhausted =
    job.attempts > 500 ||
    Date.now() - new Date(toIsoDate(job.created_at)).getTime() >
      7 * 24 * 60 * 60_000;
  await (exhausted ? markReconciling(job) : retryLater(job));
};

const retryReconcilingVideo = async (job: Job, error: Error) => {
  if (job.tab !== "video" || !job.provider_id) {
    throw error;
  }
  await retryLater(job);
};

const handleJobError = async (job: Job, error: Error) => {
  switch (job.status) {
    case "queued": {
      await failJob(
        job,
        error.message || "Не удалось подготовить запрос генерации"
      );
      return;
    }
    case "submitting": {
      await handleSubmittingError(job, error);
      return;
    }
    case "running":
    case "persisting": {
      await retryOrReconcile(job);
      return;
    }
    case "reconciling": {
      await retryReconcilingVideo(job, error);
      break;
    }
    default: {
      throw error;
    }
  }
};

export const workerTick = async (): Promise<number> => {
  await heartbeat();
  await runMaintenance();
  await runReconciliationSweep();
  await refreshCatalogIfNeeded();
  const job = await claimJob();
  if (!job) {
    return 0;
  }
  console.info(
    JSON.stringify({
      attempts: job.attempts,
      event: "generation.job_claimed",
      jobId: job.id,
      modelId: job.model_id,
      providerId: job.provider_id,
      state: job.status,
      tab: job.tab,
    })
  );
  currentLease = { id: job.id, token: job.lease_token ?? "" };
  try {
    if (job.status === "queued") {
      await submit(job);
    }
    if (
      job.status === "running" ||
      (job.status === "reconciling" && job.tab === "video" && job.provider_id)
    ) {
      await pollVideoStatus(job);
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
        attempts: job.attempts,
        error: error instanceof Error ? error.message : String(error),
        event:
          job.status === "failed"
            ? "generation.job_failed"
            : "generation.worker_retry",
        jobId: job.id,
        modelId: job.model_id,
        providerDiagnostic:
          error instanceof RouterAIError
            ? error.context?.diagnostic
            : undefined,
        providerId: job.provider_id,
        state: job.status,
        tab: job.tab,
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
