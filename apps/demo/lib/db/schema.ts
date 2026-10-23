import { createGenerationTable } from "@two-71/studio/schema";
import { relations, sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";

// Better-auth's tables (auto-shaped to match its Drizzle adapter's expected
// column names) plus the package's generation table fragment,
// spread in via createGenerationTable's factory so its userId FK points at
// this app's own `user` table.
import type { AdminAuditDetails } from "../admin/types";
import { DEFAULT_USER_PERMISSIONS } from "../security/permissions";
import type { UserPermissions, UserRole } from "../security/permissions";
export * from "../generation/schema";
export const user = pgTable(
  "user",
  {
    activatedAt: timestamp("activated_at", { withTimezone: true }),
    balanceRub: numeric("balance_rub", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    displayUsername: text("display_username"),
    email: text("email").notNull().unique(),
    emailVerified: boolean("email_verified").default(false).notNull(),
    id: text("id").primaryKey(),
    image: text("image"),
    isApproved: boolean("is_approved").default(true).notNull(),
    isBanned: boolean("is_banned").default(false).notNull(),
    isEnvAdmin: boolean("is_env_admin").default(false).notNull(),
    name: text("name").notNull(),
    permissions: jsonb("permissions")
      .$type<UserPermissions>()
      .default(DEFAULT_USER_PERMISSIONS)
      .notNull(),
    reservedRub: numeric("reserved_rub", { precision: 12, scale: 2 })
      .default("0.00")
      .notNull(),
    role: text("role").$type<UserRole>().default("user").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    username: text("username").unique(),
  },
  (table) => [
    check("user_role_check", sql`${table.role} in ('user', 'vip', 'admin')`),
    check("user_balance_check", sql`${table.reservedRub} >= 0`),
    uniqueIndex("user_env_admin_unique")
      .on(table.isEnvAdmin)
      .where(sql`${table.isEnvAdmin} = true`),
  ]
);
export const transactions = pgTable(
  "transactions",
  {
    actorId: text("actor_id").references(() => user.id, {
      onDelete: "restrict",
    }),
    amountRub: numeric("amount_rub", { precision: 12, scale: 2 }).notNull(),
    balanceAfterRub: numeric("balance_after_rub", {
      precision: 12,
      scale: 2,
    }).notNull(),
    balanceBeforeRub: numeric("balance_before_rub", {
      precision: 12,
      scale: 2,
    }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    id: text("id").primaryKey(),
    idempotencyKey: text("idempotency_key").notNull().unique(),
    jobId: text("job_id"),
    reason: text("reason").notNull(),
    type: text("type").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "restrict" }),
  },
  (table) => [
    index("transactions_user_created_idx").on(table.userId, table.createdAt),
  ]
);
export const adminAudit = pgTable(
  "admin_audit",
  {
    action: text("action").notNull(),
    actorId: text("actor_id"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    details: jsonb("details").$type<AdminAuditDetails>().default({}).notNull(),
    id: text("id").primaryKey(),
    requestId: text("request_id"),
    targetId: text("target_id"),
  },
  (table) => [index("admin_audit_created_idx").on(table.createdAt)]
);
export const invitation = pgTable(
  "invitation",
  {
    createdAt: timestamp("created_at", { withTimezone: true })
      .defaultNow()
      .notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    id: text("id").primaryKey(),
    tokenHash: text("token_hash").notNull().unique(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [uniqueIndex("invitation_user_unique").on(table.userId)]
);
export const rateLimit = pgTable("rate_limit", {
  count: integer("count").default(0).notNull(),
  id: text("id").primaryKey(),
  key: text("key").notNull().unique(),
  lastRequest: bigint("last_request", { mode: "number" }).notNull(),
});
export const session = pgTable(
  "session",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    ipAddress: text("ip_address"),
    token: text("token").notNull().unique(),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)]
);
export const account = pgTable(
  "account",
  {
    accessToken: text("access_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at"),
    accountId: text("account_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    id: text("id").primaryKey(),
    idToken: text("id_token"),
    password: text("password"),
    providerId: text("provider_id").notNull(),
    refreshToken: text("refresh_token"),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
    scope: text("scope"),
    updatedAt: timestamp("updated_at")
      .$onUpdate(() => new Date())
      .notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("account_userId_idx").on(table.userId)]
);
export const verification = pgTable(
  "verification",
  {
    createdAt: timestamp("created_at").defaultNow().notNull(),
    expiresAt: timestamp("expires_at").notNull(),
    id: text("id").primaryKey(),
    identifier: text("identifier").notNull(),
    updatedAt: timestamp("updated_at")
      .defaultNow()
      .$onUpdate(() => new Date())
      .notNull(),
    value: text("value").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)]
);
export const generation = createGenerationTable(() => user.id);
export const userRelations = relations(user, ({ many }) => ({
  accounts: many(account),
  generations: many(generation),
  sessions: many(session),
}));
export const sessionRelations = relations(session, ({ one }) => ({
  user: one(user, { fields: [session.userId], references: [user.id] }),
}));
export const accountRelations = relations(account, ({ one }) => ({
  user: one(user, { fields: [account.userId], references: [user.id] }),
}));
export const generationRelations = relations(generation, ({ one }) => ({
  user: one(user, { fields: [generation.userId], references: [user.id] }),
}));
