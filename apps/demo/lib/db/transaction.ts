import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as pgSchema from "./schema";

export type AppDb = NodePgDatabase<typeof pgSchema>;

export type DatabaseTransaction = Parameters<
  Parameters<AppDb["transaction"]>[0]
>[0];
