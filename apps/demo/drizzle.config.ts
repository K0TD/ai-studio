import { defineConfig } from "drizzle-kit";

import { getSqlitePath } from "./lib/db/storage-path";

const url = process.env.DATABASE_URL?.trim();
const isPg = url && /^postgres(ql)?:\/\//iu.test(url);

export default isPg
  ? defineConfig({
      dbCredentials: {
        url,
      },
      dialect: "postgresql",
      out: "./drizzle",
      schema: "./lib/db/schema.ts",
    })
  : defineConfig({
      dbCredentials: {
        url: getSqlitePath(),
      },
      dialect: "sqlite",
      out: "./drizzle",
      schema: "./lib/db/sqlite-schema.ts",
    });
