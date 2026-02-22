/**
 * Options for the retry utility.
 */
export interface RetryOptions {
  /** Maximum number of attempts (including the first). Default: 3 */
  maxAttempts?: number;
  /** Initial delay in milliseconds. Default: 1000 */
  initialDelayMs?: number;
  /** Multiplier for each subsequent delay. Default: 5 */
  backoffMultiplier?: number;
  /** Maximum delay cap in milliseconds. Default: 30000 */
  maxDelayMs?: number;
  /** Whether to add random jitter to avoid thundering herd. Default: true */
  jitter?: boolean;
  /** Predicate to determine if error is retryable. Default: always retry. */
  isRetryable?: (error: unknown) => boolean;
  /** Called before each retry with the attempt number and error. */
  onRetry?: (attempt: number, error: unknown) => void;
}

/**
 * Executes an async operation with exponential backoff and optional jitter.
 *
 * @param fn - The async function to retry.
 * @param options - Retry configuration options.
 * @returns The result of the successful function call.
 * @throws The last error if all attempts are exhausted.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxAttempts = 3,
    initialDelayMs = 1000,
    backoffMultiplier = 5,
    maxDelayMs = 30_000,
    jitter = true,
    isRetryable = () => true,
    onRetry,
  } = options;

  let lastError: unknown;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxAttempts || !isRetryable(error)) {
        throw error;
      }

      let delayMs = Math.min(
        initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
        maxDelayMs,
      );

      if (jitter) {
        // Add ±25% jitter
        const jitterFactor = 0.75 + Math.random() * 0.5;
        delayMs = Math.floor(delayMs * jitterFactor);
      }

      onRetry?.(attempt, error);
      await sleep(delayMs);
    }
  }

  throw lastError;
}

/**
 * Sleeps for a given number of milliseconds.
 *
 * @param ms - Duration to sleep in milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
