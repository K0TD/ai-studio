import type { db } from "./index";
export type DatabaseTransaction = Parameters<
  Parameters<typeof db.transaction>[0]
>[0];
