import { eq, desc } from "drizzle-orm";
import { queryLogs, type QueryLog, type NewQueryLog } from "@openellie/db/schema";
import { getDatabase } from "../client.js";
import { DatabaseError } from "../../errors.js";

/**
 * Creates a query log entry.
 *
 * @param log - Query log data.
 * @returns Created log entry.
 */
export async function createQueryLog(log: NewQueryLog): Promise<QueryLog> {
  const db = getDatabase();

  try {
    const result = await db.insert(queryLogs).values(log).returning();
    const row = result[0];
    if (!row) throw new DatabaseError("Insert returned no rows");
    return row;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to create query log", error);
  }
}

/**
 * Updates the helpful/not-helpful feedback on a query log.
 *
 * @param id - Query log UUID.
 * @param wasHelpful - True if the user found the response helpful.
 */
export async function updateQueryFeedback(
  id: string,
  wasHelpful: boolean,
): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .update(queryLogs)
      .set({ wasHelpful })
      .where(eq(queryLogs.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to update query feedback", error);
  }
}

/**
 * Returns recent query logs for a workspace.
 *
 * @param workspaceId - Workspace UUID.
 * @param limit - Maximum number of entries to return.
 */
export async function getRecentQueryLogs(
  workspaceId: string,
  limit = 50,
): Promise<QueryLog[]> {
  const db = getDatabase();

  try {
    return db
      .select()
      .from(queryLogs)
      .where(eq(queryLogs.workspaceId, workspaceId))
      .orderBy(desc(queryLogs.createdAt))
      .limit(limit);
  } catch (error) {
    throw new DatabaseError("Failed to fetch query logs", error);
  }
}
