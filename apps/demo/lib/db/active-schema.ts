import { isPostgres } from "./index";
import * as pg from "./schema";
import * as sqlite from "./sqlite-schema";

export const s = isPostgres ? pg : sqlite;

// The application schema exposes the same fields, JSON, booleans and Date
// values on both dialects; only Drizzle's dialect-specific builder types differ.
const activeTable = <K extends keyof typeof pg & keyof typeof sqlite>(
  name: K
): (typeof pg)[K] => {
  // The key is restricted to table names shared by both owned schemas.
  // oxlint-disable-next-line import/namespace
  const selected: unknown = isPostgres ? pg[name] : sqlite[name];
  // SAFETY: Both owned schemas use identical domain fields and conversion modes.
  return selected as (typeof pg)[K];
};

export const user = activeTable("user");
export const account = activeTable("account");
export const session = activeTable("session");
export const verification = activeTable("verification");
export const transactions = activeTable("transactions");
export const adminAudit = activeTable("adminAudit");
export const invitation = activeTable("invitation");
export const rateLimit = activeTable("rateLimit");
export const syntxChats = activeTable("syntxChats");
export const syntxQuotes = activeTable("syntxQuotes");
export const syntxJobs = activeTable("syntxJobs");
export const syntxFiles = activeTable("syntxFiles");
export const syntxArtifacts = activeTable("syntxArtifacts");
export const syntxCatalog = activeTable("syntxCatalog");
export const syntxWorkerHeartbeats = activeTable("syntxWorkerHeartbeats");
