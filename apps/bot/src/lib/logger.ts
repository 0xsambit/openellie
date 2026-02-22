import pino from "pino";
import { AsyncLocalStorage } from "async_hooks";
import { getEnv } from "./env.js";

/**
 * Request context stored in AsyncLocalStorage.
 * Available throughout the entire async call chain without explicit passing.
 */
export interface RequestContext {
  /** Unique request/job correlation ID. */
  requestId: string;
  /** Slack workspace ID, if applicable. */
  workspaceId?: string;
  /** Slack user ID, if applicable. */
  slackUserId?: string;
  /** Additional context key-value pairs. */
  [key: string]: string | undefined;
}

/**
 * AsyncLocalStorage instance for request-scoped correlation IDs.
 * Used by the logger to automatically attach context to every log line.
 */
export const requestContext = new AsyncLocalStorage<RequestContext>();

/**
 * Creates the Pino logger instance.
 * Uses pino-pretty in development for human-readable output.
 * Uses structured JSON in production.
 */
function createLogger() {
  const env = getEnv();
  const isDevelopment = env.NODE_ENV === "development";

  const baseOptions: pino.LoggerOptions = {
    level: env.LOG_LEVEL,
    // Attach request context to every log line automatically
    mixin() {
      const ctx = requestContext.getStore();
      if (!ctx) return {};
      return ctx;
    },
    formatters: {
      level(label) {
        return { level: label };
      },
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    base: {
      service: "openellie-bot",
      version: "0.1.0",
    },
  };

  if (isDevelopment) {
    return pino({
      ...baseOptions,
      transport: {
        target: "pino-pretty",
        options: {
          colorize: true,
          translateTime: "SYS:HH:MM:ss",
          ignore: "pid,hostname,service,version",
        },
      },
    });
  }

  return pino(baseOptions);
}

export const logger = createLogger();

/**
 * Runs a function within a request context, making the context available
 * to all nested async calls via AsyncLocalStorage.
 *
 * @param context - Context values to associate with this request.
 * @param fn - Function to run within the context.
 * @returns Result of the function.
 */
export function withRequestContext<T>(
  context: RequestContext,
  fn: () => Promise<T>,
): Promise<T> {
  return requestContext.run(context, fn);
}

/**
 * Generates a random correlation ID for request tracing.
 *
 * @returns A random hexadecimal string.
 */
export function generateRequestId(): string {
  return crypto.randomUUID();
}
