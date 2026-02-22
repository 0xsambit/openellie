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

/**
 * PostHog Events — schema placeholder for Phase 4 connector.
 * Connector implementation is deferred but schema is defined upfront.
 */
export const posthogEvents = pgTable(
  "posthog_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    connectionId: uuid("connection_id")
      .references(() => connections.id, { onDelete: "cascade" })
      .notNull(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /** PostHog event name. e.g. '$pageview', 'user_signed_up' */
    eventName: text("event_name").notNull(),

    /** PostHog distinct_id for the user. */
    distinctId: text("distinct_id"),

    /** PostHog project API key / project ID. */
    projectId: text("project_id").notNull(),

    /** Event properties as JSON. */
    properties: jsonb("properties"),

    /** Number of times this event occurred (for aggregated rows). */
    count: integer("count").default(1).notNull(),

    /** Event timestamp. */
    timestamp: timestamp("timestamp", { withTimezone: true }).notNull(),
  },
  (t) => [
    index("posthog_events_workspace_id_idx").on(t.workspaceId),
    index("posthog_events_event_name_idx").on(t.eventName),
    index("posthog_events_timestamp_idx").on(t.timestamp),
    index("posthog_events_project_idx").on(t.projectId),
  ],
);

export type PosthogEvent = typeof posthogEvents.$inferSelect;
export type NewPosthogEvent = typeof posthogEvents.$inferInsert;
