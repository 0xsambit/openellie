/* eslint-disable @typescript-eslint/require-await */
import { BaseConnector } from "../base.js";
import { NotImplementedError } from "../../lib/errors.js";
import { ConnectorType } from "@openellie/shared/types";
import type { SyncOptions, SyncResult, HealthStatus } from "../base.js";

/**
 * Sentry connector — Phase 2 stub.
 *
 * All methods throw NotImplementedError until Phase 2.
 * The database schema (`sentry_issues` table with embedding) is already in place.
 */
export class SentryConnector extends BaseConnector {
  readonly type = ConnectorType.SENTRY;

  async validate(_credentials: unknown): Promise<void> {
    throw new NotImplementedError("sentry");
  }

  protected async performSync(
    _connectionId: string,
    _options: SyncOptions,
  ): Promise<SyncResult> {
    throw new NotImplementedError("sentry");
  }

  protected async performIncrementalSync(
    _connectionId: string,
    _since: Date,
    _options: SyncOptions,
  ): Promise<SyncResult> {
    throw new NotImplementedError("sentry");
  }

  async getHealthStatus(): Promise<HealthStatus> {
    return {
      healthy: false,
      message: "Sentry connector is not yet implemented (Phase 2).",
      checkedAt: new Date(),
    };
  }
}
