export const POSTGRES_INTEGRITY_DDL = `
UPDATE "user" SET activated_at=created_at WHERE activated_at IS NULL
  AND EXISTS (SELECT 1 FROM account WHERE account.user_id="user".id AND provider_id='credential' AND length(password)>0);
--> statement-breakpoint
ALTER TABLE "user" ADD CONSTRAINT user_env_admin_protected
  CHECK (NOT is_env_admin OR (role='admin' AND NOT is_banned AND is_approved));
--> statement-breakpoint
ALTER TABLE syntx_chats ADD CONSTRAINT syntx_chats_user_fk FOREIGN KEY(user_id) REFERENCES "user"(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE syntx_quotes ADD CONSTRAINT syntx_quotes_user_fk FOREIGN KEY(user_id) REFERENCES "user"(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE syntx_jobs ADD CONSTRAINT syntx_jobs_user_fk FOREIGN KEY(user_id) REFERENCES "user"(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE syntx_files ADD CONSTRAINT syntx_files_user_fk FOREIGN KEY(user_id) REFERENCES "user"(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE syntx_artifacts ADD CONSTRAINT syntx_artifacts_user_fk FOREIGN KEY(user_id) REFERENCES "user"(id) ON DELETE RESTRICT;
--> statement-breakpoint
CREATE UNIQUE INDEX syntx_chats_owner_identity ON syntx_chats(user_id,id);
--> statement-breakpoint
CREATE UNIQUE INDEX syntx_quotes_owner_identity ON syntx_quotes(user_id,id);
--> statement-breakpoint
CREATE UNIQUE INDEX syntx_jobs_owner_identity ON syntx_jobs(user_id,id);
--> statement-breakpoint
ALTER TABLE syntx_jobs ADD CONSTRAINT syntx_jobs_owned_chat_fk FOREIGN KEY(user_id,chat_id) REFERENCES syntx_chats(user_id,id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE syntx_jobs ADD CONSTRAINT syntx_jobs_owned_quote_fk FOREIGN KEY(user_id,quote_id) REFERENCES syntx_quotes(user_id,id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE syntx_artifacts ADD CONSTRAINT syntx_artifacts_owned_job_fk FOREIGN KEY(user_id,job_id) REFERENCES syntx_jobs(user_id,id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_job_fk FOREIGN KEY(job_id) REFERENCES syntx_jobs(id) ON DELETE RESTRICT;
--> statement-breakpoint
ALTER TABLE transactions ADD CONSTRAINT transactions_arithmetic CHECK (balance_after_rub = balance_before_rub + amount_rub);
--> statement-breakpoint
ALTER TABLE syntx_jobs ADD CONSTRAINT syntx_jobs_amounts CHECK (estimated_cost_rub >= 0 AND max_cost_rub >= estimated_cost_rub AND (charged_cost_rub IS NULL OR (charged_cost_rub >= 0 AND charged_cost_rub <= max_cost_rub)));
--> statement-breakpoint
CREATE FUNCTION reject_ledger_rewrite() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  RAISE EXCEPTION 'Financial and audit records are append-only' USING ERRCODE = '23514';
END;
$$;
--> statement-breakpoint
CREATE TRIGGER transactions_immutable BEFORE UPDATE OR DELETE ON transactions FOR EACH ROW EXECUTE FUNCTION reject_ledger_rewrite();
--> statement-breakpoint
CREATE TRIGGER admin_audit_immutable BEFORE UPDATE OR DELETE ON admin_audit FOR EACH ROW EXECUTE FUNCTION reject_ledger_rewrite();
--> statement-breakpoint
CREATE UNIQUE INDEX credential_user_unique ON account(user_id) WHERE provider_id='credential';
`;
