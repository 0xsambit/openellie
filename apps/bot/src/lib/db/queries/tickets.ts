import { eq, and, sql } from "drizzle-orm";
import { tickets, type Ticket, type NewTicket } from "@openellie/db/schema";
import { getDatabase } from "../client.js";
import { DatabaseError } from "../../errors.js";

/**
 * Upserts a batch of tickets by external_id + source.
 *
 * @param items - Array of ticket records to upsert.
 * @returns Number of rows affected.
 */
export async function upsertTickets(items: NewTicket[]): Promise<number> {
  if (items.length === 0) return 0;
  const db = getDatabase();

  try {
    const result = await db
      .insert(tickets)
      .values(items)
      .onConflictDoUpdate({
        target: [tickets.externalId, tickets.source],
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          status: sql`excluded.status`,
          priority: sql`excluded.priority`,
          assignee: sql`excluded.assignee`,
          labels: sql`excluded.labels`,
          sprintId: sql`excluded.sprint_id`,
          sprintName: sql`excluded.sprint_name`,
          storyPoints: sql`excluded.story_points`,
          updatedAt: sql`excluded.updated_at`,
          metadata: sql`excluded.metadata`,
        },
      });

    return result.length;
  } catch (error) {
    throw new DatabaseError("Failed to upsert tickets", error);
  }
}

/**
 * Fetches tickets needing embeddings.
 *
 * @param workspaceId - Workspace UUID.
 * @param limit - Maximum rows to return.
 */
export async function getTicketsNeedingEmbedding(
  workspaceId: string,
  limit = 100,
): Promise<
  Pick<Ticket, "id" | "title" | "description" | "labels" | "sprintName">[]
> {
  const db = getDatabase();

  try {
    return db
      .select({
        id: tickets.id,
        title: tickets.title,
        description: tickets.description,
        labels: tickets.labels,
        sprintName: tickets.sprintName,
      })
      .from(tickets)
      .where(
        and(
          eq(tickets.workspaceId, workspaceId),
          sql`${tickets.embedding} IS NULL`,
        ),
      )
      .limit(limit);
  } catch (error) {
    throw new DatabaseError("Failed to fetch tickets needing embedding", error);
  }
}

/**
 * Updates the embedding vector for a ticket.
 *
 * @param id - Ticket UUID.
 * @param embedding - 1536-dimensional float array.
 */
export async function updateTicketEmbedding(
  id: string,
  embedding: number[],
): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .update(tickets)
      .set({ embedding })
      .where(eq(tickets.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to update ticket embedding", error);
  }
}
