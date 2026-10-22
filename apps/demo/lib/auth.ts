import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { db, isPostgres } from "@/lib/db";
import { user } from "@/lib/db/active-schema";
// biome-ignore lint/performance/noNamespaceImport: drizzleAdapter needs the full schema namespace to resolve tables
import * as pgSchema from "@/lib/db/schema";
import * as sqliteSchema from "@/lib/db/sqlite-schema";

const getBaseURL = () => {
  if (process.env.BETTER_AUTH_URL?.trim()) {
    return process.env.BETTER_AUTH_URL.trim();
  }
  return process.env.BETTER_AUTH_URL_DEV?.trim() || "http://localhost:3000";
};

const getTrustedOrigins = () => {
  const list = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://10.255.255.254:3000",
  ];
  if (process.env.BETTER_AUTH_URL?.trim()) {
    try {
      list.push(new URL(process.env.BETTER_AUTH_URL.trim()).origin);
    } catch {
      list.push(process.env.BETTER_AUTH_URL.trim());
    }
  }
  return Array.from(new Set(list));
};

const createAuth = () => {
  return betterAuth({
    advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
    baseURL: getBaseURL(),
    database: isPostgres
      ? drizzleAdapter(db, { provider: "pg", schema: pgSchema })
      : drizzleAdapter(db as any, { provider: "sqlite", schema: sqliteSchema }),
    databaseHooks: {
      session: {
        create: {
          before: async (candidate) => {
            const [account] = await db
              .select()
              .from(user)
              .where(eq(user.id, candidate.userId));
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
    secret:
      process.env.BETTER_AUTH_SECRET?.trim() ||
      "build-time-secret-32-chars-minimum-fallback!!",
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
};

let authInstance: ReturnType<typeof createAuth> | undefined;
export const getAuth = () => (authInstance ??= createAuth());

// Build-time route discovery must not initialize authentication without runtime secrets.
export const auth = new Proxy({} as ReturnType<typeof createAuth>, {
  get(_target, prop, receiver) {
    return Reflect.get(getAuth(), prop, receiver);
  },
});
