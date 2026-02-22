import { NotImplementedError } from "../../lib/errors.js";

/**
 * Sentry API client factory — Phase 2 stub.
 *
 * @throws NotImplementedError always — Sentry connector is Phase 2.
 */
export function createSentryClient(_credentials: unknown): never {
  throw new NotImplementedError("sentry");
}
