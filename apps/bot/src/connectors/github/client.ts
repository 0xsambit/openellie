import { Octokit } from "@octokit/rest";
import { getRedis, RedisKeys } from "../../lib/redis.js";
import { logger } from "../../lib/logger.js";
import { RateLimitError } from "../../lib/errors.js";
import { RATE_LIMITS, SYNC } from "@openellie/shared/constants";

/**
 * Creates an authenticated Octokit client for the given GitHub PAT.
 *
 * @param pat - GitHub Personal Access Token.
 * @returns Configured Octokit REST client.
 */
export function createGitHubClient(pat: string): Octokit {
  return new Octokit({
    auth: pat,
    // Throttle and retry are handled by our own rate limit logic
    request: {
      timeout: 30_000,
    },
  });
}

/**
 * Checks and enforces the GitHub API rate limit.
 *
 * @param connectionId - Database connection UUID (used as rate limit key).
 * @param remainingHeader - Value of X-RateLimit-Remaining header from last response.
 * @param resetHeader - Value of X-RateLimit-Reset header (Unix timestamp).
 * @throws RateLimitError if rate limit is almost exhausted.
 */
export function checkGitHubRateLimit(
  connectionId: string,
  remainingHeader: string | undefined,
  resetHeader: string | undefined,
): void {
  const remaining = remainingHeader ? parseInt(remainingHeader, 10) : undefined;
  const reset = resetHeader ? parseInt(resetHeader, 10) : undefined;

  if (
    remaining !== undefined &&
    remaining < RATE_LIMITS.GITHUB_RATE_LIMIT_PAUSE_THRESHOLD
  ) {
    const resetMs = reset ? reset * 1000 - Date.now() : 60_000;
    logger.warn(
      { connectionId, remaining, resetMs },
      "GitHub rate limit low — pausing sync",
    );
    throw new RateLimitError("github", Math.max(resetMs, 0));
  }
}

/**
 * Gets the ETag for a GitHub API URL from Redis cache.
 *
 * @param connectionId - Database connection UUID.
 * @param url - GitHub API URL.
 * @returns Cached ETag or undefined.
 */
export async function getGitHubEtag(
  connectionId: string,
  url: string,
): Promise<string | undefined> {
  try {
    const redis = getRedis();
    const etag = await redis.get(RedisKeys.githubEtag(connectionId, url));
    return etag ?? undefined;
  } catch {
    return undefined;
  }
}

/**
 * Stores the ETag for a GitHub API URL in Redis cache.
 *
 * @param connectionId - Database connection UUID.
 * @param url - GitHub API URL.
 * @param etag - ETag value from response headers.
 */
export async function setGitHubEtag(
  connectionId: string,
  url: string,
  etag: string,
): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(
      RedisKeys.githubEtag(connectionId, url),
      SYNC.ETAG_CACHE_TTL_SECONDS,
      etag,
    );
  } catch {
    // Non-critical — ETag caching failures don't break sync
  }
}

/**
 * Parses the next page URL from a GitHub API Link header.
 *
 * @param linkHeader - Value of the Link response header.
 * @returns Next page number or null if there is no next page.
 */
export function parseNextPage(linkHeader: string | undefined): number | null {
  if (!linkHeader) return null;

  const nextMatch = linkHeader.match(/<[^>]*[?&]page=(\d+)[^>]*>;\s*rel="next"/);
  if (nextMatch?.[1]) {
    return parseInt(nextMatch[1], 10);
  }

  return null;
}
