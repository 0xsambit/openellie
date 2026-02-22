/* eslint-disable @typescript-eslint/require-await */
import { BaseConnector } from "../base.js";
import { NotImplementedError } from "../../lib/errors.js";
import { ConnectorType } from "@openellie/shared/types";
import type { SyncOptions, SyncResult, HealthStatus } from "../base.js";

/**
 * Linear connector — Phase 2 stub.
 *
 * All methods throw NotImplementedError until Phase 2.
 * The database schema (unified `tickets` table) is already in place.
 */
export class LinearConnector extends BaseConnector {
  readonly type = ConnectorType.LINEAR;

  async validate(_credentials: unknown): Promise<void> {
    throw new NotImplementedError("linear");
  }

  protected async performSync(
    _connectionId: string,
    _options: SyncOptions,
  ): Promise<SyncResult> {
    throw new NotImplementedError("linear");
  }

  protected async performIncrementalSync(
    _connectionId: string,
    _since: Date,
    _options: SyncOptions,
  ): Promise<SyncResult> {
    throw new NotImplementedError("linear");
  }

  async getHealthStatus(): Promise<HealthStatus> {
    return {
      healthy: false,
      message: "Linear connector is not yet implemented (Phase 2).",
      checkedAt: new Date(),
    };
  }
}
