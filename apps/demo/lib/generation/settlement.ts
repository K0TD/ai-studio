import { randomUUID } from "node:crypto";

import { costRub, parseRub, formatKopecks } from "@/lib/billing/money";
import { pool } from "@/lib/db";
import { ApiError } from "@/lib/security/http";

import type { JobRow, WalletRow } from "./rows";

export interface Settlement {
  jobId: string;
  status: "completed" | "failed";
  providerCost?: unknown;
  actorId?: string;
  reason?: string;
  manual?: boolean;
  chargeConfirmed?: boolean;
  leaseToken?: string;
}
const actualCost = (input: Settlement): string | null => {
  if (input.providerCost === undefined || input.providerCost === null) {
    return null;
  }
  try {
    return costRub(input.providerCost);
  } catch {
    throw new ApiError(
      422,
      "Провайдер вернул некорректную стоимость; требуется сверка"
    );
  }
};
const settlementAmounts = (
  input: Settlement,
  job: JobRow,
  owner: WalletRow
) => {
  const actual = actualCost(input);
  const failedFree = input.status === "failed" && !input.chargeConfirmed;
  let nominal =
    actual === null ? parseRub(job.estimated_cost_rub) : parseRub(actual);
  if (failedFree) {
    nominal = 0n;
  }
  const held = parseRub(job.max_cost_rub);
  const charged = nominal > held ? held : nominal;
  const after = parseRub(owner.balance_rub) - charged;
  if (
    !failedFree &&
    (parseRub(owner.reserved_rub) < held ||
      after < parseRub(owner.reserved_rub) - held)
  ) {
    throw new Error("Wallet reservation invariant violated");
  }
  let varianceValue = nominal > held ? nominal - held : 0n;
  if (failedFree && actual !== null) {
    varianceValue = parseRub(actual);
  }
  let source: "actual" | "estimated" | null = null;
  if (actual !== null) {
    source = "actual";
  } else if (input.status === "completed") {
    source = "estimated";
  }
  return {
    actual,
    after,
    charged,
    chargedRub: formatKopecks(charged),
    source,
    variance: formatKopecks(varianceValue),
    varianceValue,
  };
};
const settlementReason = (
  input: Settlement,
  source: "actual" | "estimated" | null
): string => {
  if (input.reason) {
    return input.reason;
  }
  if (source === "estimated") {
    return "Генерация: списание по согласованной оценке; провайдер не вернул стоимость";
  }
  if (input.status === "failed") {
    return "Освобождение резерва после отказа";
  }
  return "Генерация: фактическая стоимость провайдера";
};
const verifyActor = (input: Settlement, accounts: WalletRow[]) => {
  if (!input.manual) {
    return;
  }
  const actor = accounts.find((row) => row.id === input.actorId);
  if (
    !actor ||
    actor.role !== "admin" ||
    actor.is_banned ||
    !actor.is_approved ||
    !actor.activated_at
  ) {
    throw new ApiError(403, "Требуются действующие права администратора");
  }
};
const verifySettlementState = (input: Settlement, job: JobRow) => {
  if (input.leaseToken && job.lease_token !== input.leaseToken) {
    throw new Error("Job lease was lost");
  }
  if (
    input.manual &&
    (job.status !== "reconciling" ||
      (job.leased_until && new Date(job.leased_until).getTime() > Date.now()))
  ) {
    throw new ApiError(409, "Задание не готово для ручной сверки");
  }
};
export const settleJob = async (input: Settlement): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const queryResult1 = await client.query<Pick<JobRow, "user_id">>(
      "SELECT user_id FROM syntx_jobs WHERE id=$1",
      [input.jobId]
    );
    const [identity] = queryResult1.rows;
    if (!identity) {
      throw new ApiError(404, "Задание не найдено");
    }
    const identities = [
      ...new Set([identity.user_id, ...(input.actorId ? [input.actorId] : [])]),
    ].toSorted();
    const queryResult2 = await client.query<WalletRow>(
      'SELECT * FROM "user" WHERE id=ANY($1::text[]) ORDER BY id FOR UPDATE',
      [identities]
    );
    const accounts = queryResult2.rows;
    const owner = accounts.find((row) => row.id === identity.user_id);
    if (!owner) {
      throw new ApiError(404, "Пользователь не найден");
    }
    verifyActor(input, accounts);
    const queryResult3 = await client.query<JobRow>(
      "SELECT * FROM syntx_jobs WHERE id=$1 FOR UPDATE",
      [input.jobId]
    );
    const [job] = queryResult3.rows;
    if (!job) {
      throw new ApiError(404, "Задание не найдено");
    }
    if (job.settled_at) {
      await client.query("COMMIT");
      return;
    }
    verifySettlementState(input, job);
    const {
      actual,
      after,
      charged,
      chargedRub,
      source,
      variance,
      varianceValue,
    } = settlementAmounts(input, job, owner);
    const held = parseRub(job.max_cost_rub);
    const currentReserved = parseRub(String(owner.reserved_rub ?? "0.00"));
    const nextReserved = formatKopecks(
      currentReserved >= held ? currentReserved - held : 0n
    );
    await client.query(
      'UPDATE "user" SET balance_rub=$2,reserved_rub=$3,updated_at=now() WHERE id=$1',
      [owner.id, formatKopecks(after), nextReserved]
    );
    await client.query(
      "INSERT INTO transactions (id,user_id,actor_id,job_id,amount_rub,type,reason,balance_before_rub,balance_after_rub,idempotency_key) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)",
      [
        randomUUID(),
        owner.id,
        input.actorId ?? null,
        job.id,
        formatKopecks(-charged),
        charged > 0n ? "generation_cost" : "generation_release",
        settlementReason(input, source),
        owner.balance_rub,
        formatKopecks(after),
        `job:${job.id}:settle`,
      ]
    );
    await client.query(
      "UPDATE syntx_jobs SET status=$2,charged_cost_rub=$3,provider_cost_rub=$4,variance_rub=$5,pricing_source=$6,settled_at=now(),updated_at=now(),lease_token=NULL,leased_until=NULL,error=$7,provider_result=CASE WHEN $8::boolean THEN provider_result ELSE NULL END WHERE id=$1",
      [
        job.id,
        input.status,
        chargedRub,
        actual,
        variance,
        source,
        input.status === "failed"
          ? (input.reason ?? "Провайдер не смог завершить генерацию")
          : null,
        input.manual ?? false,
      ]
    );
    if (input.manual) {
      await client.query(
        "INSERT INTO admin_audit (id,actor_id,target_id,action,details) VALUES ($1,$2,$3,'job.reconcile',$4)",
        [
          randomUUID(),
          input.actorId,
          owner.id,
          JSON.stringify({
            chargedCostRub: chargedRub,
            jobId: job.id,
            providerCostRub: actual,
            reason: input.reason,
            status: input.status,
            varianceRub: variance,
          }),
        ]
      );
    }
    await client.query("COMMIT");
    if (varianceValue > 0n) {
      console.error(
        JSON.stringify({
          event: "generation.cost_variance",
          jobId: job.id,
          varianceRub: variance,
        })
      );
    }
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
};

export const reconcileJob = async (input: {
  jobId: string;
  actorId: string;
  action: "release" | "settle";
  costRub?: string;
  reason: string;
}) => {
  if (input.action === "settle" && input.costRub === undefined) {
    throw new ApiError(400, "Укажите подтверждённую стоимость");
  }
  const queryResult4 = await pool.query(
    "SELECT 1 FROM syntx_artifacts WHERE job_id=$1 LIMIT 1",
    [input.jobId]
  );
  const hasResult = Boolean(queryResult4.rowCount);
  const completed = input.action === "settle" && hasResult;
  await settleJob({
    actorId: input.actorId,
    chargeConfirmed: input.action === "settle",
    jobId: input.jobId,
    manual: true,
    providerCost: input.action === "release" ? "0.00" : input.costRub,
    reason:
      input.action === "settle" && !hasResult
        ? `${input.reason ? input.reason + ". " : ""}Финансовая сверка завершена; результат не удалось восстановить.`
        : (input.reason || "Ручная сверка задания"),
    status: completed ? "completed" : "failed",
  });
};
