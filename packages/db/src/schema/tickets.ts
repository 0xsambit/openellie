import {
  pgTable,
  uuid,
  text,
  real,
  date,
  timestamp,
  jsonb,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";
import { connections } from "./connections.js";
import { vector } from "./embeddings.js";
import { EMBEDDING } from "@openellie/shared/constants";

/**
 * Unified tickets table — stores both Jira issues and Linear issues.
 * Common fields are top-level columns; source-specific data in `metadata` jsonb.
 * Embedding from: title + description + labels + sprint_name.
 */
export const tickets = pgTable(
  "tickets",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    connectionId: uuid("connection_id")
      .references(() => connections.id, { onDelete: "cascade" })
      .notNull(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /**
     * Source-specific ID.
     * Jira: issue key e.g. "PROJ-123"
     * Linear: UUID or identifier e.g. "ENG-456"
     */
    externalId: text("external_id").notNull(),

    /** Data source: 'jira' | 'linear' */
    source: text("source").notNull(),

    title: text("title").notNull(),
    description: text("description"),

    /** Ticket type: 'bug' | 'story' | 'task' | 'epic' | 'subtask' | 'improvement' */
    type: text("type"),

    /** Current workflow status, e.g. 'In Progress', 'Done', 'Backlog' */
    status: text("status"),

    /** Priority: 'urgent' | 'high' | 'medium' | 'low' | 'none' */
    priority: text("priority"),

    /** Assignee display name or login. */
    assignee: text("assignee"),

    /** Reporter display name. */
    reporter: text("reporter"),

    /** Array of label strings. */
    labels: text("labels").array(),

    /** Sprint/cycle external ID. */
    sprintId: text("sprint_id"),

    /** Sprint/cycle display name. */
    sprintName: text("sprint_name"),

    /** Story points or estimate. */
    storyPoints: real("story_points"),

    /** Epic name this ticket belongs to. */
    epicName: text("epic_name"),

    /** Project/team name. */
    projectName: text("project_name"),

    dueDate: date("due_date"),

    resolvedAt: timestamp("resolved_at", { withTimezone: true }),

    /** Source-specific fields that don't fit the common schema. */
    metadata: jsonb("metadata"),

    /** Ticket creation time in the source system. */
    createdAt: timestamp("created_at", { withTimezone: true }).notNull(),

    /** Ticket last update time in the source system. */
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),

    /** Semantic embedding: title + description + labels + sprint_name. */
    embedding: vector("embedding", { dimensions: EMBEDDING.DIMENSIONS }),
  },
  (t) => [
    index("tickets_workspace_id_idx").on(t.workspaceId),
    index("tickets_connection_id_idx").on(t.connectionId),
    index("tickets_source_idx").on(t.source),
    index("tickets_status_idx").on(t.status),
    index("tickets_assignee_idx").on(t.assignee),
    index("tickets_sprint_id_idx").on(t.sprintId),
    index("tickets_external_id_source_idx").on(t.externalId, t.source),
    index("tickets_updated_at_idx").on(t.updatedAt),
  ],
);

/**
 * Sprints / Cycles — tracks sprint metadata for velocity and progress queries.
 * Shared between Jira sprints and Linear cycles.
 */
export const sprints = pgTable(
  "sprints",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    connectionId: uuid("connection_id")
      .references(() => connections.id, { onDelete: "cascade" })
      .notNull(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    externalId: text("external_id").notNull(),

    /** Source: 'jira' | 'linear' */
    source: text("source").notNull(),

    name: text("name").notNull(),
    goal: text("goal"),

    /** Sprint state: 'active' | 'closed' | 'future' */
    state: text("state"),

    startDate: date("start_date"),
    endDate: date("end_date"),

    /** Story points completed in this sprint. */
    completedPoints: real("completed_points"),

    /** Total story points committed to this sprint. */
    totalPoints: real("total_points"),
  },
  (t) => [
    index("sprints_workspace_id_idx").on(t.workspaceId),
    index("sprints_connection_id_idx").on(t.connectionId),
    index("sprints_external_id_source_idx").on(t.externalId, t.source),
    index("sprints_state_idx").on(t.state),
  ],
);

export type Ticket = typeof tickets.$inferSelect;
export type NewTicket = typeof tickets.$inferInsert;

export type Sprint = typeof sprints.$inferSelect;
export type NewSprint = typeof sprints.$inferInsert;
