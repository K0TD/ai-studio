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

const getTrustedOrigins = () => [new URL(getBaseURL()).origin];

const createAuth = () =>
  betterAuth({
    advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
    baseURL: getBaseURL(),
    database: drizzleAdapter(db, {
      provider: isPostgres ? "pg" : "sqlite",
      schema: isPostgres ? pgSchema : sqliteSchema,
    }),
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

let authInstance: ReturnType<typeof createAuth> | undefined;
export const getAuth = () => (authInstance ??= createAuth());

// Build-time route discovery must not initialize authentication without runtime secrets.
export const auth = new Proxy(
  // SAFETY: Every property is forwarded to the initialized Better Auth instance.
  {} as ReturnType<typeof createAuth>,
  {
    get(_target, property) {
      const instance = getAuth();
      // Better Auth exposes dynamically named API properties through this lazy proxy.
      // oxlint-disable-next-line anti-slop/no-reflect-get
      const value = Reflect.get(instance, property);
      // Preserve the receiver for Better Auth's public methods.
      // oxlint-disable-next-line anti-slop/no-runtime-typeof
      return typeof value === "function" ? value.bind(instance) : value;
    },
  }
);
