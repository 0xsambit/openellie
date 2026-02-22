/**
 * Data sources that can be searched.
 */
export type QuerySource =
  | "github_prs"
  | "github_commits"
  | "github_releases"
  | "tickets"
  | "sentry_issues";

/**
 * A single search result from any source.
 * Used across vector search, keyword search, and hybrid search.
 */
export interface SearchResult {
  /** Internal database UUID. */
  id: string;
  /** Which data source this result came from. */
  source: QuerySource;
  /** Primary title / headline. */
  title: string;
  /** Optional body preview (truncated). */
  body?: string;
  /** Human-readable citation string for display. */
  citation: string;
  /** URL to the source (e.g. GitHub PR URL). */
  url?: string;
  /** RRF fusion score (populated by hybrid search). */
  rrfScore: number;
  /** Final combined score used for ranking. */
  finalScore: number;
  /** Source-specific metadata for structured display. */
  metadata: Record<string, unknown>;
  /** Timestamp for recency scoring. */
  timestamp: Date;
}
