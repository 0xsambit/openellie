import {
  pgTable,
  uuid,
  text,
  integer,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";
import { connections } from "./connections.js";

/**
 * Sync jobs — tracks the progress of each connector sync operation.
 * Updated in real-time by the sync worker.
 */
export const syncJobs = pgTable(
  "sync_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    connectionId: uuid("connection_id")
      .references(() => connections.id, { onDelete: "cascade" })
      .notNull(),

    /** Job status: 'pending' | 'running' | 'completed' | 'failed' */
    status: text("status").default("pending").notNull(),

    /** Whether this was a full sync or incremental sync. */
    syncType: text("sync_type").default("incremental").notNull(),

    /** Total items discovered to sync. May be updated during sync. */
    totalItems: integer("total_items").default(0).notNull(),

    /** Items successfully synced so far. */
    processedItems: integer("processed_items").default(0).notNull(),

    /** Items that failed to sync. */
    failedItems: integer("failed_items").default(0).notNull(),

    /** Error message if status is 'failed'. */
    errorMessage: text("error_message"),

    startedAt: timestamp("started_at", { withTimezone: true }),
    completedAt: timestamp("completed_at", { withTimezone: true }),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("sync_jobs_workspace_id_idx").on(t.workspaceId),
    index("sync_jobs_connection_id_idx").on(t.connectionId),
    index("sync_jobs_status_idx").on(t.status),
    index("sync_jobs_created_at_idx").on(t.createdAt),
  ],
);

export type SyncJob = typeof syncJobs.$inferSelect;
export type NewSyncJob = typeof syncJobs.$inferInsert;
