import { randomUUID } from "node:crypto";

import { parseRub, formatKopecks } from "@/lib/billing/money";
import { pool, sumRubSql } from "@/lib/db";
import type { DatabaseClient } from "@/lib/db";
import { toIsoDate } from "@/lib/db/date";
import { MAX_REFERENCE_TOTAL_BYTES } from "@/lib/media/storage";
import { isBudgetModel } from "@/lib/routerai/models-catalog";
import { ApiError } from "@/lib/security/http";
import type { AuthUser } from "@/lib/security/http";

import { requireModel, permittedModel } from "./catalog";
import type { CatalogModel } from "./catalog";
import {
  normalizedSettings,
  referencedFileIds,
  requestHash,
} from "./contracts";
import type { GenerationRequest } from "./contracts";
import { selectProvider } from "./provider-routing";
import type { ArtifactRow, JobRow, WalletRow, QuoteRow } from "./rows";

export const assertAccountAccess = (
  account: {
    is_banned: boolean;
    is_approved: boolean;
    activated_at: Date | null;
    role: string;
    permissions: AuthUser["permissions"];
  },
  tab: GenerationRequest["tab"],
  modelId: string
) => {
  if (account.is_banned) {
    throw new ApiError(403, "Аккаунт заблокирован", "ACCOUNT_BANNED");
  }
  if (!account.is_approved) {
    throw new ApiError(
      403,
      "Аккаунт ожидает одобрения",
      "ACCOUNT_NOT_APPROVED"
    );
  }
  if (!account.activated_at && account.role !== "admin") {
    throw new ApiError(
      403,
      "Генерация для аккаунта закрыта: требуется активация",
      "GENERATION_FORBIDDEN"
    );
  }
  const sectionAllowed =
    account.role === "admin" ||
    account.role === "vip" ||
    !account.permissions?.sections?.length ||
    account.permissions.sections.includes(tab);
  if (!sectionAllowed) {
    throw new ApiError(403, "Доступ к разделу закрыт", "SECTION_FORBIDDEN");
  }

  const modelAllowed =
    account.role === "admin" ||
    account.role === "vip" ||
    account.permissions?.modelIds?.includes(modelId) ||
    isBudgetModel(modelId);
  if (!modelAllowed) {
    throw new ApiError(
      403,
      account.role === "user"
        ? "Эта модель доступна только для тарифа VIP"
        : "Доступ к модели закрыт",
      "VIP_REQUIRED"
    );
  }
};

const checkOwnedRequest = async (
  client: Pick<DatabaseClient, "query">,
  accountId: string,
  request: GenerationRequest,
  model: CatalogModel
) => {
  const queryResult1 = await client.query(
    "SELECT id,tab FROM syntx_chats WHERE id=$1 AND user_id=$2 AND deleted_at IS NULL",
    [request.chatId, accountId]
  );
  const [chat] = queryResult1.rows;
  if (!chat || chat.tab !== request.tab) {
    throw new ApiError(404, "Чат не найден", "CHAT_NOT_FOUND");
  }
  const refs = [...new Set(referencedFileIds(request.settings))];
  if (refs.length) {
    const queryResult2 = await client.query(
      "SELECT id,mime_type,size_bytes FROM syntx_files WHERE user_id=$1 AND id=ANY($2::text[])",
      [accountId, refs]
    );
    const owned = queryResult2.rows;
    if (owned.length !== refs.length) {
      throw new ApiError(404, "Референс не найден", "REFERENCE_NOT_FOUND");
    }
    const totalBytes = owned.reduce(
      (sum, file) => sum + Number(file.size_bytes),
      0
    );
    if (totalBytes > MAX_REFERENCE_TOTAL_BYTES) {
      throw new ApiError(
        413,
        "Общий размер вложений не должен превышать 24 МБ",
        "REFERENCES_TOO_LARGE"
      );
    }
    const allowedTypes = new Set(model.supportedInputTypes);
    if (
      model.category === "video" &&
      (model.supportsReferences || model.supportsFrameReferences)
    ) {
      allowedTypes.add("image");
    }
    if (request.tab === "image") {
      allowedTypes.add("image");
    }
    for (const file of owned) {
      const [mediaType] = String(file.mime_type).split("/");
      if (
        mediaType !== "image" &&
        mediaType !== "video" &&
        mediaType !== "audio"
      ) {
        throw new ApiError(
          422,
          "Модель не принимает этот тип вложения",
          "UNSUPPORTED_REFERENCE_TYPE"
        );
      }
      if (!allowedTypes.has(mediaType)) {
        throw new ApiError(
          422,
          "Модель не принимает этот тип вложения",
          "UNSUPPORTED_REFERENCE_TYPE"
        );
      }
    }
  }
};

