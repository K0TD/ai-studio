const cents = (value: string) => `CAST(replace(${value},'.','') AS INTEGER)`;
const validMoney = (value: string, signed = false) => {
  const digits = signed
    ? `CASE WHEN substr(${value},1,1)='-' THEN substr(${value},2) ELSE ${value} END`
    : value;
  return `(${digits} GLOB '[0-9]*.[0-9][0-9]' AND replace(${digits},'.','') NOT GLOB '*[^0-9]*' AND length(${digits})-instr(${digits},'.')=2 AND length(${digits})<=13)`;
};
const guard = (table: string, label: string, invalid: string) =>
  ["INSERT", "UPDATE"].map(
    (operation) =>
      `CREATE TRIGGER IF NOT EXISTS "${table}_${label}_${operation.toLowerCase()}" BEFORE ${operation} ON "${table}"
   WHEN ${invalid} BEGIN SELECT RAISE(ABORT,'${label}'); END`
  );
const protectParent = (table: string, children: string) => [
  `CREATE TRIGGER IF NOT EXISTS "${table}_referenced_delete" BEFORE DELETE ON "${table}" WHEN ${children} BEGIN SELECT RAISE(ABORT,'Referenced parent cannot be deleted'); END`,
  `CREATE TRIGGER IF NOT EXISTS "${table}_referenced_update" BEFORE UPDATE OF id${table === "user" ? "" : ",user_id"} ON "${table}" WHEN (NEW.id<>OLD.id${table === "user" ? "" : " OR NEW.user_id<>OLD.user_id"}) AND (${children}) BEGIN SELECT RAISE(ABORT,'Referenced parent cannot be changed'); END`,
];

export const sqliteIntegrity = [
  `UPDATE "user" SET activated_at=created_at WHERE activated_at IS NULL AND EXISTS(SELECT 1 FROM account WHERE account.user_id="user".id AND provider_id='credential' AND length(password)>0)`,
  ...guard(
    "user",
    "wallet_integrity",
    `NOT ${validMoney("NEW.balance_rub", true)} OR NOT ${validMoney("NEW.reserved_rub")}`
  ),
  ...guard(
    "user",
    "role_integrity",
    "NEW.role NOT IN ('user','vip','admin') OR (NEW.is_env_admin=1 AND (NEW.role<>'admin' OR NEW.is_banned<>0 OR NEW.is_approved<>1))"
  ),
  ...guard(
    "transactions",
    "ledger_arithmetic",
    `NOT ${validMoney("NEW.amount_rub", true)} OR NOT ${validMoney("NEW.balance_before_rub", true)} OR NOT ${validMoney("NEW.balance_after_rub", true)} OR ${cents("NEW.balance_after_rub")} <> ${cents("NEW.balance_before_rub")} + ${cents("NEW.amount_rub")}`
  ),
  ...guard(
    "transactions",
    "ledger_job",
    "NEW.job_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM syntx_jobs WHERE id=NEW.job_id AND user_id=NEW.user_id)"
  ),
  ...guard(
    "syntx_jobs",
    "job_amounts",
    `NOT ${validMoney("NEW.estimated_cost_rub")} OR NOT ${validMoney("NEW.max_cost_rub")} OR ${cents("NEW.max_cost_rub")} < ${cents("NEW.estimated_cost_rub")} OR (NEW.charged_cost_rub IS NOT NULL AND NOT ${validMoney("NEW.charged_cost_rub")})`
  ),
  ...guard(
    "syntx_jobs",
    "job_ownership",
    "NOT EXISTS(SELECT 1 FROM syntx_chats WHERE id=NEW.chat_id AND user_id=NEW.user_id) OR NOT EXISTS(SELECT 1 FROM syntx_quotes WHERE id=NEW.quote_id AND user_id=NEW.user_id)"
  ),
  ...guard(
    "syntx_artifacts",
    "artifact_ownership",
    "NOT EXISTS(SELECT 1 FROM syntx_jobs WHERE id=NEW.job_id AND user_id=NEW.user_id)"
  ),
  ...[
    "syntx_chats",
    "syntx_quotes",
    "syntx_jobs",
    "syntx_files",
    "syntx_artifacts",
  ].flatMap((table) =>
    guard(
      table,
      "owner_exists",
      'NOT EXISTS(SELECT 1 FROM "user" WHERE id=NEW.user_id)'
    )
  ),
  ...protectParent(
    "user",
    [
      "syntx_chats",
      "syntx_quotes",
      "syntx_jobs",
      "syntx_files",
      "syntx_artifacts",
    ]
      .map((table) => `EXISTS(SELECT 1 FROM ${table} WHERE user_id=OLD.id)`)
      .join(" OR ")
  ),
  ...protectParent(
    "syntx_chats",
    "EXISTS(SELECT 1 FROM syntx_jobs WHERE chat_id=OLD.id)"
  ),
  ...protectParent(
    "syntx_quotes",
    "EXISTS(SELECT 1 FROM syntx_jobs WHERE quote_id=OLD.id)"
  ),
  ...protectParent(
    "syntx_jobs",
    "EXISTS(SELECT 1 FROM syntx_artifacts WHERE job_id=OLD.id) OR EXISTS(SELECT 1 FROM transactions WHERE job_id=OLD.id)"
  ),
  ...["transactions", "admin_audit"].flatMap((table) =>
    ["UPDATE", "DELETE"].map(
      (operation) =>
        `CREATE TRIGGER IF NOT EXISTS "${table}_immutable_${operation.toLowerCase()}" BEFORE ${operation} ON "${table}" BEGIN SELECT RAISE(ABORT,'Financial and audit records are append-only'); END`
    )
  ),
  "CREATE UNIQUE INDEX IF NOT EXISTS credential_user_unique ON account(user_id) WHERE provider_id='credential'",
];
