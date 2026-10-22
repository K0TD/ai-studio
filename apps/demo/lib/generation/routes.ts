import { randomUUID } from "node:crypto";

import { z } from "zod";

import { pool } from "@/lib/db";
import {
  mediaResponse,
  MAX_UPLOAD_BYTES,
  validateUpload,
  saveMedia,
  removeMedia,
} from "@/lib/media/storage";
import { limitedBody } from "@/lib/routerai/client";
import {
  ELEVENLABS_VOICES,
  SUNO_STYLE_PRESETS,
} from "@/lib/routerai/models-catalog";
import {
  apiRoute,
  ApiError,
  requireUser,
  requireAdmin,
  readJson,
  rateLimit,
  idempotencyKey,
} from "@/lib/security/http";

import { catalogModels, permittedModel } from "./catalog";
import { generationRequestSchema, submitRequestSchema } from "./contracts";
import type { ChatRow, JobRow } from "./rows";
import {
  createQuote,
  submitGeneration,
  getJob,
  listJobs,
  jobItem,
} from "./service";
import { reconcileJob } from "./settlement";

interface Context {
  params: Promise<{ id: string }>;
}
const idFrom = async (context: Context) => {
  const { id } = await context.params;
  if (!z.string().uuid().safeParse(id).success) {
    throw new ApiError(404, "Ресурс не найден");
  }
  return id;
};
export const quotePost = apiRoute(async (request) => {
  const user = await requireUser(request);
  await rateLimit(`quote:${user.id}`, 60, 60);
  return Response.json({
    quote: await createQuote(
      user,
      await readJson(request, generationRequestSchema)
    ),
  });
});
export const generatePost = apiRoute(async (request) => {
  const user = await requireUser(request);
  await rateLimit(`generate:${user.id}`, 20, 60);
  const body = await readJson(request, submitRequestSchema);
  const { quoteId, ...generation } = body;
  return Response.json(
    {
      item: await submitGeneration(
        user,
        generation,
        quoteId,
        idempotencyKey(request)
      ),
    },
    { status: 202 }
  );
});
export const jobsGet = apiRoute(async (request) => {
  const user = await requireUser(request);
  const url = new URL(request.url);
  const options = z
    .object({
      chatId: z.string().uuid().optional(),
      cursor: z.string().uuid().optional(),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!options.success) {
    throw new ApiError(400, "Некорректные параметры списка");
  }
  return Response.json(await listJobs(user.id, options.data));
});
export const jobGet = apiRoute(async (request, context: Context) => {
  const user = await requireUser(request);
  return Response.json({ item: await getJob(user.id, await idFrom(context)) });
});
export const modelsGet = apiRoute(async (request) => {
  const user = await requireUser(request);
  await rateLimit(`models:${user.id}`, 30, 60);
  const queryResult1 = await catalogModels();
  const models = queryResult1
    .filter((m) => user.role === "admin" || permittedModel(user, m))
    .map(({ raw: _raw, ...model }) => ({
      ...model,
      canGenerate:
        user.isApproved &&
        model.enabled &&
        model.category !== "llm" &&
        user.permissions.sections.includes(model.category) &&
        user.permissions.modelIds.includes(model.id),
    }));
  return Response.json({
    audio: models.filter((m) => m.category === "audio"),
    elevenlabsVoices: ELEVENLABS_VOICES,
    image: models.filter((m) => m.category === "image"),
    sunoStyles: SUNO_STYLE_PRESETS,
    video: models.filter((m) => m.category === "video"),
  });
});
const chatBody = z.strictObject({
  tab: z.enum(["video", "image", "audio"]),
  title: z.string().trim().min(1).max(120).default("Новый чат"),
});
const chatItem = (row: ChatRow) => ({
  createdAt: new Date(row.created_at).toISOString(),
  id: row.id,
  isFavorite: row.is_favorite,
  tab: row.tab,
  title: row.title,
});
export const chatsGet = apiRoute(async (request) => {
  const user = await requireUser(request);
  const { rows } = await pool.query(
    "SELECT * FROM syntx_chats WHERE user_id=$1 AND deleted_at IS NULL ORDER BY created_at DESC LIMIT 500",
    [user.id]
  );
  return Response.json({ chats: rows.map(chatItem) });
});
export const chatsPost = apiRoute(async (request) => {
  const user = await requireUser(request);
  await rateLimit(`chats:${user.id}`, 20, 60);
  const body = await readJson(request, chatBody);
  if (!user.isApproved || !user.permissions.sections.includes(body.tab)) {
    throw new ApiError(403, "Доступ к разделу закрыт");
  }
  const result = await pool.query(
    "INSERT INTO syntx_chats (id,user_id,title,tab) VALUES ($1,$2,$3,$4) RETURNING *",
    [randomUUID(), user.id, body.title, body.tab]
  );
  return Response.json({ chat: chatItem(result.rows[0]) }, { status: 201 });
});
export const chatPatch = apiRoute(async (request, context: Context) => {
  const user = await requireUser(request);
  const id = await idFrom(context);
  const body = await readJson(
    request,
    z
      .strictObject({
        isFavorite: z.boolean().optional(),
        title: z.string().trim().min(1).max(120).optional(),
      })
      .refine((value) => Object.keys(value).length > 0)
  );
  const result = await pool.query(
    "UPDATE syntx_chats SET title=coalesce($3,title),is_favorite=coalesce($4,is_favorite) WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL RETURNING *",
    [id, user.id, body.title ?? null, body.isFavorite ?? null]
  );
  if (!result.rowCount) {
    throw new ApiError(404, "Чат не найден");
  }
  return Response.json({ chat: chatItem(result.rows[0]) });
});
export const chatDelete = apiRoute(async (request, context: Context) => {
  const user = await requireUser(request);
  const id = await idFrom(context);
  await pool.query(
    "UPDATE syntx_chats SET deleted_at=now() WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [id, user.id]
  );
  return Response.json({ ok: true });
});
export const filesPost = apiRoute(async (request) => {
  const user = await requireUser(request);
  await rateLimit(`upload:${user.id}`, 10, 60);
  if (
    !user.isApproved ||
    !user.permissions.sections.some((s) => s === "video" || s === "image")
  ) {
    throw new ApiError(403, "Загрузка референсов недоступна");
  }
  const type = request.headers.get("content-type") ?? "";
  if (!type.startsWith("multipart/form-data;")) {
    throw new ApiError(415, "Ожидается загрузка файла");
  }
  let buffer: Buffer;
  try {
    buffer = await limitedBody(
      new Response(request.body, { headers: request.headers }),
      MAX_UPLOAD_BYTES + 65_536
    );
  } catch {
    throw new ApiError(413, "Изображение должно быть не больше 10 МБ");
  }
  const form = await new Response(new Uint8Array(buffer), {
    headers: { "content-type": type },
  }).formData();
  const file = form.get("file");
  if (
    !(file instanceof File) ||
    [...form.keys()].some((key) => key !== "file") ||
    form.getAll("file").length !== 1
  ) {
    throw new ApiError(400, "Передайте один файл");
  }
  const bytes = Buffer.from(await file.arrayBuffer());
  const mime = validateUpload(file, bytes);
  const id = randomUUID();
  const key = await saveMedia(bytes, user.id, id);
  const filename =
    [...file.name]
      .filter((character) => (character.codePointAt(0) ?? 0) >= 32)
      .join("")
      .slice(0, 160) || "reference";
  try {
    await pool.query(
      "INSERT INTO syntx_files (id,user_id,filename,storage_key,mime_type,size_bytes) VALUES ($1,$2,$3,$4,$5,$6)",
      [id, user.id, filename, key, mime, bytes.length]
    );
  } catch (error) {
    await removeMedia(key);
    throw error;
  }
  return Response.json(
    { filename, id, url: `/api/k0td-ai/files/${id}/content` },
    { status: 201 }
  );
});
export const fileGet = apiRoute(async (request, context: Context) => {
  const user = await requireUser(request);
  const id = await idFrom(context);
  const queryResult2 = await pool.query(
    "SELECT * FROM syntx_files WHERE id=$1 AND user_id=$2",
    [id, user.id]
  );
  const [file] = queryResult2.rows;
  if (!file) {
    throw new ApiError(404, "Файл не найден");
  }
  return mediaResponse(
    request,
    file.storage_key,
    file.mime_type,
    file.filename
  );
});
const mediaExtensions = new Map<string, string>(
  Object.entries({
    "audio/mpeg": "mp3",
    "audio/wav": "wav",
    "image/jpeg": "jpg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp",
    "video/mp4": "mp4",
  })
);
export const mediaGet = apiRoute(async (request, context: Context) => {
  const user = await requireUser(request);
  const id = await idFrom(context);
  const queryResult3 = await pool.query(
    "SELECT a.* FROM syntx_artifacts a JOIN syntx_jobs j ON j.id=a.job_id WHERE a.id=$1 AND a.user_id=$2 AND j.status IN ('completed','failed')",
    [id, user.id]
  );
  const [file] = queryResult3.rows;
  if (!file) {
    throw new ApiError(404, "Результат не найден");
  }
  const extension = mediaExtensions.get(file.mime_type) ?? "bin";
  return mediaResponse(
    request,
    file.storage_key,
    file.mime_type,
    `result.${extension}`
  );
});
export const videoGet = apiRoute(async (request, context: Context) => {
  const user = await requireUser(request);
  const item = await getJob(user.id, await idFrom(context));
  if (item.tab !== "video") {
    throw new ApiError(404, "Видео не найдено");
  }
  return Response.json({
    error: item.metadata.error,
    id: item.id,
    status: item.status,
    unsigned_urls: item.outputUrls,
    usage:
      item.pricingSource === "actual"
        ? { cost: Number(item.chargedCostRub) }
        : undefined,
  });
});
export const videoContentGet = apiRoute(async (request, context: Context) => {
  const user = await requireUser(request);
  const jobId = await idFrom(context);
  const rawIndex = new URL(request.url).searchParams.get("index") ?? "0";
  if (!/^[0-3]$/u.test(rawIndex)) {
    throw new ApiError(400, "Некорректный номер результата");
  }
  const queryResult4 = await pool.query(
    "SELECT a.* FROM syntx_artifacts a JOIN syntx_jobs j ON j.id=a.job_id WHERE a.job_id=$1 AND a.user_id=$2 AND a.ordinal=$3 AND j.tab='video' AND j.status='completed'",
    [jobId, user.id, Number(rawIndex)]
  );
  const [file] = queryResult4.rows;
  if (!file) {
    throw new ApiError(404, "Видео не найдено");
  }
  return mediaResponse(request, file.storage_key, file.mime_type, "video.mp4");
});
export const adminJobsGet = apiRoute(async (request) => {
  await requireAdmin(request);
  const url = new URL(request.url);
  const status = url.searchParams.get("status");
  if (
    status &&
    ![
      "queued",
      "submitting",
      "running",
      "persisting",
      "completed",
      "failed",
      "reconciling",
    ].includes(status)
  ) {
    throw new ApiError(400, "Некорректный статус");
  }
  const pagination = z
    .object({
      limit: z.coerce.number().int().min(1).max(100).default(25),
      page: z.coerce.number().int().min(1).max(10_000).default(1),
    })
    .safeParse(Object.fromEntries(url.searchParams));
  if (!pagination.success) {
    throw new ApiError(400, "Некорректная страница");
  }
  const { page, limit } = pagination.data;
  const { rows } = await pool.query<JobRow>(
    "SELECT * FROM syntx_jobs WHERE ($1::text IS NULL OR status=$1) ORDER BY created_at DESC,id DESC LIMIT $2 OFFSET $3",
    [status, limit, (page - 1) * limit]
  );
  const queryResult5 = await pool.query(
    "SELECT count(*)::int AS total FROM syntx_jobs WHERE ($1::text IS NULL OR status=$1)",
    [status]
  );
  const [count] = queryResult5.rows;
  return Response.json({
    items: rows.map((r) => ({
      ...jobItem(r),
      providerCostRub: r.provider_cost_rub,
      providerId: r.provider_id,
      settledAt: r.settled_at,
      submittedAt: r.submitted_at,
      userId: r.user_id,
      varianceRub: r.variance_rub,
    })),
    limit,
    page,
    total: count.total,
  });
});
export const adminJobReconcilePost = apiRoute(
  async (request, context: Context) => {
    const user = await requireAdmin(request);
    const jobId = await idFrom(context);
    const body = await readJson(
      request,
      z.strictObject({
        action: z.enum(["release", "settle"]),
        costRub: z
          .string()
          .regex(/^(0|[1-9]\d{0,9})\.\d{2}$/u)
          .optional(),
        reason: z.string().trim().min(5).max(500),
      })
    );
    await reconcileJob({ actorId: user.id, jobId, ...body });
    return Response.json({ ok: true });
  }
);
