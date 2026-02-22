/**
 * Credentials stored in the connections table for a GitHub connector.
 */
export interface GitHubCredentials {
  /** GitHub Personal Access Token. */
  pat: string;
  /** GitHub org or user name (owner). */
  owner?: string;
}

/**
 * GitHub connector configuration stored in connections.config.
 */
export interface GitHubConfig {
  /** List of repos to sync in "owner/repo" format. */
  repos: string[];
  /** Maximum pages to fetch per resource type (for initial sync). Default: 10 */
  maxPages?: number;
}

/**
 * Internal representation of a GitHub PR from the API.
 */
export interface GitHubAPIPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: string;
  user: { login: string } | null;
  assignees: { login: string }[];
  requested_reviewers: { login: string }[];
  labels: { name: string }[];
  base: { ref: string };
  head: { ref: string; repo: { full_name: string } | null };
  additions: number;
  deletions: number;
  draft: boolean;
  merged_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Internal representation of a GitHub commit from the API.
 */
export interface GitHubAPICommit {
  sha: string;
  commit: {
    message: string;
    author: {
      name: string;
      email: string;
      date: string;
    } | null;
  };
  stats?: {
    additions: number;
    deletions: number;
  };
}

/**
 * Internal representation of a GitHub review from the API.
 */
export interface GitHubAPIReview {
  id: number;
  user: { login: string } | null;
  state: string;
  body: string;
  submitted_at: string;
}

/**
 * Internal representation of a GitHub release from the API.
 */
export interface GitHubAPIRelease {
  id: number;
  tag_name: string;
  name: string | null;
  body: string | null;
  target_commitish: string;
  draft: boolean;
  prerelease: boolean;
  published_at: string | null;
  created_at: string;
}
