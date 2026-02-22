/**
 * Supported connector types for external integrations.
 */
export const ConnectorType = {
  GITHUB: "github",
  JIRA: "jira",
  LINEAR: "linear",
  SENTRY: "sentry",
  POSTHOG: "posthog",
} as const;

export type ConnectorType = (typeof ConnectorType)[keyof typeof ConnectorType];

/**
 * Possible statuses for a connector connection.
 */
export const ConnectionStatus = {
  PENDING: "pending",
  ACTIVE: "active",
  SYNCING: "syncing",
  ERROR: "error",
} as const;

export type ConnectionStatus = (typeof ConnectionStatus)[keyof typeof ConnectionStatus];

/**
 * Options passed to connector sync methods.
 */
export interface SyncOptions {
  /** Job ID for progress tracking. */
  jobId: string;
  /** Full sync regardless of last sync time. */
  fullSync?: boolean;
}

/**
 * Result returned by connector sync methods.
 */
export interface SyncResult {
  /** Number of items successfully synced. */
  itemsSynced: number;
  /** Number of items that failed. */
  itemsFailed: number;
  /** Errors encountered (non-fatal). */
  errors: string[];
  /** Timestamp of the most recently synced item. */
  lastSyncedAt: Date;
}

/**
 * Health status reported by a connector.
 */
export interface HealthStatus {
  healthy: boolean;
  latencyMs?: number;
  message?: string;
  checkedAt: Date;
}
