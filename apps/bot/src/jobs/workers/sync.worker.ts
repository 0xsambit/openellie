import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { createSyncJob, updateSyncJob } from "../../lib/db/queries/sync-jobs.js";
import { logger } from "../../lib/logger.js";
import { ConnectorType } from "@openellie/shared/types";
import { NotImplementedError } from "../../lib/errors.js";
import { QUEUE_NAMES, getEmbedQueue } from "../queues.js";
import type { SyncJobData, EmbedJobData } from "../queues.js";

/**
 * Sync worker — processes jobs from the `sync-queue`.
 *
 * Each job:
 * 1. Looks up the connection + decrypts credentials
 * 2. Instantiates the right connector
 * 3. Calls full sync or incremental sync
 * 4. Updates connection + sync_jobs status
 * 5. Enqueues embed jobs for newly synced records
 */
export function createSyncWorker(): Worker<SyncJobData> {
  const worker = new Worker<SyncJobData>(
    QUEUE_NAMES.SYNC,
    async (job: Job<SyncJobData>) => {
      const { connectionId, workspaceId, connectorType, since } = job.data;

      // Create a DB tracking record if the scheduler didn't provide one
      const dbSyncJob = job.data.syncJobId
        ? { id: job.data.syncJobId }
        : await createSyncJob({
            workspaceId,
            connectionId,
            syncType: since ? "incremental" : "full",
            status: "pending",
          });
      const syncJobId = dbSyncJob.id;

      logger.info({ connectionId, connectorType, syncJobId }, "Sync job starting");

      try {
        await updateSyncJob(syncJobId, { status: "running" });

        const connector = await resolveConnector(connectorType, workspaceId);

        const syncOptions = {
          jobId: syncJobId,
          workspaceId,
        };

        const result = since
          ? await connector.incrementalSync(connectionId, new Date(since), syncOptions)
          : await connector.sync(connectionId, syncOptions);

        await updateSyncJob(syncJobId, {
          status: "completed",
          completedAt: new Date(),
          processedItems: result.itemsSynced,
          failedItems: result.itemsFailed,
        });

        logger.info(
          {
            connectionId,
            connectorType,
            itemsSynced: result.itemsSynced,
            itemsFailed: result.itemsFailed,
          },
          "Sync job completed",
        );

        // Enqueue embedding for synced items
        await enqueueEmbedJobs(workspaceId, connectorType);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);

        await updateSyncJob(syncJobId, {
          status: "failed",
          completedAt: new Date(),
          errorMessage,
        });

        logger.error(
          { err: error, connectionId, connectorType },
          "Sync job failed",
        );

        // Re-throw so BullMQ can apply retry logic
        throw error;
      }
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      connection: getRedis() as any,
      concurrency: 3,
      limiter: {
        max: 5,
        duration: 1_000,
      },
    },
  );

  worker.on("failed", (job, err) => {
    logger.error(
      { jobId: job?.id, err },
      "Sync worker job permanently failed",
    );
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Sync worker error");
  });

  return worker;
}

/**
 * Resolves the connector instance for the given type.
 *
 * Dynamically imports connectors to avoid loading all dependencies up-front.
 */
async function resolveConnector(
  connectorType: string,
  workspaceId: string,
): Promise<import("../../connectors/base.js").BaseConnector> {
  switch (connectorType) {
    case ConnectorType.GITHUB: {
      const { GitHubConnector } = await import("../../connectors/github/sync.js");
      return new GitHubConnector(workspaceId);
    }
    case ConnectorType.JIRA: {
      const { JiraConnector } = await import("../../connectors/jira/sync.js");
      return new JiraConnector(workspaceId);
    }
    case ConnectorType.LINEAR: {
      const { LinearConnector } = await import("../../connectors/linear/sync.js");
      return new LinearConnector(workspaceId);
    }
    case ConnectorType.SENTRY: {
      const { SentryConnector } = await import("../../connectors/sentry/sync.js");
      return new SentryConnector(workspaceId);
    }
    default:
      throw new NotImplementedError(connectorType);
  }
}

/**
 * Enqueues embedding jobs after a sync completes.
 * Connectors map to one or more embeddable sources.
 */
async function enqueueEmbedJobs(
  workspaceId: string,
  connectorType: string,
): Promise<void> {
  const embedQueue = getEmbedQueue();

  const sourceMap: Record<string, EmbedJobData["source"][]> = {
    [ConnectorType.GITHUB]: ["github_prs", "github_commits"],
    [ConnectorType.JIRA]: ["tickets"],
    [ConnectorType.LINEAR]: ["tickets"],
    [ConnectorType.SENTRY]: ["sentry_issues"],
  };

  const sources = sourceMap[connectorType] ?? [];

  for (const source of sources) {
    await embedQueue.add(
      `embed:${workspaceId}:${source}`,
      { workspaceId, source },
      {
        // Deduplicate: don't queue multiple embed jobs for same workspace+source
        jobId: `embed:${workspaceId}:${source}`,
      },
    );
  }
}
