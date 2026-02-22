import { eq, and } from "drizzle-orm";
import { apiKeys, type ApiKey, type NewApiKey } from "@openellie/db/schema";
import { getDatabase } from "../client.js";
import { DatabaseError } from "../../errors.js";

/**
 * Creates a new API key record.
 *
 * @param apiKey - API key data to insert.
 * @returns Created API key record.
 */
export async function createApiKey(apiKey: NewApiKey): Promise<ApiKey> {
  const db = getDatabase();

  try {
    const result = await db.insert(apiKeys).values(apiKey).returning();
    const row = result[0];
    if (!row) throw new DatabaseError("Insert returned no rows");
    return row;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to create API key", error);
  }
}

/**
 * Returns the currently active API key for a workspace.
 *
 * @param workspaceId - Workspace UUID.
 * @returns Active API key or undefined.
 */
export async function getActiveApiKey(
  workspaceId: string,
): Promise<ApiKey | undefined> {
  const db = getDatabase();

  try {
    const result = await db
      .select()
      .from(apiKeys)
      .where(
        and(
          eq(apiKeys.workspaceId, workspaceId),
          eq(apiKeys.isActive, true),
        ),
      )
      .limit(1);

    return result[0];
  } catch (error) {
    throw new DatabaseError("Failed to fetch active API key", error);
  }
}

/**
 * Deactivates all existing API keys for a workspace, then activates the given key.
 * Atomic via sequential DB updates (single-workspace, low contention).
 *
 * @param workspaceId - Workspace UUID.
 * @param keyId - ID of the key to activate.
 */
export async function setActiveApiKey(
  workspaceId: string,
  keyId: string,
): Promise<void> {
  const db = getDatabase();

  try {
    // Deactivate all keys
    await db
      .update(apiKeys)
      .set({ isActive: false })
      .where(eq(apiKeys.workspaceId, workspaceId));

    // Activate the specified key
    await db
      .update(apiKeys)
      .set({ isActive: true })
      .where(and(eq(apiKeys.id, keyId), eq(apiKeys.workspaceId, workspaceId)));
  } catch (error) {
    throw new DatabaseError("Failed to set active API key", error);
  }
}

/**
 * Deletes an API key.
 *
 * @param id - API key UUID.
 */
export async function deleteApiKey(id: string): Promise<void> {
  const db = getDatabase();

  try {
    await db.delete(apiKeys).where(eq(apiKeys.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to delete API key", error);
  }
}
