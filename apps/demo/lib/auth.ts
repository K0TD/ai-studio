import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { username } from "better-auth/plugins";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
// biome-ignore lint/performance/noNamespaceImport: drizzleAdapter needs the full schema namespace to resolve tables
import * as schema from "@/lib/db/schema";

const createAuth = () =>
  betterAuth({
    advanced: { ipAddress: { ipAddressHeaders: ["x-forwarded-for"] } },
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, { provider: "pg", schema }),
    databaseHooks: {
      session: {
        create: {
          before: async (candidate) => {
            const [account] = await db
              .select()
              .from(schema.user)
              .where(eq(schema.user.id, candidate.userId));
            if (!account || account.isBanned || !account.activatedAt) {
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
    logger: { disabled: true },
    plugins: [username({ maxUsernameLength: 64 })],
    rateLimit: { enabled: true, max: 60, storage: "database", window: 60 },
    secret: process.env.BETTER_AUTH_SECRET,
    session: {
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 8,
      updateAge: 60 * 60,
    },
    trustedOrigins: [process.env.BETTER_AUTH_URL ?? "http://localhost:3000"],
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
