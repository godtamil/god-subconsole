import { pgTable, text, timestamp, boolean, jsonb } from "drizzle-orm/pg-core";
export const users = pgTable("users", {
  id: text().primaryKey(),
  email: text().notNull().unique(),
  name: text().notNull(),
  password: text().notNull(),
  role: text().notNull(),
  permissions: jsonb().$type<string[]>().notNull(),
  servers: jsonb().$type<string[]>().notNull(),
  suspended: boolean().notNull().default(false),
  totp: text(),
  pendingTotp: text("pending_totp"),
  recovery: jsonb().$type<string[]>().notNull().default([]),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const sessions = pgTable("sessions", {
  id: text().primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  csrf: text().notNull(),
  expires: timestamp({ withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const invitations = pgTable("invitations", {
  id: text().primaryKey(),
  email: text().notNull(),
  role: text().notNull(),
  permissions: jsonb().$type<string[]>().notNull(),
  servers: jsonb().$type<string[]>().notNull(),
  expires: timestamp({ withTimezone: true }).notNull(),
});
export const audit = pgTable("audit", {
  id: text().primaryKey(),
  actor: text().notNull(),
  action: text().notNull(),
  server: text(),
  result: text().notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
export const settings = pgTable("settings", {
  id: text().primaryKey(),
  value: jsonb().notNull(),
});
