import {
  pgTable,
  uuid,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

/**
 * Workspaces table — represents a Slack workspace (single row for self-hosted).
 * Schema supports multi-workspace upgrade path by keeping workspace_id FK everywhere.
 */
export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),

  /** Slack team ID (e.g. T0123456789) — unique per workspace. */
  slackTeamId: text("slack_team_id").unique().notNull(),

  /** Human-readable Slack workspace name. */
  slackTeamName: text("slack_team_name").notNull(),

  /**
   * AES-256-GCM encrypted Slack bot token.
   * Format: "iv:authTag:ciphertext" (all base64, colon-delimited).
   */
  slackBotToken: text("slack_bot_token").notNull(),

  /** Subscription plan — reserved for future use. Always 'free' in self-hosted. */
  plan: text("plan").default("free").notNull(),

  /** Sync frequency in hours: 1 | 4 | 12 | 24 */
  syncFrequencyHours: text("sync_frequency_hours").default("4").notNull(),

  /** Data retention period in days: 30 | 60 | 90 */
  dataRetentionDays: text("data_retention_days").default("90").notNull(),

  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export type Workspace = typeof workspaces.$inferSelect;
export type NewWorkspace = typeof workspaces.$inferInsert;
