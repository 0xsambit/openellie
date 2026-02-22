import { eq, and } from "drizzle-orm";
import { connections, type Connection, type NewConnection } from "@openellie/db/schema";
import { getDatabase } from "../client.js";
import { DatabaseError } from "../../errors.js";

/**
 * Creates a new connection record.
 *
 * @param connection - Connection data to insert.
 * @returns Created connection.
 */
export async function createConnection(
  connection: NewConnection,
): Promise<Connection> {
  const db = getDatabase();

  try {
    const result = await db
      .insert(connections)
      .values(connection)
      .returning();

    const row = result[0];
    if (!row) throw new DatabaseError("Insert returned no rows");
    return row;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to create connection", error);
  }
}

/**
 * Fetches all connections for a workspace, optionally filtered by type.
 *
 * @param workspaceId - Workspace UUID.
 * @param type - Optional connector type filter.
 */
export async function getConnections(
  workspaceId: string,
  type?: string,
): Promise<Connection[]> {
  const db = getDatabase();

  try {
    const conditions = [eq(connections.workspaceId, workspaceId)];
    if (type) conditions.push(eq(connections.type, type));

    return db
      .select()
      .from(connections)
      .where(and(...conditions));
  } catch (error) {
    throw new DatabaseError("Failed to fetch connections", error);
  }
}

/**
 * Fetches a single connection by ID.
 *
 * @param id - Connection UUID.
 * @returns Connection or undefined if not found.
 */
export async function getConnectionById(
  id: string,
): Promise<Connection | undefined> {
  const db = getDatabase();

  try {
    const result = await db
      .select()
      .from(connections)
      .where(eq(connections.id, id));

    return result[0];
  } catch (error) {
    throw new DatabaseError("Failed to fetch connection", error);
  }
}

/**
 * Updates a connection's status and optional error message.
 *
 * @param id - Connection UUID.
 * @param status - New status.
 * @param errorMessage - Optional error message (cleared if status is not 'error').
 */
export async function updateConnectionStatus(
  id: string,
  status: string,
  errorMessage?: string,
): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .update(connections)
      .set({
        status,
        errorMessage: errorMessage ?? null,
        updatedAt: new Date(),
      })
      .where(eq(connections.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to update connection status", error);
  }
}

/**
 * Updates the last synced timestamp for a connection.
 *
 * @param id - Connection UUID.
 * @param lastSyncedAt - Timestamp of the most recent sync.
 */
export async function updateConnectionLastSynced(
  id: string,
  lastSyncedAt: Date,
): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .update(connections)
      .set({ lastSyncedAt, updatedAt: new Date() })
      .where(eq(connections.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to update connection last synced", error);
  }
}

/**
 * Deletes a connection and all its associated data (cascade).
 *
 * @param id - Connection UUID.
 */
export async function deleteConnection(id: string): Promise<void> {
  const db = getDatabase();

  try {
    await db.delete(connections).where(eq(connections.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to delete connection", error);
  }
}
