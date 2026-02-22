import { getDatabase } from "../lib/db/client.js";
import { logger } from "../lib/logger.js";
import type { SearchResult, QuerySource } from "./types.js";

/**
 * Performs Postgres full-text search (tsvector) against a specific table.
 *
 * Uses GIN indexes on pre-computed tsvector expressions.
 * Supports: plainto_tsquery for natural language, websearch_to_tsquery for web-style search.
 *
 * @param params - Search parameters.
 * @returns Array of search results ranked by text relevance (ts_rank).
 */
export async function keywordSearch(params: {
  source: QuerySource;
  searchText: string;
  workspaceId: string;
  limit?: number;
  filters?: Record<string, string>;
}): Promise<SearchResult[]> {
  const { source, searchText, workspaceId, limit = 20, filters = {} } = params;

  if (!searchText.trim()) return [];

  try {
    const db = getDatabase();
    const rawDb = db.$client;
    let results: SearchResult[] = [];

    switch (source) {
      case "github_prs":
        results = await keywordSearchPrs(rawDb, workspaceId, searchText, limit, filters);
        break;
      case "github_commits":
        results = await keywordSearchCommits(rawDb, workspaceId, searchText, limit, filters);
        break;
      case "tickets":
        results = await keywordSearchTickets(rawDb, workspaceId, searchText, limit, filters);
        break;
      case "sentry_issues":
        results = await keywordSearchSentry(rawDb, workspaceId, searchText, limit, filters);
        break;
      case "github_releases":
        results = await keywordSearchReleases(rawDb, workspaceId, searchText, limit, filters);
        break;
      default:
        return [];
    }

    logger.debug(
      { source, query: searchText, resultCount: results.length },
      "Keyword search completed",
    );

    return results;
  } catch (error) {
    logger.error({ err: error, source }, "Keyword search failed");
    return []; // Degrade gracefully
  }
}

/**
 * Keyword search on GitHub PRs.
 */
async function keywordSearchPrs(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  searchText: string,
  limit: number,
  filters: Record<string, string>,
): Promise<SearchResult[]> {
  const filterClauses: string[] = [`workspace_id = '${workspaceId}'`];
  if (filters["state"]) filterClauses.push(`state = '${filters["state"]}'`);
  if (filters["author"]) filterClauses.push(`author = '${filters["author"]}'`);
  const whereClause = filterClauses.join(" AND ");

  const rows = await rawDb.unsafe<{
    id: string;
    number: number;
    title: string;
    body: string | null;
    state: string;
    author: string;
    repo_name: string;
    head_branch: string;
    updated_at: Date;
    rank: number;
  }[]>(
    `SELECT id, number, title, body, state, author, repo_name, head_branch, updated_at,
     ts_rank(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '')),
             websearch_to_tsquery('english', $1)) AS rank
     FROM github_pull_requests
     WHERE ${whereClause}
       AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
           @@ websearch_to_tsquery('english', $1)
     ORDER BY rank DESC, updated_at DESC
     LIMIT $2`,
    [searchText, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "github_prs" as QuerySource,
    title: row.title,
    body: row.body?.slice(0, 200),
    citation: `PR #${row.number} in ${row.repo_name}`,
    url: `https://github.com/${row.repo_name}/pull/${row.number}`,
    rrfScore: 0,
    finalScore: row.rank,
    metadata: {
      state: row.state,
      author: row.author,
      headBranch: row.head_branch,
      repoName: row.repo_name,
      number: row.number,
    },
    timestamp: row.updated_at,
  }));
}

/**
 * Keyword search on GitHub commits.
 */
async function keywordSearchCommits(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  searchText: string,
  limit: number,
  filters: Record<string, string>,
): Promise<SearchResult[]> {
  const filterClauses: string[] = [`workspace_id = '${workspaceId}'`];
  if (filters["repo"]) filterClauses.push(`repo_name = '${filters["repo"]}'`);
  const whereClause = filterClauses.join(" AND ");

  const rows = await rawDb.unsafe<{
    id: string;
    sha: string;
    message: string;
    author_name: string;
    repo_name: string;
    committed_at: Date;
    rank: number;
  }[]>(
    `SELECT id, sha, message, author_name, repo_name, committed_at,
     ts_rank(to_tsvector('english', coalesce(message, '')),
             websearch_to_tsquery('english', $1)) AS rank
     FROM github_commits
     WHERE ${whereClause}
       AND to_tsvector('english', coalesce(message, ''))
           @@ websearch_to_tsquery('english', $1)
     ORDER BY rank DESC, committed_at DESC
     LIMIT $2`,
    [searchText, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "github_commits" as QuerySource,
    title: row.message.split("\n")[0] ?? row.message,
    citation: `Commit \`${row.sha.slice(0, 7)}\` in ${row.repo_name}`,
    url: `https://github.com/${row.repo_name}/commit/${row.sha}`,
    rrfScore: 0,
    finalScore: row.rank,
    metadata: {
      sha: row.sha,
      authorName: row.author_name,
      repoName: row.repo_name,
    },
    timestamp: row.committed_at,
  }));
}

