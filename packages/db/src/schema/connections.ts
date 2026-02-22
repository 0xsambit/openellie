import {
  pgTable,
  uuid,
  text,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";

/**
 * Connections table — stores credentials and config for each external tool integration.
 */
export const connections = pgTable(
  "connections",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /** Connector type: 'github' | 'jira' | 'linear' | 'sentry' | 'posthog' */
    type: text("type").notNull(),

    /** Human-readable connection name, e.g. "myorg GitHub". */
    name: text("name").notNull(),

    /**
     * AES-256-GCM encrypted credentials JSON.
     * Format: "iv:authTag:ciphertext" of JSON string.
     * Contents vary by connector type (e.g. { pat: "...", org: "..." } for GitHub).
     */
    encryptedCredentials: text("encrypted_credentials").notNull(),

    /**
     * Public configuration — non-sensitive settings.
     * e.g. { repos: ["org/repo1"], projectIds: ["PROJ"] }
     */
    config: jsonb("config"),

    /** Connection status: 'pending' | 'active' | 'syncing' | 'error' */
    status: text("status").default("pending").notNull(),

    /** Timestamp of last successful incremental sync. Used as `since` cursor. */
    lastSyncedAt: timestamp("last_synced_at", { withTimezone: true }),

    /** Error message from the most recent failed sync or validation. */
    errorMessage: text("error_message"),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("connections_workspace_id_idx").on(t.workspaceId),
    index("connections_type_idx").on(t.type),
  ],
);

export type Connection = typeof connections.$inferSelect;
export type NewConnection = typeof connections.$inferInsert;
