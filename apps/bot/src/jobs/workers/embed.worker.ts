import { Worker, type Job } from "bullmq";
import { getRedis } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";
import { QUEUE_NAMES } from "../queues.js";
import type { EmbedJobData } from "../queues.js";
import {
  getPrsNeedingEmbedding,
  updatePrEmbedding,
  getCommitsNeedingEmbedding,
  updateCommitEmbedding,
} from "../../lib/db/queries/github.js";
import {
  getTicketsNeedingEmbedding,
  updateTicketEmbedding,
} from "../../lib/db/queries/tickets.js";
import {
  generateEmbeddings,
  buildPrEmbeddingText,
  buildCommitEmbeddingText,
  buildTicketEmbeddingText,
} from "../../ai/embeddings.js";
import { EMBEDDING } from "@openellie/shared/constants";

/**
 * Embed worker — processes jobs from the `embed-queue`.
 *
 * Each job:
 * 1. Fetches records that have no embedding yet (null embedding column)
 * 2. Builds text representations suitable for embedding
 * 3. Calls embedMany() in batches of EMBEDDING.BATCH_SIZE
 * 4. Writes embedding vectors back to the DB
 *
 * Concurrency is limited to EMBEDDING.MAX_CONCURRENCY_PER_WORKSPACE
 * to avoid hammering the embedding API.
 */
export function createEmbedWorker(): Worker<EmbedJobData> {
  const worker = new Worker<EmbedJobData>(
    QUEUE_NAMES.EMBED,
    async (job: Job<EmbedJobData>) => {
      const { workspaceId, source } = job.data;

      logger.info({ workspaceId, source }, "Embed job starting");

      let totalEmbedded = 0;

      try {
        switch (source) {
          case "github_prs":
            totalEmbedded = await embedPullRequests(workspaceId);
            break;
          case "github_commits":
            totalEmbedded = await embedCommits(workspaceId);
            break;
          case "tickets":
            totalEmbedded = await embedTickets(workspaceId);
            break;
          case "sentry_issues":
            // Sentry connector is Phase 2 — skip silently
            logger.debug({ workspaceId }, "Sentry embedding skipped (Phase 2)");
            break;
        }

        logger.info({ workspaceId, source, totalEmbedded }, "Embed job completed");
      } catch (error) {
        logger.error({ err: error, workspaceId, source }, "Embed job failed");
        throw error;
      }
    },
    {
      // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
      connection: getRedis() as any,
      concurrency: EMBEDDING.MAX_CONCURRENCY_PER_WORKSPACE,
    },
  );

  worker.on("failed", (job, err) => {
    logger.error({ jobId: job?.id, err }, "Embed worker job permanently failed");
  });

  worker.on("error", (err) => {
    logger.error({ err }, "Embed worker error");
  });

  return worker;
}

/**
 * Embeds pull requests that are missing embeddings.
 * Processes up to BATCH_SIZE * 10 records per job invocation.
 */
async function embedPullRequests(workspaceId: string): Promise<number> {
  const prs = await getPrsNeedingEmbedding(workspaceId, EMBEDDING.BATCH_SIZE * 10);
  if (prs.length === 0) return 0;

  let totalEmbedded = 0;

  // Process in batches
  for (let i = 0; i < prs.length; i += EMBEDDING.BATCH_SIZE) {
    const batch = prs.slice(i, i + EMBEDDING.BATCH_SIZE);
    const texts = batch.map((pr) =>
      buildPrEmbeddingText({
        title: pr.title,
        body: pr.body ?? "",
        labels: pr.labels,
        headBranch: pr.headBranch,
      }),
    );

    const embeddings = await generateEmbeddings(texts, workspaceId);

    for (let j = 0; j < batch.length; j++) {
      const pr = batch[j];
      const embedding = embeddings[j];
      if (pr && embedding) {
        await updatePrEmbedding(pr.id, embedding);
        totalEmbedded++;
      }
    }

    logger.debug(
      { batch: i / EMBEDDING.BATCH_SIZE + 1, workspaceId },
      "PR embedding batch complete",
    );
  }

  return totalEmbedded;
}

/**
 * Embeds commits that are missing embeddings.
 */
async function embedCommits(workspaceId: string): Promise<number> {
  const commits = await getCommitsNeedingEmbedding(workspaceId, EMBEDDING.BATCH_SIZE * 10);
  if (commits.length === 0) return 0;

  let totalEmbedded = 0;

  for (let i = 0; i < commits.length; i += EMBEDDING.BATCH_SIZE) {
    const batch = commits.slice(i, i + EMBEDDING.BATCH_SIZE);
    const texts = batch.map((commit) =>
      buildCommitEmbeddingText({
        message: commit.message,
        repoName: commit.repoName,
      }),
    );

    const embeddings = await generateEmbeddings(texts, workspaceId);

    for (let j = 0; j < batch.length; j++) {
      const commit = batch[j];
      const embedding = embeddings[j];
      if (commit && embedding) {
        await updateCommitEmbedding(commit.id, embedding);
        totalEmbedded++;
      }
    }
  }

  return totalEmbedded;
}

/**
 * Embeds tickets (Jira/Linear) that are missing embeddings.
 */
async function embedTickets(workspaceId: string): Promise<number> {
  const tickets = await getTicketsNeedingEmbedding(workspaceId, EMBEDDING.BATCH_SIZE * 10);
  if (tickets.length === 0) return 0;

  let totalEmbedded = 0;

  for (let i = 0; i < tickets.length; i += EMBEDDING.BATCH_SIZE) {
    const batch = tickets.slice(i, i + EMBEDDING.BATCH_SIZE);
    const texts = batch.map((ticket) =>
      buildTicketEmbeddingText({
        title: ticket.title,
        description: ticket.description ?? "",
        labels: ticket.labels as string[],
        sprintName: null,
      }),
    );

    const embeddings = await generateEmbeddings(texts, workspaceId);

    for (let j = 0; j < batch.length; j++) {
      const ticket = batch[j];
      const embedding = embeddings[j];
      if (ticket && embedding) {
        await updateTicketEmbedding(ticket.id, embedding);
        totalEmbedded++;
      }
    }
  }

  return totalEmbedded;
}
