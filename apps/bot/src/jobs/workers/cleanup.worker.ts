import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";
import { getDatabase } from "../../lib/db/client.js";
import { QUEUE_NAMES } from "../queues.js";
import type { CleanupJobData } from "../queues.js";
import { lt, and, eq } from "drizzle-orm";

/**
 * Cleanup worker — processes jobs from the `cleanup-queue`.
 *
 * Enforces data retention policy by deleting rows older than
 * `retentionDays` days from all data tables.
 *
 * Runs daily via the scheduler.
 */
export function createCleanupWorker(): Worker<CleanupJobData> {
  const worker = new Worker<CleanupJobData>(
    QUEUE_NAMES.CLEANUP,
    async (job: Job<CleanupJobData>) => {
      const { workspaceId, retentionDays } = job.data;

      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - retentionDays);

      logger.info(
        { workspaceId, retentionDays, cutoff },
        "Cleanup job starting",
      );

      try {
        const counts = await cleanupOldData(workspaceId, cutoff);

        logger.info(
          { workspaceId, counts, cutoff },
          "Cleanup job completed",
        );
      } catch (error) {
        logger.error({ err: error, workspaceId }, "Cleanup job failed");
        throw error;
      }
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      connection: getRedis() as any,
      concurrency: 1, // Cleanup is I/O heavy — run one at a time
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Cleanup worker job permanently failed");
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Cleanup worker error");
  });

  return worker;
}

/**
 * Deletes rows older than the cutoff date from all workspace data tables.
 *
 * @returns Record of table name → number of rows deleted.
 */
async function cleanupOldData(
  workspaceId: string,
  cutoff: Date,
): Promise<Record<string, number>> {
  const db = getDatabase();
  const schema = await import("@openellie/db/schema");
  const counts: Record<string, number> = {};

  // Delete old PRs
  const deletedPrs = await db
    .delete(schema.githubPullRequests)
    .where(
      and(
        eq(schema.githubPullRequests.workspaceId, workspaceId),
        lt(schema.githubPullRequests.updatedAt, cutoff),
      ),
    )
    .returning({ id: schema.githubPullRequests.id });
  counts["github_pull_requests"] = deletedPrs.length;

  // Delete old commits
  const deletedCommits = await db
    .delete(schema.githubCommits)
    .where(
      and(
        eq(schema.githubCommits.workspaceId, workspaceId),
        lt(schema.githubCommits.committedAt, cutoff),
      ),
    )
    .returning({ id: schema.githubCommits.id });
  counts["github_commits"] = deletedCommits.length;

  // Delete old releases
  const deletedReleases = await db
    .delete(schema.githubReleases)
    .where(
      and(
        eq(schema.githubReleases.workspaceId, workspaceId),
        lt(schema.githubReleases.createdAt, cutoff),
      ),
    )
    .returning({ id: schema.githubReleases.id });
  counts["github_releases"] = deletedReleases.length;

  // Delete old tickets
  const deletedTickets = await db
    .delete(schema.tickets)
    .where(
      and(
        eq(schema.tickets.workspaceId, workspaceId),
        lt(schema.tickets.updatedAt, cutoff),
      ),
    )
    .returning({ id: schema.tickets.id });
  counts["tickets"] = deletedTickets.length;

  // Delete old Sentry issues
  const deletedSentryIssues = await db
    .delete(schema.sentryIssues)
    .where(
      and(
        eq(schema.sentryIssues.workspaceId, workspaceId),
        lt(schema.sentryIssues.firstSeen, cutoff),
      ),
    )
    .returning({ id: schema.sentryIssues.id });
  counts["sentry_issues"] = deletedSentryIssues.length;

  // Delete old query logs (always clean up after 90 days regardless of retention)
  const queryLogCutoff = new Date();
  queryLogCutoff.setDate(queryLogCutoff.getDate() - 90);
  const deletedQueryLogs = await db
    .delete(schema.queryLogs)
    .where(
      and(
        eq(schema.queryLogs.workspaceId, workspaceId),
        lt(schema.queryLogs.createdAt, queryLogCutoff),
      ),
    )
    .returning({ id: schema.queryLogs.id });
  counts["query_logs"] = deletedQueryLogs.length;

  return counts;
}
