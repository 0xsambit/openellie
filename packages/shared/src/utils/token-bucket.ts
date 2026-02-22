import type { Redis } from "ioredis";

/**
 * Options for the Redis-backed token bucket rate limiter.
 */
export interface TokenBucketOptions {
  /** Redis client instance. */
  redis: Redis;
  /** Unique key for this bucket in Redis. */
  key: string;
  /** Maximum tokens the bucket can hold. */
  capacity: number;
  /** Tokens added per refill interval. */
  refillAmount: number;
  /** Refill interval in milliseconds. */
  refillIntervalMs: number;
}

/**
 * Result of a token consumption attempt.
 */
export interface ConsumeResult {
  /** Whether the token was successfully consumed. */
  allowed: boolean;
  /** Remaining tokens in the bucket. */
  remaining: number;
  /** Milliseconds until the next token is available (0 if allowed). */
  retryAfterMs: number;
}

/**
 * A Redis-backed token bucket rate limiter.
 *
 * Uses a Lua script for atomic check-and-consume operations.
 * Thread-safe across multiple bot instances.
 */
export class TokenBucket {
  private readonly redis: Redis;
  private readonly key: string;
  private readonly capacity: number;
  private readonly refillAmount: number;
  private readonly refillIntervalMs: number;

  // Lua script for atomic token bucket consume operation
  private static readonly CONSUME_SCRIPT = `
    local key = KEYS[1]
    local capacity = tonumber(ARGV[1])
    local refill_amount = tonumber(ARGV[2])
    local refill_interval = tonumber(ARGV[3])
    local now = tonumber(ARGV[4])
    local cost = tonumber(ARGV[5])

    -- Get current state
    local data = redis.call('HMGET', key, 'tokens', 'last_refill')
    local tokens = tonumber(data[1])
    local last_refill = tonumber(data[2])

    -- Initialize if not set
    if tokens == nil then
      tokens = capacity
      last_refill = now
    end

    -- Calculate refill
    local elapsed = now - last_refill
    local intervals = math.floor(elapsed / refill_interval)
    if intervals > 0 then
      tokens = math.min(capacity, tokens + (intervals * refill_amount))
      last_refill = last_refill + (intervals * refill_interval)
    end

    -- Try to consume
    local allowed = 0
    local retry_after = 0
    if tokens >= cost then
      tokens = tokens - cost
      allowed = 1
    else
      -- Calculate when next token will be available
      local tokens_needed = cost - tokens
      local intervals_needed = math.ceil(tokens_needed / refill_amount)
      retry_after = (last_refill + (intervals_needed * refill_interval)) - now
    end

    -- Save state with TTL of 2 refill intervals to auto-cleanup
    redis.call('HMSET', key, 'tokens', tokens, 'last_refill', last_refill)
    redis.call('PEXPIRE', key, refill_interval * 2)

    return {allowed, tokens, retry_after}
  `;

  constructor(options: TokenBucketOptions) {
    this.redis = options.redis;
    this.key = options.key;
    this.capacity = options.capacity;
    this.refillAmount = options.refillAmount;
    this.refillIntervalMs = options.refillIntervalMs;
  }

  /**
   * Attempts to consume tokens from the bucket.
   *
   * @param cost - Number of tokens to consume. Default: 1.
   * @returns Result indicating whether the request is allowed.
   */
  async consume(cost = 1): Promise<ConsumeResult> {
    const now = Date.now();

    const result = (await this.redis.eval(
      TokenBucket.CONSUME_SCRIPT,
      1,
      this.key,
      String(this.capacity),
      String(this.refillAmount),
      String(this.refillIntervalMs),
      String(now),
      String(cost),
    )) as [number, number, number];

    return {
      allowed: result[0] === 1,
      remaining: result[1] ?? 0,
      retryAfterMs: result[2] ?? 0,
    };
  }

  /**
   * Resets the bucket to full capacity.
   * Used when clearing workspace rate limit state.
   */
  async reset(): Promise<void> {
    await this.redis.del(this.key);
  }
}
