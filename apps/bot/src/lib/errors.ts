/**
 * Error codes used throughout OpenEllie for structured error handling.
 */
export const ErrorCode = {
  // Database
  DB_QUERY_FAILED: "DB_QUERY_FAILED",
  DB_CONNECTION_FAILED: "DB_CONNECTION_FAILED",

  // Connector
  CONNECTOR_NOT_IMPLEMENTED: "CONNECTOR_NOT_IMPLEMENTED",
  CONNECTOR_AUTH_FAILED: "CONNECTOR_AUTH_FAILED",
  CONNECTOR_SYNC_FAILED: "CONNECTOR_SYNC_FAILED",
  CONNECTOR_RATE_LIMITED: "CONNECTOR_RATE_LIMITED",
  CONNECTOR_NOT_FOUND: "CONNECTOR_NOT_FOUND",

  // AI Provider
  AI_PROVIDER_ERROR: "AI_PROVIDER_ERROR",
  AI_EMBEDDING_FAILED: "AI_EMBEDDING_FAILED",
  AI_COMPLETION_FAILED: "AI_COMPLETION_FAILED",
  AI_PROVIDER_NOT_CONFIGURED: "AI_PROVIDER_NOT_CONFIGURED",

  // Slack
  SLACK_SEND_FAILED: "SLACK_SEND_FAILED",
  SLACK_AUTH_FAILED: "SLACK_AUTH_FAILED",

  // Query pipeline
  QUERY_TIMEOUT: "QUERY_TIMEOUT",
  QUERY_RATE_LIMITED: "QUERY_RATE_LIMITED",

  // Validation
  VALIDATION_FAILED: "VALIDATION_FAILED",

  // Encryption
  ENCRYPTION_FAILED: "ENCRYPTION_FAILED",
  DECRYPTION_FAILED: "DECRYPTION_FAILED",
} as const;

export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Base application error class.
 * All custom errors in OpenEllie should extend this.
 */
export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly cause?: unknown;

  constructor(
    message: string,
    code: ErrorCode,
    statusCode = 500,
    cause?: unknown,
  ) {
    super(message);
    this.name = "AppError";
    this.code = code;
    this.statusCode = statusCode;
    this.cause = cause;

    // Maintains proper stack trace for V8
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }
}

/**
 * Database operation errors.
 */
export class DatabaseError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, ErrorCode.DB_QUERY_FAILED, 500, cause);
    this.name = "DatabaseError";
  }
}

/**
 * Connector errors — wraps failures from external API clients.
 */
export class ConnectorError extends AppError {
  public readonly connectorType: string;

  constructor(
    message: string,
    connectorType: string,
    code: ErrorCode = ErrorCode.CONNECTOR_SYNC_FAILED,
    cause?: unknown,
  ) {
    super(message, code, 500, cause);
    this.name = "ConnectorError";
    this.connectorType = connectorType;
  }
}

/**
 * Rate limit error from a connector's external API.
 */
export class RateLimitError extends ConnectorError {
  /** Milliseconds until the rate limit resets. */
  public readonly retryAfterMs: number;

  constructor(connectorType: string, retryAfterMs: number, cause?: unknown) {
    super(
      `Rate limited by ${connectorType}. Retry after ${Math.ceil(retryAfterMs / 1000)}s.`,
      connectorType,
      ErrorCode.CONNECTOR_RATE_LIMITED,
      cause,
    );
    this.name = "RateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Connector credential authentication failure.
 */
export class AuthenticationError extends ConnectorError {
  constructor(connectorType: string, message: string, cause?: unknown) {
    super(message, connectorType, ErrorCode.CONNECTOR_AUTH_FAILED, cause);
    this.name = "AuthenticationError";
  }
}

/**
 * AI provider errors — wraps failures from AI SDK calls.
 */
export class AIProviderError extends AppError {
  public readonly provider: string;

  constructor(message: string, provider: string, cause?: unknown) {
    super(message, ErrorCode.AI_PROVIDER_ERROR, 500, cause);
    this.name = "AIProviderError";
    this.provider = provider;
  }
}

/**
 * Embedding generation failure.
 */
export class EmbeddingError extends AIProviderError {
  constructor(message: string, provider: string, cause?: unknown) {
    super(message, provider, cause);
    this.name = "EmbeddingError";
    // Override code after parent sets it
    (this as { code: ErrorCode }).code = ErrorCode.AI_EMBEDDING_FAILED;
  }
}

/**
 * Chat completion failure.
 */
export class CompletionError extends AIProviderError {
  constructor(message: string, provider: string, cause?: unknown) {
    super(message, provider, cause);
    this.name = "CompletionError";
    (this as { code: ErrorCode }).code = ErrorCode.AI_COMPLETION_FAILED;
  }
}

/**
 * Slack API errors.
 */
export class SlackError extends AppError {
  constructor(message: string, cause?: unknown) {
    super(message, ErrorCode.SLACK_SEND_FAILED, 500, cause);
    this.name = "SlackError";
  }
}

/**
 * Zod input validation failures.
 */
export class ValidationError extends AppError {
  public readonly validationErrors: string[];

  constructor(message: string, validationErrors: string[] = []) {
    super(message, ErrorCode.VALIDATION_FAILED, 400);
    this.name = "ValidationError";
    this.validationErrors = validationErrors;
  }
}

/**
 * Thrown by connector stubs for connectors not yet implemented.
 * Phase 2 connectors (Jira, Linear, Sentry) use this.
 */
export class NotImplementedError extends AppError {
  constructor(connectorType: string) {
    super(
      `The ${connectorType} connector is not yet implemented. It will be available in Phase 2. ` +
        `See https://github.com/openellie/openellie/issues for the roadmap.`,
      ErrorCode.CONNECTOR_NOT_IMPLEMENTED,
      501,
    );
    this.name = "NotImplementedError";
  }
}

/**
 * Query pipeline rate limit error (Slack user/workspace level).
 */
export class QueryRateLimitError extends AppError {
  /** Milliseconds until the user or workspace can query again. */
  public readonly retryAfterMs: number;

  constructor(retryAfterMs: number, entity: "user" | "workspace") {
    super(
      `You've hit the ${entity} query rate limit. Please wait ${Math.ceil(retryAfterMs / 1000)} seconds before asking again.`,
      ErrorCode.QUERY_RATE_LIMITED,
      429,
    );
    this.name = "QueryRateLimitError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Narrows an unknown error to an AppError for typed handling.
 * If the error is not an AppError, wraps it in a generic AppError.
 *
 * @param error - Unknown error value.
 * @param fallbackCode - Error code to use if wrapping a non-AppError.
 */
export function toAppError(
  error: unknown,
  fallbackCode: ErrorCode = ErrorCode.DB_QUERY_FAILED,
): AppError {
  if (error instanceof AppError) return error;
  if (error instanceof Error) {
    return new AppError(error.message, fallbackCode, 500, error);
  }
  return new AppError(String(error), fallbackCode, 500, error);
}
