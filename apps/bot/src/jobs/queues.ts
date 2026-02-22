import { Queue } from "bullmq";
import { getRedis } from "../lib/redis.js";

/**
 * Job data for the sync queue.
 * Carries enough information for the sync worker to call the right connector.
 */
export interface SyncJobData {
  connectionId: string;
  workspaceId: string;
  connectorType: string;
  /** If set, perform incremental sync from this timestamp */
  since?: string;
  /** BullMQ sync_jobs table row ID for progress tracking (created by worker if absent) */
  syncJobId?: string;
}

/**
 * Job data for the embedding queue.
 * Workers process batches of records that need embedding.
 */
export interface EmbedJobData {
  workspaceId: string;
  /** Source table to embed */
  source: "github_prs" | "github_commits" | "tickets" | "sentry_issues";
  /** Optional: specific record IDs to embed. If empty, embeds all un-embedded. */
  recordIds?: string[];
}

/**
 * Job data for the cleanup queue.
 */
export interface CleanupJobData {
  workspaceId: string;
  /** Retention period in days — records older than this are deleted */
  retentionDays: number;
}

// ─── Queue names ──────────────────────────────────────────────────────────────

export const QUEUE_NAMES = {
  SYNC: "sync-queue",
  EMBED: "embed-queue",
  CLEANUP: "cleanup-queue",
} as const;

// ─── Queue singletons ─────────────────────────────────────────────────────────

let syncQueue: Queue<SyncJobData> | null = null;
let embedQueue: Queue<EmbedJobData> | null = null;
let cleanupQueue: Queue<CleanupJobData> | null = null;

/**
 * Returns (or creates) the sync queue singleton.
 */
export function getSyncQueue(): Queue<SyncJobData> {
  if (!syncQueue) {
    syncQueue = new Queue<SyncJobData>(QUEUE_NAMES.SYNC, {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      connection: getRedis() as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1_000, // 1s, 5s, 25s
        },
        removeOnComplete: { count: 100 },
        removeOnFail: { count: 500 },
      },
    });
  }
  return syncQueue;
}

/**
 * Returns (or creates) the embed queue singleton.
 */
export function getEmbedQueue(): Queue<EmbedJobData> {
  if (!embedQueue) {
    embedQueue = new Queue<EmbedJobData>(QUEUE_NAMES.EMBED, {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      connection: getRedis() as any,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 2_000,
        },
        removeOnComplete: { count: 200 },
        removeOnFail: { count: 200 },
      },
    });
  }
  return embedQueue;
}

/**
 * Returns (or creates) the cleanup queue singleton.
 */
export function getCleanupQueue(): Queue<CleanupJobData> {
  if (!cleanupQueue) {
    cleanupQueue = new Queue<CleanupJobData>(QUEUE_NAMES.CLEANUP, {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      connection: getRedis() as any,
      defaultJobOptions: {
        attempts: 2,
        backoff: {
          type: "fixed",
          delay: 5_000,
        },
        removeOnComplete: { count: 10 },
        removeOnFail: { count: 50 },
      },
    });
  }
  return cleanupQueue;
}

/**
 * Closes all queue connections cleanly for graceful shutdown.
 */
export async function closeQueues(): Promise<void> {
  await Promise.all([
    syncQueue?.close(),
    embedQueue?.close(),
    cleanupQueue?.close(),
  ]);
  syncQueue = null;
  embedQueue = null;
  cleanupQueue = null;
}
