import { Redis } from "ioredis";
import { getEnv } from "./env.js";
import { logger } from "./logger.js";

let _redis: Redis | null = null;

/**
 * Creates and returns the singleton ioredis client.
 * Reconnects automatically on connection failures.
 *
 * @returns The Redis client instance.
 */
export function getRedis(): Redis {
  if (_redis) return _redis;

  const env = getEnv();

  _redis = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: 3,
    enableReadyCheck: true,
    reconnectOnError(err: Error) {
      logger.warn({ err: err.message }, "Redis connection error — reconnecting");
      return true;
    },
    lazyConnect: false,
  });

  _redis.on("connect", () => {
    logger.info("Redis connected");
  });

  _redis.on("error", (err: Error) => {
    logger.error({ err: err.message }, "Redis error");
  });

  _redis.on("close", () => {
    logger.warn("Redis connection closed");
  });

  return _redis;
}

/**
 * Gracefully closes the Redis connection.
 * Called during shutdown to allow in-flight commands to complete.
 */
export async function closeRedis(): Promise<void> {
  if (_redis) {
    await _redis.quit();
    _redis = null;
  }
}

/**
 * Redis key namespace helpers — ensures consistent key naming.
 */
export const RedisKeys = {
  /** Query result cache: hash of workspace ID + normalized query. */
  queryCache: (key: string) => `openellie:cache:query:${key}`,

  /** Per-workspace rate limit bucket. */
  workspaceRateLimit: (workspaceId: string) =>
    `openellie:rate:workspace:${workspaceId}`,

  /** Per-user rate limit bucket. */
  userRateLimit: (workspaceId: string, userId: string) =>
    `openellie:rate:user:${workspaceId}:${userId}`,

  /** GitHub API token bucket for a connection. */
  githubRateLimit: (connectionId: string) =>
    `openellie:rate:github:${connectionId}`,

  /** ETag cache for GitHub conditional requests. */
  githubEtag: (connectionId: string, url: string) =>
    `openellie:etag:github:${connectionId}:${url}`,

  /** Active embedding job count per workspace. */
  embedJobCount: (workspaceId: string) =>
    `openellie:embed:count:${workspaceId}`,
} as const;
