import { getWorkspace } from "../lib/db/queries/workspaces.js";
import { getConnections } from "../lib/db/queries/connections.js";
import { createSyncJob } from "../lib/db/queries/sync-jobs.js";
import { getSyncQueue, getCleanupQueue } from "./queues.js";
import { logger } from "../lib/logger.js";

/**
 * Default sync frequency in hours when workspace setting is not configured.
 */
const DEFAULT_SYNC_FREQUENCY_HOURS = 4;

/**
 * Registers all repeating BullMQ jobs.
 *
 * Should be called once at bot startup, after the database is ready.
 * BullMQ handles deduplication — duplicate upsertJobScheduler calls are safe.
 */
export async function registerScheduledJobs(): Promise<void> {
  logger.info("Registering scheduled jobs");

  const workspace = await getWorkspace();
  if (!workspace) {
    logger.warn("No workspace found — skipping scheduled job registration");
    return;
  }

  const syncFrequencyHours =
    Number(workspace.syncFrequencyHours) || DEFAULT_SYNC_FREQUENCY_HOURS;

  // Register repeating sync jobs for each active connection
  await registerSyncJobs(workspace.id, syncFrequencyHours);

  // Register daily cleanup job
  await registerCleanupJob(workspace.id, Number(workspace.dataRetentionDays) || 90);

  logger.info(
    { workspaceId: workspace.id, syncFrequencyHours },
    "Scheduled jobs registered",
  );
}

/**
 * Registers repeating sync jobs for all active connections.
 *
 * Uses BullMQ's job scheduler (upsertJobScheduler) so that:
 * - Jobs survive Redis restarts
 * - Frequency changes are picked up automatically on next startup
 *
 * The sync worker creates the sync_jobs DB record when it processes the job.
 */
async function registerSyncJobs(
  workspaceId: string,
  syncFrequencyHours: number,
): Promise<void> {
  const connections = await getConnections(workspaceId);
  const syncQueue = getSyncQueue();

  for (const connection of connections) {
    if (connection.status === "error" || connection.status === "deleted") {
      continue;
    }

    const schedulerId = `sync:${connection.id}`;

    // upsertJobScheduler is the BullMQ v5 API for repeating jobs.
    // data must be a plain value — the sync worker creates the DB tracking record.
    await syncQueue.upsertJobScheduler(
      schedulerId,
      {
        every: syncFrequencyHours * 60 * 60 * 1_000, // ms
      },
      {
        name: schedulerId,
        data: {
          connectionId: connection.id,
          workspaceId,
          connectorType: connection.type,
          since: connection.lastSyncedAt?.toISOString(),
          // syncJobId is omitted — the sync worker creates it on execution
        },
      },
    );

    logger.debug(
      { connectionId: connection.id, schedulerId, syncFrequencyHours },
      "Sync job scheduler registered",
    );
  }
}

/**
 * Registers a daily data cleanup job.
 */
async function registerCleanupJob(
  workspaceId: string,
  retentionDays: number,
): Promise<void> {
  const cleanupQueue = getCleanupQueue();

  await cleanupQueue.upsertJobScheduler(
    `cleanup:${workspaceId}`,
    {
      every: 24 * 60 * 60 * 1_000, // 24 hours
    },
    {
      name: `cleanup:${workspaceId}`,
      data: {
        workspaceId,
        retentionDays,
      },
    },
  );

  logger.debug({ workspaceId, retentionDays }, "Cleanup job scheduler registered");
}

/**
 * Triggers an immediate full sync for a connection (manual "Sync Now").
 *
 * @param connectionId - The connection to sync.
 * @param workspaceId - Workspace context.
 * @param connectorType - Connector type string.
 * @returns The sync_jobs table row ID.
 */
export async function triggerManualSync(
  connectionId: string,
  workspaceId: string,
  connectorType: string,
): Promise<string> {
  const syncQueue = getSyncQueue();

  // For manual syncs, create the DB record immediately so callers can track it
  const syncJob = await createSyncJob({
    workspaceId,
    connectionId,
    syncType: "full",
    status: "pending",
  });

  const job = await syncQueue.add(
    `manual-sync:${connectionId}`,
    {
      connectionId,
      workspaceId,
      connectorType,
      syncJobId: syncJob.id,
      // No `since` — full sync
    },
    {
      priority: 10, // Higher priority than scheduled syncs
    },
  );

  logger.info(
    { connectionId, workspaceId, bullmqJobId: job.id, syncJobId: syncJob.id },
    "Manual sync triggered",
  );

  return syncJob.id;
}
