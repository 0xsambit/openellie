import { eq } from "drizzle-orm";
import { workspaces, type Workspace, type NewWorkspace } from "@openellie/db/schema";
import { getDatabase } from "../client.js";
import { DatabaseError } from "../../errors.js";

/**
 * Returns the single workspace record for this self-hosted instance.
 *
 * @returns The workspace, or undefined if not yet seeded.
 */
export async function getWorkspace(): Promise<Workspace | undefined> {
  const db = getDatabase();

  try {
    const result = await db.select().from(workspaces).limit(1);
    return result[0];
  } catch (error) {
    throw new DatabaseError("Failed to fetch workspace", error);
  }
}

/**
 * Returns the workspace by its Slack team ID.
 *
 * @param slackTeamId - Slack team ID (e.g. T0123456789).
 * @returns The workspace, or undefined if not found.
 */
export async function getWorkspaceByTeamId(
  slackTeamId: string,
): Promise<Workspace | undefined> {
  const db = getDatabase();

  try {
    const result = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.slackTeamId, slackTeamId))
      .limit(1);

    return result[0];
  } catch (error) {
    throw new DatabaseError("Failed to fetch workspace by team ID", error);
  }
}

/**
 * Creates the workspace record on first boot.
 *
 * @param workspace - Workspace data.
 * @returns Created workspace.
 */
export async function createWorkspace(
  workspace: NewWorkspace,
): Promise<Workspace> {
  const db = getDatabase();

  try {
    const result = await db
      .insert(workspaces)
      .values(workspace)
      .onConflictDoNothing()
      .returning();

    // If onConflictDoNothing returned nothing, fetch the existing record
    if (result.length === 0) {
      const existing = await getWorkspaceByTeamId(workspace.slackTeamId);
      if (!existing) {
        throw new DatabaseError("Failed to create or find workspace");
      }
      return existing;
    }

    const row = result[0];
    if (!row) throw new DatabaseError("Insert returned no rows");
    return row;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to create workspace", error);
  }
}

/**
 * Updates workspace settings.
 *
 * @param id - Workspace UUID.
 * @param updates - Fields to update.
 */
export async function updateWorkspace(
  id: string,
  updates: Partial<Pick<Workspace, "slackTeamName" | "syncFrequencyHours" | "dataRetentionDays">>,
): Promise<void> {
  const db = getDatabase();

  try {
    await db
      .update(workspaces)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(workspaces.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to update workspace", error);
  }
}
