import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";
import { connections } from "./connections.js";
import { vector } from "./embeddings.js";
import { EMBEDDING } from "@openellie/shared/constants";

/**
 * Sentry Issues — synced from Sentry REST API.
 * Embedding from: title + culprit.
 */
export const sentryIssues = pgTable(
  "sentry_issues",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    connectionId: uuid("connection_id")
      .references(() => connections.id, { onDelete: "cascade" })
      .notNull(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /** Sentry issue ID — unique. */
    sentryId: text("sentry_id").unique().notNull(),

    /** Error title / exception type. */
    title: text("title").notNull(),

    /** File path or module where the error originated. */
    culprit: text("culprit"),

    /** Error level: 'fatal' | 'error' | 'warning' | 'info' | 'debug' */
    level: text("level").notNull(),

    /** Issue status: 'unresolved' | 'resolved' | 'ignored' */
    status: text("status").notNull(),

    /** Number of times this issue has occurred. */
    timesSeen: integer("times_seen").default(0).notNull(),

    firstSeen: timestamp("first_seen", { withTimezone: true }).notNull(),
    lastSeen: timestamp("last_seen", { withTimezone: true }).notNull(),

    /** Sentry project slug. */
    projectName: text("project_name").notNull(),

    /** Sentry tags as key-value pairs (e.g. { browser: 'Chrome', os: 'macOS' }). */
    tags: jsonb("tags"),

    /** Semantic embedding: title + culprit. */
    embedding: vector("embedding", { dimensions: EMBEDDING.DIMENSIONS }),
  },
  (t) => [
    index("sentry_issues_workspace_id_idx").on(t.workspaceId),
    index("sentry_issues_connection_id_idx").on(t.connectionId),
    index("sentry_issues_level_idx").on(t.level),
    index("sentry_issues_status_idx").on(t.status),
    index("sentry_issues_last_seen_idx").on(t.lastSeen),
    index("sentry_issues_project_idx").on(t.projectName),
  ],
);

export type SentryIssue = typeof sentryIssues.$inferSelect;
export type NewSentryIssue = typeof sentryIssues.$inferInsert;
