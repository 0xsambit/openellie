import type { Middleware, AllMiddlewareArgs } from "@slack/bolt";
import { getRedis, RedisKeys } from "../../lib/redis.js";
import { TokenBucket } from "@openellie/shared/utils";
import { RATE_LIMITS } from "@openellie/shared/constants";
import { getWorkspace } from "../../lib/db/queries/workspaces.js";
import { QueryRateLimitError } from "../../lib/errors.js";
import { logger } from "../../lib/logger.js";

/**
 * Middleware that enforces per-workspace and per-user rate limits on Slack queries.
 *
 * Uses Redis token buckets:
 * - Workspace bucket: 100 queries/hour
 * - User bucket: 20 queries/hour
 *
 * If rate limited, throws QueryRateLimitError which is caught by the handler
 * and returned as a friendly error message to the user.
 */
export const rateLimitMiddleware: Middleware<AllMiddlewareArgs> = async (args) => {
  const { next } = args;
  const redis = getRedis();

  // Extract user ID from common event shapes
  const payload = (args as unknown as Record<string, unknown>).payload as Record<string, unknown> | undefined;
  const userId =
    payload && "user" in payload
      ? (payload as { user?: string }).user
      : undefined;

  if (!userId) {
    // Non-user events (e.g. bot events) skip rate limiting
    await next();
    return;
  }

  const workspace = await getWorkspace();
  if (!workspace) {
    await next();
    return;
  }

  const workspaceId = workspace.id;

  // Check workspace-level rate limit
  const workspaceBucket = new TokenBucket({
    redis,
    key: RedisKeys.workspaceRateLimit(workspaceId),
    capacity: RATE_LIMITS.WORKSPACE_QUERIES_PER_HOUR,
    refillAmount: RATE_LIMITS.WORKSPACE_QUERIES_PER_HOUR,
    refillIntervalMs: 60 * 60 * 1000, // 1 hour
  });

  const workspaceResult = await workspaceBucket.consume(1);
  if (!workspaceResult.allowed) {
    logger.warn({ workspaceId, retryAfterMs: workspaceResult.retryAfterMs }, "Workspace rate limited");
    throw new QueryRateLimitError(workspaceResult.retryAfterMs, "workspace");
  }

  // Check user-level rate limit
  const userBucket = new TokenBucket({
    redis,
    key: RedisKeys.userRateLimit(workspaceId, userId),
    capacity: RATE_LIMITS.USER_QUERIES_PER_HOUR,
    refillAmount: RATE_LIMITS.USER_QUERIES_PER_HOUR,
    refillIntervalMs: 60 * 60 * 1000, // 1 hour
  });

  const userResult = await userBucket.consume(1);
  if (!userResult.allowed) {
    logger.warn({ workspaceId, userId, retryAfterMs: userResult.retryAfterMs }, "User rate limited");
    throw new QueryRateLimitError(userResult.retryAfterMs, "user");
  }

  await next();
};
