import { NotImplementedError } from "../../lib/errors.js";

/**
 * Jira API client factory — Phase 2 stub.
 *
 * @throws NotImplementedError always — Jira connector is Phase 2.
 */
export function createJiraClient(_credentials: unknown): never {
  throw new NotImplementedError("jira");
}
