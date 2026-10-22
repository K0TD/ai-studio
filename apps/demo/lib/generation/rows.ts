import type { ProviderOutput } from "@/lib/routerai/client";
import type { RouterAIVideoResponse } from "@/lib/routerai/types";
import type { AuthUser } from "@/lib/security/http";

import type { CatalogModel } from "./catalog";
import type { GenerationRequest } from "./contracts";

export interface StoredProviderResult {
  id?: string;
  status?: RouterAIVideoResponse["status"];
  unsigned_urls?: string[];
  usage?: { cost?: number };
  urls?: ProviderOutput["urls"];
  cost?: number;
  generationId?: string;
}
export type JobState =
  | "queued"
  | "submitting"
  | "running"
  | "persisting"
  | "reconciling"
  | "completed"
  | "failed";
export interface JobRow {
  id: string;
  user_id: string;
  chat_id: string;
  quote_id: string;
  idempotency_key: string;
  request_hash: string;
  tab: GenerationRequest["tab"];
  model_id: string;
  prompt: string;
  request: GenerationRequest;
  catalog_snapshot: CatalogModel;
  status: JobState;
  provider_id: string | null;
  provider_result: StoredProviderResult | null;
  estimated_cost_rub: string;
  max_cost_rub: string;
  charged_cost_rub: string | null;
  provider_cost_rub: string | null;
  variance_rub: string | null;
  pricing_source: "actual" | "estimated" | null;
  error: string | null;
  submitted_at: Date | null;
  settled_at: Date | null;
  lease_token: string | null;
  leased_until: Date | null;
  poll_at: Date;
  attempts: number;
  created_at: Date;
  updated_at: Date;
}
export interface ChatRow {
  id: string;
  user_id: string;
  title: string;
  tab: GenerationRequest["tab"];
  is_favorite: boolean;
  created_at: Date;
  deleted_at: Date | null;
}
export interface FileRow {
  id: string;
  user_id: string;
  filename: string;
  storage_key: string;
  mime_type: string;
  size_bytes: number;
  created_at: Date;
}
export interface ArtifactRow extends Omit<FileRow, "filename"> {
  job_id: string;
  ordinal: number;
}
export interface WalletRow {
  id: string;
  balance_rub: string;
  reserved_rub: string;
  is_banned: boolean;
  is_approved: boolean;
  activated_at: Date | null;
  role: string;
  permissions: AuthUser["permissions"];
}
export interface QuoteRow {
  id: string;
  user_id: string;
  request_hash: string;
  estimated_cost_rub: string;
  max_cost_rub: string;
  catalog_snapshot: CatalogModel;
  expires_at: Date;
  created_at: Date;
}
