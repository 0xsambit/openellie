/**
 * Jira connector types — Phase 2 stubs.
 *
 * These types are placeholders for the Phase 2 Jira connector implementation.
 * The connector itself throws NotImplementedError until Phase 2.
 */

export interface JiraCredentials {
  /** Jira instance base URL (e.g. https://yourorg.atlassian.net) */
  baseUrl: string;
  /** Atlassian account email */
  email: string;
  /** Jira API token (generated from id.atlassian.com) */
  apiToken: string;
}

export interface JiraConfig {
  /** List of Jira project keys to sync (e.g. ["ENG", "OPS"]) */
  projectKeys: string[];
  /** Optional: only sync issues of these types */
  issueTypes?: string[];
  /** Optional: only sync issues in these statuses */
  statuses?: string[];
}
