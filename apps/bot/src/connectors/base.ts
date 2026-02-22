import type {
  ConnectorType,
  SyncOptions,
  SyncResult,
  HealthStatus,
} from "@openellie/shared/types";
import { updateConnectionStatus } from "../lib/db/queries/connections.js";
import { logger } from "../lib/logger.js";
import { ConnectorError } from "../lib/errors.js";

export type { ConnectorType, SyncOptions, SyncResult, HealthStatus };

/**
 * Core connector interface.
 * All connectors must implement these methods.
 */
export interface Connector {
  /** Connector type identifier. */
  readonly type: ConnectorType;

  /**
   * Validates the supplied credentials against the external API.
   * Should throw AuthenticationError if credentials are invalid.
   *
   * @param credentials - Connector-specific credential object.
   */
  validate(credentials: unknown): Promise<void>;

  /**
   * Performs a full sync (or initial sync) of all data.
   *
   * @param connectionId - Database connection UUID.
   * @param options - Sync options (job ID, etc.).
   */
  sync(connectionId: string, options: SyncOptions): Promise<SyncResult>;

  /**
   * Performs an incremental sync from the given timestamp.
   * More efficient than full sync — only fetches items modified since `since`.
   *
   * @param connectionId - Database connection UUID.
   * @param since - Fetch items updated after this timestamp.
   * @param options - Sync options.
   */
  incrementalSync(
    connectionId: string,
    since: Date,
    options: SyncOptions,
  ): Promise<SyncResult>;

  /**
   * Checks if the connector's external API is reachable and credentials are valid.
   *
   * @returns Health status with latency measurement.
   */
  getHealthStatus(): Promise<HealthStatus>;
}

/**
 * Abstract base class providing shared sync infrastructure.
 *
 * Responsibilities:
 * - Sets connection.status to "syncing"/"active"/"error" around each sync
 * - Wraps unexpected errors into ConnectorError
 * - Delegates actual sync logic to subclass via performSync/performIncrementalSync
 *
 * Sync job (sync_jobs table) lifecycle is managed by the sync worker, not here.
 * This avoids duplicate DB records when the worker and base class both track state.
 */
export abstract class BaseConnector implements Connector {
  abstract readonly type: ConnectorType;
  protected readonly workspaceId: string;

  constructor(workspaceId: string) {
    this.workspaceId = workspaceId;
  }

  abstract validate(credentials: unknown): Promise<void>;

  /**
   * Runs a full sync with connection status tracking.
   */
  async sync(connectionId: string, options: SyncOptions): Promise<SyncResult> {
    return this.runWithStatusTracking(connectionId, "full", () =>
      this.performSync(connectionId, options),
    );
  }

  /**
   * Runs an incremental sync with connection status tracking.
   */
  async incrementalSync(
    connectionId: string,
    since: Date,
    options: SyncOptions,
  ): Promise<SyncResult> {
    return this.runWithStatusTracking(connectionId, "incremental", () =>
      this.performIncrementalSync(connectionId, since, options),
    );
  }

  abstract getHealthStatus(): Promise<HealthStatus>;

  /** Override in subclass to implement full sync. */
  protected abstract performSync(
    connectionId: string,
    options: SyncOptions,
  ): Promise<SyncResult>;

  /** Override in subclass to implement incremental sync. */
  protected abstract performIncrementalSync(
    connectionId: string,
    since: Date,
    options: SyncOptions,
  ): Promise<SyncResult>;

  /**
   * Updates connection.status around the sync operation.
   * The sync_jobs table is managed by the sync worker — not duplicated here.
   */
  private async runWithStatusTracking(
    connectionId: string,
    syncType: string,
    fn: () => Promise<SyncResult>,
  ): Promise<SyncResult> {
    try {
      await updateConnectionStatus(connectionId, "syncing");

      const result = await fn();

      await updateConnectionStatus(connectionId, "active");

      logger.info(
        {
          connectionId,
          syncType,
          itemsSynced: result.itemsSynced,
          itemsFailed: result.itemsFailed,
        },
        `${this.type} sync completed`,
      );

      return result;
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);

      await updateConnectionStatus(connectionId, "error", errorMessage);

      logger.error(
        { err: error, connectionId, syncType },
        `${this.type} sync failed`,
      );

      throw error instanceof ConnectorError
        ? error
        : new ConnectorError(errorMessage, this.type, undefined, error);
    }
  }
}
