import type { SourceItem } from "../bot/blocks/answer.js";

/**
 * Supported query intent types.
 */
export type IntentType =
  | "PR_QUERY"
  | "COMMIT_QUERY"
  | "TICKET_QUERY"
  | "ERROR_QUERY"
  | "ANALYTICS_QUERY"
  | "CROSS_SOURCE_QUERY";

/**
 * Supported data source identifiers for query plans.
 */
export type QuerySource =
  | "github_prs"
  | "github_commits"
  | "github_releases"
  | "tickets"
  | "sentry_issues";

/**
 * Result of Step 1: Intent Classification.
 */
export interface IntentResult {
  /** One or more intents extracted from the query. */
  intents: IntentType[];
  /** LLM confidence score (0-1). */
  confidence: number;
  /** Entities extracted from the query. */
  entities: {
    users: string[];
    repos: string[];
    projects: string[];
    labels: string[];
    sprints: string[];
    branches: string[];
  };
  /** Time range extracted from the query (may have null components). */
  timeRange: {
    since: Date | null;
    until: Date | null;
    description: string | null;
  };
  /** Structured filters extracted from the query. */
  filters: {
    state: string | null;
    priority: string | null;
    type: string | null;
    level: string | null;
  };
}

/**
 * A single query plan targeting one data source.
 * Result of Step 2: Query Decomposition.
 */
export interface QueryPlan {
  /** Data source to search. */
  source: QuerySource;
  /** Text for semantic/keyword search. */
  searchText: string;
  /** Exact match filters (field → value). */
  structuredFilters: Record<string, string>;
  /** Maximum results to return from this source. */
  limit: number;
  /** Sort field. */
  sortBy: string;
  /** Sort direction. */
  sortOrder: "asc" | "desc";
}

/**
 * A single search result from any data source.
 */
export interface SearchResult {
  /** Internal database UUID. */
  id: string;
  /** Data source this result came from. */
  source: QuerySource;
  /** Primary content for display (title, message, etc.). */
  title: string;
  /** Secondary content (body, description, etc.). May be truncated. */
  body?: string;
  /** External URL for linking in Slack responses. */
  url?: string;
  /** Display label for source citations (e.g. "PR #234 in github/api-service"). */
  citation: string;
  /** RRF relevance score (higher = more relevant). */
  rrfScore: number;
  /** Recency-weighted score (higher = more relevant). */
  finalScore: number;
  /** Additional metadata for context. */
  metadata: Record<string, unknown>;
  /** Result creation/update timestamp for recency scoring. */
  timestamp: Date;
}

/**
 * Assembled context from Step 4, ready for answer generation.
 */
export interface AssembledContext {
  /** Pre-formatted context string for the LLM prompt. */
  formattedContext: string;
  /** Total number of search results included. */
  resultCount: number;
  /** Sources cited, for the Slack response source list. */
  sources: SourceItem[];
  /** Token count of the assembled context. */
  tokenCount: number;
  /** Data sources that were searched. */
  sourcesSearched: QuerySource[];
}

/**
 * Final result returned by the query pipeline to Slack handlers.
 */
export interface PipelineResult {
  /** Slack mrkdwn formatted answer text. */
  answerText: string;
  /** Source items for the Slack Block Kit sources section. */
  sources: SourceItem[];
  /** Query log UUID for feedback buttons. */
  queryLogId: string;
  /** AI model name for display in Slack footer. */
  modelName: string;
  /** Whether this result came from cache. */
  fromCache: boolean;
}

/**
 * Input parameters for the query pipeline.
 */
export interface PipelineInput {
  /** Raw query from Slack. */
  query: string;
  /** Workspace UUID. */
  workspaceId: string;
  /** Slack user ID of the requester. */
  slackUserId: string;
  /** Slack channel ID. */
  slackChannelId: string;
}