export const createQuote = async (
  account: AuthUser,
  request: GenerationRequest,
  providerTag?: string
) => {
  if (!account.isApproved) {
    throw new ApiError(403, "Доступ к генерации не одобрен");
  }
  const model = await requireModel(account, request.modelId, request.tab);
  const settings = normalizedSettings(request, model);
  await checkOwnedRequest(pool, account.id, { ...request, settings }, model);
  const provider = await selectProvider(
    model,
    settings,
    request.prompt,
    providerTag
  );
  const { estimatedCostRub } = provider;
  const multiplier = Math.round(
    Number(process.env.QUOTE_MAXIMUM_MULTIPLIER ?? "1.20") * 100
  );
  if (!Number.isInteger(multiplier) || multiplier < 100 || multiplier > 200) {
    throw new Error("Invalid QUOTE_MAXIMUM_MULTIPLIER");
  }
  const maxCostRub = formatKopecks(
    (parseRub(estimatedCostRub) * BigInt(multiplier) + 99n) / 100n
  );
  const id = randomUUID();
  const expiresAt = new Date(Date.now() + 5 * 60_000);
  await pool.query(
    "INSERT INTO syntx_quotes (id,user_id,request_hash,estimated_cost_rub,max_cost_rub,catalog_snapshot,expires_at) VALUES ($1,$2,$3,$4,$5,$6,$7)",
    [
      id,
      account.id,
      requestHash(request),
      estimatedCostRub,
      maxCostRub,
      JSON.stringify({
        ...model,
        providerOptions: provider.options,
        providerRoute: provider.provider,
      }),
      expiresAt,
    ]
  );
  return {
    estimatedCostRub,
    expiresAt: expiresAt.toISOString(),
    id,
    provider: provider.provider,
    providerOptions: provider.options,
    reserveCostRub: maxCostRub,
  };
};

export const jobItem = (row: JobRow, artifacts: { id: string }[] = []) => {
  const settings = row.request?.settings ?? {};
  const charged = row.charged_cost_rub
    ? formatKopecks(parseRub(String(row.charged_cost_rub)))
    : null;
  const estimated = row.estimated_cost_rub
    ? formatKopecks(parseRub(String(row.estimated_cost_rub)))
    : undefined;
  const maxCost = row.max_cost_rub
    ? formatKopecks(parseRub(String(row.max_cost_rub)))
    : undefined;
  return {
    chargedCostRub: charged,
    chatId: row.chat_id,
    costRub: Number(charged ?? estimated ?? 0),
    createdAt: toIsoDate(row.created_at),
    estimatedCostRub: estimated,
    id: row.id,
    metadata: {
      aspectRatio: settings.aspectRatio,
      audioVoice: settings.voiceId,
      durationSeconds: settings.duration,
      error: row.error ?? undefined,
      generateAudio: settings.generateAudio,
      provider: row.catalog_snapshot.providerRoute,
      providerOptions: row.catalog_snapshot.providerOptions,
      resolution: settings.resolution,
    },
    modelId: row.model_id,
    outputUrls: artifacts.map((a) => `/api/k0td-ai/media/${a.id}`),
    pricingSource: row.pricing_source,
    prompt: row.prompt,
    reserveCostRub: maxCost,
    stage: row.status,
    status: ["queued", "submitting", "running", "persisting"].includes(
      row.status
    )
      ? "pending"
      : row.status,
    tab: row.tab,
    updatedAt: toIsoDate(row.updated_at),
  };
};

export const getJob = async (userId: string, id: string) => {
  const queryResult9 = await pool.query<JobRow>(
    "SELECT * FROM syntx_jobs WHERE id=$1 AND user_id=$2",
    [id, userId]
  );
  const [row] = queryResult9.rows;
  if (!row) {
    throw new ApiError(404, "Задание не найдено", "JOB_NOT_FOUND");
  }
  const queryResult10 = await pool.query<Pick<ArtifactRow, "id">>(
    "SELECT id FROM syntx_artifacts WHERE job_id=$1 AND user_id=$2 ORDER BY ordinal",
    [id, userId]
  );
  const artifacts = queryResult10.rows;
  return jobItem(row, artifacts);
};

