import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { db, isPostgres } from "@/lib/db";
// biome-ignore lint/performance/noNamespaceImport: drizzleAdapter needs the full schema namespace to resolve tables
import * as pgSchema from "@/lib/db/schema";
import * as sqliteSchema from "@/lib/db/sqlite-schema";

const getBaseURL = () => {
  if (process.env.NODE_ENV === "production") {
    return process.env.BETTER_AUTH_URL;
  }
  return process.env.BETTER_AUTH_URL_DEV ?? "http://localhost:3000";
};

const getTrustedOrigins = () => {
  const list = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.255.255.254:3000",
  ];
  if (process.env.BETTER_AUTH_URL) {
    try {
      list.push(new URL(process.env.BETTER_AUTH_URL).origin);
    } catch {
      list.push(process.env.BETTER_AUTH_URL);
    }
  }
  return Array.from(new Set(list));
};

const createAuth = () => {
  const schema = isPostgres ? pgSchema : sqliteSchema;
  return betterAuth({
    advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
    baseURL: getBaseURL(),
    database: isPostgres
      ? drizzleAdapter(db, { provider: "pg", schema: pgSchema })
      : drizzleAdapter(db, { provider: "sqlite", schema: sqliteSchema }),
    databaseHooks: {
      session: {
        create: {
          before: async (candidate) => {
            const [account] = await db
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, candidate.userId));
            if (
              !account ||
              account.isBanned ||
              (!account.activatedAt && !account.isEnvAdmin)
            ) {
              return false;
            }
          },
        },
      },
    },
    emailAndPassword: {
      disableSignUp: true,
      enabled: true,
      maxPasswordLength: 128,
      minPasswordLength: 12,
    },
    logger: { disabled: process.env.NODE_ENV === "production" },
    plugins: [username({ maxUsernameLength: 64 })],
    rateLimit: { enabled: true, max: 60, window: 60 },
    secret: process.env.BETTER_AUTH_SECRET,
    session: {
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 60,
    },
    trustedOrigins: getTrustedOrigins(),
    user: {
      additionalFields: {
        isApproved: { defaultValue: true, input: false, type: "boolean" },
        isBanned: { defaultValue: false, input: false, type: "boolean" },
        isEnvAdmin: { defaultValue: false, input: false, type: "boolean" },
        role: { defaultValue: "user", input: false, type: "string" },
      },
    },
  });

let authInstance: ReturnType<typeof createAuth> | undefined;
const getAuth = () => (authInstance ??= createAuth());

// Build-time route discovery must not initialize authentication without runtime secrets.
export const auth = {
  get api() {
    return getAuth().api;
  },
  handler: (request: Request) => getAuth().handler(request),
};
