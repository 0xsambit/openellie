import { eq, desc } from "drizzle-orm";
import { syncJobs, type SyncJob, type NewSyncJob } from "@openellie/db/schema";
import { getDatabase } from "../client.js";
import { DatabaseError } from "../../errors.js";

/**
 * Creates a new sync job record.
 *
 * @param job - Sync job data.
 * @returns Created sync job.
 */
export async function createSyncJob(job: NewSyncJob): Promise<SyncJob> {
  const db = getDatabase();

  try {
    const result = await db.insert(syncJobs).values(job).returning();
    const row = result[0];
    if (!row) throw new DatabaseError("Insert returned no rows");
    return row;
  } catch (error) {
    if (error instanceof DatabaseError) throw error;
    throw new DatabaseError("Failed to create sync job", error);
  }
}

/**
 * Updates sync job progress.
 *
 * @param id - Sync job UUID.
 * @param updates - Fields to update.
 */
export async function updateSyncJob(
  id: string,
  updates: Partial<
    Pick<
      SyncJob,
      | "status"
      | "totalItems"
      | "processedItems"
      | "failedItems"
      | "errorMessage"
      | "startedAt"
      | "completedAt"
    >
  >,
): Promise<void> {
  const db = getDatabase();

  try {
    await db.update(syncJobs).set(updates).where(eq(syncJobs.id, id));
  } catch (error) {
    throw new DatabaseError("Failed to update sync job", error);
  }
}

/**
 * Returns the most recent sync job for a connection.
 *
 * @param connectionId - Connection UUID.
 */
export async function getLatestSyncJob(
  connectionId: string,
): Promise<SyncJob | undefined> {
  const db = getDatabase();

  try {
    const result = await db
      .select()
      .from(syncJobs)
      .where(eq(syncJobs.connectionId, connectionId))
      .orderBy(desc(syncJobs.createdAt))
      .limit(1);

    return result[0];
  } catch (error) {
    throw new DatabaseError("Failed to fetch latest sync job", error);
  }
}