/**
 * Keyword search on tickets.
 */
async function keywordSearchTickets(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  searchText: string,
  limit: number,
  filters: Record<string, string>,
): Promise<SearchResult[]> {
  const filterClauses: string[] = [`workspace_id = '${workspaceId}'`];
  if (filters["status"]) filterClauses.push(`status = '${filters["status"]}'`);
  if (filters["source"]) filterClauses.push(`source = '${filters["source"]}'`);
  const whereClause = filterClauses.join(" AND ");

  const rows = await rawDb.unsafe<{
    id: string;
    external_id: string;
    source: string;
    title: string;
    description: string | null;
    status: string | null;
    priority: string | null;
    assignee: string | null;
    project_name: string | null;
    updated_at: Date;
    rank: number;
  }[]>(
    `SELECT id, external_id, source, title, description, status, priority, assignee, project_name, updated_at,
     ts_rank(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')),
             websearch_to_tsquery('english', $1)) AS rank
     FROM tickets
     WHERE ${whereClause}
       AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, ''))
           @@ websearch_to_tsquery('english', $1)
     ORDER BY rank DESC, updated_at DESC
     LIMIT $2`,
    [searchText, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "tickets" as QuerySource,
    title: row.title,
    body: row.description?.slice(0, 200),
    citation: `${row.external_id} (${row.source})`,
    rrfScore: 0,
    finalScore: row.rank,
    metadata: {
      externalId: row.external_id,
      source: row.source,
      status: row.status,
      priority: row.priority,
      assignee: row.assignee,
      projectName: row.project_name,
    },
    timestamp: row.updated_at,
  }));
}

/**
 * Keyword search on Sentry issues.
 */
async function keywordSearchSentry(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  searchText: string,
  limit: number,
  filters: Record<string, string>,
): Promise<SearchResult[]> {
  const filterClauses: string[] = [`workspace_id = '${workspaceId}'`];
  if (filters["level"]) filterClauses.push(`level = '${filters["level"]}'`);
  if (filters["status"]) filterClauses.push(`status = '${filters["status"]}'`);
  const whereClause = filterClauses.join(" AND ");

  const rows = await rawDb.unsafe<{
    id: string;
    sentry_id: string;
    title: string;
    culprit: string | null;
    level: string;
    status: string;
    times_seen: number;
    last_seen: Date;
    project_name: string;
    rank: number;
  }[]>(
    `SELECT id, sentry_id, title, culprit, level, status, times_seen, last_seen, project_name,
     ts_rank(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(culprit, '')),
             websearch_to_tsquery('english', $1)) AS rank
     FROM sentry_issues
     WHERE ${whereClause}
       AND to_tsvector('english', coalesce(title, '') || ' ' || coalesce(culprit, ''))
           @@ websearch_to_tsquery('english', $1)
     ORDER BY rank DESC, last_seen DESC
     LIMIT $2`,
    [searchText, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "sentry_issues" as QuerySource,
    title: row.title,
    body: row.culprit ?? undefined,
    citation: `Sentry issue in ${row.project_name} (${row.level})`,
    rrfScore: 0,
    finalScore: row.rank,
    metadata: {
      sentryId: row.sentry_id,
      level: row.level,
      status: row.status,
      timesSeen: row.times_seen,
      projectName: row.project_name,
    },
    timestamp: row.last_seen,
  }));
}

/**
 * Keyword search on GitHub releases (no tsvector — use ILIKE).
 */
async function keywordSearchReleases(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  searchText: string,
  limit: number,
  _filters: Record<string, string>,
): Promise<SearchResult[]> {
  const rows = await rawDb.unsafe<{
    id: string;
    github_id: string;
    tag_name: string;
    name: string | null;
    repo_name: string;
    published_at: Date | null;
    created_at: Date;
  }[]>(
    `SELECT id, github_id, tag_name, name, repo_name, published_at, created_at
     FROM github_releases
     WHERE workspace_id = $1
       AND (tag_name ILIKE $2 OR name ILIKE $2)
     ORDER BY published_at DESC
     LIMIT $3`,
    [workspaceId, `%${searchText}%`, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "github_releases" as QuerySource,
    title: `Release ${row.tag_name}${row.name ? ` — ${row.name}` : ""}`,
    citation: `Release ${row.tag_name} in ${row.repo_name}`,
    url: `https://github.com/${row.repo_name}/releases/tag/${row.tag_name}`,
    rrfScore: 0,
    finalScore: 1,
    metadata: {
      tagName: row.tag_name,
      repoName: row.repo_name,
    },
    timestamp: row.published_at ?? row.created_at,
  }));
}