const retrySource = async (userId: string, id: string): Promise<JobRow> => {
  const result = await pool.query<JobRow>(
    "SELECT * FROM syntx_jobs WHERE id=$1 AND user_id=$2",
    [id, userId]
  );
  const [row] = result.rows;
  if (!row) {
    throw new ApiError(404, "Задание не найдено", "JOB_NOT_FOUND");
  }
  if (row.status !== "failed" || !row.settled_at) {
    throw new ApiError(
      409,
      "Повтор доступен только после подтверждённого отказа провайдера",
      "JOB_NOT_RETRYABLE"
    );
  }
  return row;
};

export const createRetryQuote = async (
  account: AuthUser,
  sourceJobId: string,
  providerTag: string
) => {
  const source = await retrySource(account.id, sourceJobId);
  return createQuote(account, source.request, providerTag);
};

export const submitGeneration = async (
  account: AuthUser,
  request: GenerationRequest,
  quoteId: string,
  key: string
) => {
  const hash = requestHash(request);
  const client = await pool.connect();
  let jobId = "";
  try {
    await client.query("BEGIN");
    const queryResult3 = await client.query<WalletRow>(
      'SELECT * FROM "user" WHERE id=$1 FOR UPDATE',
      [account.id]
    );
    const [owner] = queryResult3.rows;
    if (!owner) {
      throw new ApiError(401, "Необходима авторизация");
    }
    assertAccountAccess(owner, request.tab, request.modelId);
    const queryResult4 = await client.query(
      "SELECT id,request_hash FROM syntx_jobs WHERE user_id=$1 AND idempotency_key=$2",
      [account.id, key]
    );
    const [existing] = queryResult4.rows;
    if (existing) {
      if (existing.request_hash !== hash) {
        throw new ApiError(
          409,
          "Этот ключ уже использован для другого запроса",
          "IDEMPOTENCY_CONFLICT"
        );
      }
      jobId = existing.id;
    } else {
      const queryResult5 = await client.query<QuoteRow>(
        "SELECT * FROM syntx_quotes WHERE id=$1 AND user_id=$2 FOR UPDATE",
        [quoteId, account.id]
      );
      const [quote] = queryResult5.rows;
      if (!quote || quote.request_hash !== hash) {
        throw new ApiError(
          409,
          "Расчёт не соответствует запросу",
          "QUOTE_MISMATCH"
        );
      }
      if (new Date(toIsoDate(quote.expires_at)).getTime() <= Date.now()) {
        throw new ApiError(
          409,
          "Расчёт устарел. Обновите стоимость",
          "QUOTE_EXPIRED"
        );
      }
      const queryResult6 = await client.query(
        "SELECT id FROM syntx_jobs WHERE quote_id=$1",
        [quoteId]
      );
      if (queryResult6.rowCount) {
        throw new ApiError(409, "Расчёт уже использован", "QUOTE_USED");
      }
      const snapshot = quote.catalog_snapshot;
      if (!snapshot.enabled || !permittedModel(account, snapshot)) {
        throw new ApiError(403, "Доступ к модели закрыт");
      }
      const normalized = {
        ...request,
        settings: normalizedSettings(request, snapshot),
      };
      await checkOwnedRequest(client, account.id, normalized, snapshot);
      const queryResult7 = await client.query(
        `SELECT count(*)::int AS count,${sumRubSql("max_cost_rub")} AS held FROM syntx_jobs WHERE user_id=$1 AND settled_at IS NULL`,
        [account.id]
      );
      const [active] = queryResult7.rows;
      if (active.count >= owner.permissions.maxConcurrentJobs) {
        throw new ApiError(
          429,
          "Достигнут лимит одновременных заданий",
          "CONCURRENCY_LIMIT"
        );
      }
      const reserve = parseRub(quote.max_cost_rub);
      if (parseRub(owner.balance_rub) - parseRub(owner.reserved_rub) < 0n) {
        throw new ApiError(
          402,
          "На балансе есть долг. Пополните счёт, чтобы запускать генерации.",
          "BALANCE_DEBT"
        );
      }
      if (
        parseRub(owner.balance_rub) - parseRub(owner.reserved_rub) <
        reserve
      ) {
        throw new ApiError(
          402,
          "Недостаточно доступных средств для резерва",
          "INSUFFICIENT_BALANCE"
        );
      }
      if (owner.permissions.dailyLimitRub !== null) {
        const queryResult8 = await client.query(
          `SELECT ${sumRubSql("amount_rub", true)} AS amount FROM transactions WHERE user_id=$1 AND type='generation_cost' AND created_at>=date_trunc('day',now() AT TIME ZONE 'Europe/Moscow') AT TIME ZONE 'Europe/Moscow'`,
          [account.id]
        );
        const [charged] = queryResult8.rows;
        if (
          parseRub(charged.amount) + parseRub(active.held) + reserve >
          parseRub(owner.permissions.dailyLimitRub)
        ) {
          throw new ApiError(
            403,
            "Достигнут суточный лимит расходов",
            "DAILY_LIMIT"
          );
        }
      }
      jobId = randomUUID();
      await client.query(
        "INSERT INTO syntx_jobs (id,user_id,chat_id,quote_id,idempotency_key,request_hash,tab,model_id,prompt,request,catalog_snapshot,estimated_cost_rub,max_cost_rub) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)",
        [
          jobId,
          account.id,
          request.chatId,
          quoteId,
          key,
          hash,
          request.tab,
          request.modelId,
          request.prompt,
          JSON.stringify(normalized),
          JSON.stringify(snapshot),
          quote.estimated_cost_rub,
          quote.max_cost_rub,
        ]
      );
      const nextReserved = formatKopecks(
        parseRub(String(owner.reserved_rub ?? "0.00")) + reserve
      );
      await client.query(
        'UPDATE "user" SET reserved_rub=$2,updated_at=now() WHERE id=$1',
        [account.id, nextReserved]
      );
      await client.query(
        "INSERT INTO transactions (id,user_id,job_id,amount_rub,type,reason,balance_before_rub,balance_after_rub,idempotency_key) VALUES ($1,$2,$3,'0.00','generation_reserve',$4,$5,$5,$6)",
        [
          randomUUID(),
          account.id,
          jobId,
          `Резерв ${quote.max_cost_rub} ₽ на генерацию`,
          owner.balance_rub,
          `job:${jobId}:reserve`,
        ]
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  return getJob(account.id, jobId);
};

export const submitRetryGeneration = async (
  account: AuthUser,
  sourceJobId: string,
  quoteId: string,
  key: string
) => {
  const source = await retrySource(account.id, sourceJobId);
  return submitGeneration(account, source.request, quoteId, key);
};

export const listJobs = async (
  userId: string,
  options: { activeOnly?: boolean; chatId?: string; cursor?: string } = {}
) => {
  const activeQuery = options.activeOnly
    ? await pool.query<JobRow>(
        `SELECT * FROM syntx_jobs WHERE user_id=$1
        AND (status IN ('queued','submitting','running','persisting','reconciling')
          OR (status IN ('completed','failed') AND updated_at>now()-interval '5 minutes'))
        ORDER BY created_at DESC,id DESC LIMIT 100`,
        [userId]
      )
    : await pool.query<JobRow>(
        "SELECT * FROM syntx_jobs WHERE user_id=$1 AND ($2::text IS NULL OR chat_id=$2) AND ($3::text IS NULL OR (created_at,id)<(SELECT created_at,id FROM syntx_jobs WHERE id=$3 AND user_id=$1)) ORDER BY created_at DESC,id DESC LIMIT 51",
        [userId, options.chatId ?? null, options.cursor ?? null]
      );
  const { rows: jobRows } = activeQuery;
  const visible = options.activeOnly ? jobRows : jobRows.slice(0, 50);
  const artifactRows = visible.length
    ? await pool.query<Pick<ArtifactRow, "id" | "job_id">>(
        "SELECT id,job_id FROM syntx_artifacts WHERE user_id=$1 AND job_id=ANY($2::text[]) ORDER BY ordinal",
        [userId, visible.map((r) => r.id)]
      )
    : { rows: [] };
  const artifacts = artifactRows.rows;
  return {
    items: visible.map((r) =>
      jobItem(
        r,
        artifacts.filter((a) => a.job_id === r.id)
      )
    ),
    nextCursor:
      !options.activeOnly && jobRows.length > 50
        ? visible.at(-1)?.id
        : undefined,
  };
};
