import { NotImplementedError } from "../../lib/errors.js";

/**
 * Linear API client factory — Phase 2 stub.
 *
 * @throws NotImplementedError always — Linear connector is Phase 2.
 */
export function createLinearClient(_credentials: unknown): never {
  throw new NotImplementedError("linear");
}
