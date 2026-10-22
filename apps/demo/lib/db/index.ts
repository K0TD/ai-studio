import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

import * as schema from "./schema";
// Pool construction is lazy: next build must not require a live database.
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 5000,
  idleTimeoutMillis: 30_000,
  max: 10,
});
pool.on("error", () =>
  console.error(JSON.stringify({ event: "database.pool_error" }))
);
export const db = drizzle({ client: pool, schema });
export const studioDb = drizzle({ client: pool });
