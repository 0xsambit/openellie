import {
  pgTable,
  uuid,
  text,
  integer,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";

/**
 * Query logs — records every Slack query and the generated response.
 * Used for analytics, debugging, and feedback collection.
 */
export const queryLogs = pgTable(
  "query_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /** Slack user ID of the requester (e.g. U0123456789). */
    slackUserId: text("slack_user_id").notNull(),

    /** Slack channel ID where the query was made. */
    slackChannelId: text("slack_channel_id").notNull(),

    /** Raw query text as sent by the user. */
    rawQuery: text("raw_query").notNull(),

    /** Cleaned/reformatted query as shown in the Slack response header. */
    resolvedQuery: text("resolved_query"),

    /** Data sources queried: e.g. ['github', 'jira'] */
    sourcesUsed: text("sources_used").array(),

    /** Full response text sent to Slack. */
    responseText: text("response_text"),

    /** End-to-end latency from query receipt to response send. */
    latencyMs: integer("latency_ms"),

    /** Total tokens consumed (prompt + completion) for this query. */
    tokenCount: integer("token_count"),

    /** User feedback: true = helpful, false = not helpful, null = no feedback. */
    wasHelpful: boolean("was_helpful"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("query_logs_workspace_id_idx").on(t.workspaceId),
    index("query_logs_slack_user_id_idx").on(t.slackUserId),
    index("query_logs_created_at_idx").on(t.createdAt),
  ],
);

export type QueryLog = typeof queryLogs.$inferSelect;
export type NewQueryLog = typeof queryLogs.$inferInsert;
