import { defineConfig } from "drizzle-kit";

const url = process.env.DATABASE_URL;

if (!url) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  dbCredentials: {
    url,
  },
  dialect: "postgresql",
  out: "./drizzle",
  schema: "./lib/db/schema.ts",
});
