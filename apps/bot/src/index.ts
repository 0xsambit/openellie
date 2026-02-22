/**
 * OpenEllie Bot — Entry Point
 *
 * Startup sequence:
 * 1. Validate environment variables (Zod, fail-fast)
 * 2. Run database migrations
 * 3. Seed workspace record from env vars
 * 4. Initialize Hono HTTP server (internal API)
 * 5. Start Slack Bolt Socket Mode
 * 6. Start BullMQ workers (sync, embed, cleanup)
 * 7. Register scheduled jobs
 */

import { loadEnv } from "./lib/env.js";

// Validate env FIRST — before any other imports that might read process.env
const env = loadEnv();

import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { logger } from "./lib/logger.js";
import { initDatabase, getDatabase } from "./lib/db/client.js";
import { sql } from "drizzle-orm";
import { runMigrations } from "@openellie/db/migrate";
import { closeRedis } from "./lib/redis.js";
import { getBoltApp } from "./bot/app.js";
import { createSyncWorker } from "./jobs/workers/sync.worker.js";
import { createEmbedWorker } from "./jobs/workers/embed.worker.js";
import { createCleanupWorker } from "./jobs/workers/cleanup.worker.js";
import { registerScheduledJobs } from "./jobs/scheduler.js";
import { closeQueues } from "./jobs/queues.js";
import { getWorkspaceByTeamId, createWorkspace } from "./lib/db/queries/workspaces.js";
import { getConnections, createConnection } from "./lib/db/queries/connections.js";
import { encryptJSON } from "./lib/crypto.js";
import { ConnectorType } from "@openellie/shared/types";
import type { Worker } from "bullmq";

// ─── Hono HTTP Server (internal API + health checks) ─────────────────────────

function createHonoApp(): Hono {
  const app = new Hono();

  // Health check — used by Docker and load balancers
  app.get("/health", (c) => {
    return c.json({ status: "ok" });
  });

  // Liveness probe
  app.get("/ready", async (c) => {
    try {
      const db = getDatabase();
      await db.execute(sql`SELECT 1`);
      return c.json({ status: "ready" });
    } catch {
      return c.json({ status: "not ready" }, 503);
    }
  });

  return app;
}

// ─── Workspace seeding ────────────────────────────────────────────────────────

/**
 * Ensures a workspace row exists for the configured Slack team.
 * Creates it on first startup; no-ops thereafter.
 */
async function seedWorkspace(): Promise<string> {
  const existing = await getWorkspaceByTeamId(env.SLACK_TEAM_ID);
  if (existing) {
    logger.info({ workspaceId: existing.id }, "Workspace already exists");
    return existing.id;
  }

  const workspace = await createWorkspace({
    slackTeamId: env.SLACK_TEAM_ID,
    slackTeamName: env.SLACK_TEAM_NAME ?? "My Workspace",
    slackBotToken: env.SLACK_BOT_TOKEN,
    plan: "self-hosted",
  });

  logger.info({ workspaceId: workspace.id }, "Workspace record created");
  return workspace.id;
}

/**
 * Ensures a GitHub connection exists for the configured PAT + repos.
 * Creates it if missing; no-ops if already present.
 */
async function seedGitHubConnection(workspaceId: string): Promise<void> {
  if (!env.GITHUB_PAT || env.GITHUB_REPOS.length === 0) {
    logger.warn("GITHUB_PAT or GITHUB_REPOS not set — skipping GitHub connection seed");
    return;
  }

  const existing = await getConnections(workspaceId);
  const hasGitHub = existing.some((c) => c.type === ConnectorType.GITHUB);

  if (hasGitHub) {
    logger.debug("GitHub connection already exists");
    return;
  }

  const encryptedCredentials = encryptJSON(
    { pat: env.GITHUB_PAT },
    workspaceId,
  );

  await createConnection({
    workspaceId,
    type: ConnectorType.GITHUB,
    name: "GitHub (auto-configured)",
    encryptedCredentials,
    config: { repos: env.GITHUB_REPOS },
  });

  logger.info(
    { repoCount: env.GITHUB_REPOS.length },
    "GitHub connection created from env vars",
  );
}

// ─── Main startup ─────────────────────────────────────────────────────────────

const workers: Worker[] = [];

async function main(): Promise<void> {
  logger.info("OpenEllie bot starting up");

  // 1. Run DB migrations
  logger.info("Running database migrations");
  await runMigrations(env.DATABASE_URL);

  // 2. Initialize DB connection pool
  initDatabase();
  logger.info("Database connection pool initialized");

  // 3. Seed workspace + GitHub connection from env
  const workspaceId = await seedWorkspace();
  await seedGitHubConnection(workspaceId);

  // 4. Start Hono HTTP server
  const honoApp = createHonoApp();
  serve(
    {
      fetch: honoApp.fetch,
      port: env.BOT_PORT,
    },
    (info: { port: number }) => {
      logger.info({ port: info.port }, "Hono HTTP server started");
    },
  );

  // 5. Start Slack Bolt Socket Mode
  const boltApp = getBoltApp();
  await boltApp.start();
  logger.info("Bolt Socket Mode connected");

  // 6. Start BullMQ workers
  const syncWorker = createSyncWorker();
  const embedWorker = createEmbedWorker();
  const cleanupWorker = createCleanupWorker();
  workers.push(syncWorker, embedWorker, cleanupWorker);
  logger.info("BullMQ workers started");

  // 7. Register scheduled jobs
  await registerScheduledJobs();
  logger.info("Scheduled jobs registered");

  logger.info("OpenEllie bot ready");
}

// ─── Graceful shutdown ────────────────────────────────────────────────────────

async function shutdown(signal: string): Promise<void> {
  logger.info({ signal }, "Shutdown signal received");

  try {
    // Close BullMQ workers first (stop accepting new jobs)
    await Promise.all(workers.map((w) => w.close()));
    logger.info("BullMQ workers closed");

    // Close queues
    await closeQueues();
    logger.info("BullMQ queues closed");

    // Close Bolt
    const boltApp = getBoltApp();
    await boltApp.stop();
    logger.info("Bolt stopped");

    // Close Redis
    await closeRedis();
    logger.info("Redis connection closed");

    logger.info("Shutdown complete");
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, "Error during shutdown");
    process.exit(1);
  }
}

process.on("SIGTERM", () => void shutdown("SIGTERM"));
process.on("SIGINT", () => void shutdown("SIGINT"));

process.on("uncaughtException", (error) => {
  logger.fatal({ err: error }, "Uncaught exception — shutting down");
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  logger.fatal({ reason }, "Unhandled promise rejection — shutting down");
  process.exit(1);
});

// Start
main().catch((error) => {
  // Can't use logger here — may not be initialized yet
  // eslint-disable-next-line no-console
  console.error("Fatal startup error:", error);
  process.exit(1);
});
