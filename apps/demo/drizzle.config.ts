import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL?.trim();
const isPg = url && /^postgres(ql)?:\/\//i.test(url);

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
        url:
          process.env.SQLITE_PATH?.trim() ||
          "./storage/database/studio.sqlite",
      },
      dialect: "sqlite",
      out: "./drizzle",
      schema: "./lib/db/sqlite-schema.ts",
    });
