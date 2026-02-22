/**
 * Slack query rate limits (per workspace and per user).
 */
export const RATE_LIMITS = {
  /** Maximum Slack queries per workspace per hour. */
  WORKSPACE_QUERIES_PER_HOUR: 100,
  /** Maximum Slack queries per user per hour. */
  USER_QUERIES_PER_HOUR: 20,
  /** GitHub REST API requests per hour (authenticated). */
  GITHUB_REQUESTS_PER_HOUR: 5_000,
  /** GitHub API remaining threshold before pausing sync. */
  GITHUB_RATE_LIMIT_PAUSE_THRESHOLD: 100,
  /** Jira Cloud API requests per 10 seconds. */
  JIRA_REQUESTS_PER_10S: 50,
  /** Linear API requests per hour. */
  LINEAR_REQUESTS_PER_HOUR: 1_500,
  /** Sentry API requests per 10 seconds. */
  SENTRY_REQUESTS_PER_10S: 100,
} as const;

/**
 * BullMQ job retry configuration.
 */
export const JOB_RETRY = {
  /** Maximum number of attempts for sync/embed jobs. */
  MAX_ATTEMPTS: 3,
  /** Initial backoff delay in milliseconds. */
  INITIAL_DELAY_MS: 1_000,
  /** Backoff multiplier for exponential backoff. */
  BACKOFF_MULTIPLIER: 5,
} as const;

/**
 * Embedding pipeline batch sizes and concurrency.
 */
export const EMBEDDING = {
  /** Number of items to embed per batch. */
  BATCH_SIZE: 100,
  /** Maximum concurrent embedding jobs per workspace. */
  MAX_CONCURRENCY_PER_WORKSPACE: 3,
  /** Vector dimension — fixed for all supported models. */
  DIMENSIONS: 1536,
} as const;

/**
 * Query pipeline limits.
 */
export const QUERY_PIPELINE = {
  /** Maximum search results per source before RRF fusion. */
  MAX_RESULTS_PER_SOURCE: 20,
  /** Context window token limit for answer generation. */
  MAX_CONTEXT_TOKENS: 8_000,
  /** Query cache TTL in seconds. */
  CACHE_TTL_SECONDS: 300,
  /** Slack query processing timeout in milliseconds. */
  SLACK_TIMEOUT_MS: 30_000,
  /** RRF constant k for reciprocal rank fusion. */
  RRF_K: 60,
} as const;

/**
 * Slack Block Kit character limits.
 */
export const SLACK_LIMITS = {
  /** Maximum characters in a Slack text block. */
  MAX_TEXT_BLOCK_CHARS: 3_000,
  /** Truncation threshold — leave buffer for "... (continued in thread)" suffix. */
  TEXT_TRUNCATION_CHARS: 2_800,
} as const;

/**
 * Sync job settings.
 */
export const SYNC = {
  /** Default sync frequency in hours. */
  DEFAULT_FREQUENCY_HOURS: 4,
  /** Default data retention in days. */
  DEFAULT_RETENTION_DAYS: 90,
  /** ETag cache TTL in seconds (slightly longer than sync interval). */
  ETAG_CACHE_TTL_SECONDS: 86_400,
} as const;
