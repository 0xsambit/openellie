import { getDatabase } from "../lib/db/client.js";
import { generateEmbedding } from "../ai/embeddings.js";
import { logger } from "../lib/logger.js";
import type { SearchResult, QuerySource } from "./types.js";

/**
 * Performs vector cosine similarity search against a specific table.
 *
 * Uses pgvector's `<=>` operator (cosine distance) with IVFFlat index.
 * Results are ranked by similarity (1 - distance = similarity).
 *
 * @param params - Search parameters.
 * @returns Array of search results ranked by similarity.
 */
export async function vectorSearch(params: {
  source: QuerySource;
  searchText: string;
  workspaceId: string;
  limit?: number;
  filters?: Record<string, string>;
}): Promise<SearchResult[]> {
  const { source, searchText, workspaceId, limit = 20, filters = {} } = params;

  try {
    // Generate embedding for the search text
    const queryEmbedding = await generateEmbedding(searchText, workspaceId);
    const embeddingStr = `[${queryEmbedding.join(",")}]`;

    const db = getDatabase();
    const rawDb = db.$client;

    let results: SearchResult[] = [];

    switch (source) {
      case "github_prs":
        results = await searchGithubPrs(rawDb, workspaceId, embeddingStr, limit, filters);
        break;
      case "github_commits":
        results = await searchGithubCommits(rawDb, workspaceId, embeddingStr, limit, filters);
        break;
      case "tickets":
        results = await searchTickets(rawDb, workspaceId, embeddingStr, limit, filters);
        break;
      case "sentry_issues":
        results = await searchSentryIssues(rawDb, workspaceId, embeddingStr, limit, filters);
        break;
      case "github_releases":
        // Releases don't have embeddings
        return [];
      default:
        return [];
    }

    logger.debug(
      { source, resultCount: results.length, limit },
      "Vector search completed",
    );

    return results;
  } catch (error) {
    logger.error({ err: error, source }, "Vector search failed");
    return []; // Degrade gracefully — don't fail the whole query
  }
}

/**
 * Vector search on GitHub PRs table.
 */
async function searchGithubPrs(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  embeddingStr: string,
  limit: number,
  filters: Record<string, string>,
): Promise<SearchResult[]> {
  const filterClauses: string[] = [`workspace_id = '${workspaceId}'`];
  if (filters["state"]) filterClauses.push(`state = '${filters["state"]}'`);
  if (filters["author"]) filterClauses.push(`author = '${filters["author"]}'`);
  if (filters["repo"]) filterClauses.push(`repo_name = '${filters["repo"]}'`);

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
    similarity: number;
  }[]>(
    `SELECT id, number, title, body, state, author, repo_name, head_branch, updated_at,
     1 - (embedding <=> $1::vector) AS similarity
     FROM github_pull_requests
     WHERE ${whereClause} AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embeddingStr, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "github_prs" as QuerySource,
    title: row.title,
    body: row.body?.slice(0, 200),
    citation: `PR #${row.number} in ${row.repo_name}`,
    url: `https://github.com/${row.repo_name}/pull/${row.number}`,
    rrfScore: 0,
    finalScore: row.similarity,
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
 * Vector search on GitHub commits table.
 */
async function searchGithubCommits(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  embeddingStr: string,
  limit: number,
  filters: Record<string, string>,
): Promise<SearchResult[]> {
  const filterClauses: string[] = [`workspace_id = '${workspaceId}'`];
  if (filters["repo"]) filterClauses.push(`repo_name = '${filters["repo"]}'`);
  if (filters["author"]) filterClauses.push(`author_email ILIKE '%${filters["author"]}%' OR author_name ILIKE '%${filters["author"]}%'`);

  const whereClause = filterClauses.join(" AND ");

  const rows = await rawDb.unsafe<{
    id: string;
    sha: string;
    message: string;
    author_name: string;
    repo_name: string;
    committed_at: Date;
    similarity: number;
  }[]>(
    `SELECT id, sha, message, author_name, repo_name, committed_at,
     1 - (embedding <=> $1::vector) AS similarity
     FROM github_commits
     WHERE ${whereClause} AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embeddingStr, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "github_commits" as QuerySource,
    title: row.message.split("\n")[0] ?? row.message,
    citation: `Commit \`${row.sha.slice(0, 7)}\` in ${row.repo_name}`,
    url: `https://github.com/${row.repo_name}/commit/${row.sha}`,
    rrfScore: 0,
    finalScore: row.similarity,
    metadata: {
      sha: row.sha,
      authorName: row.author_name,
      repoName: row.repo_name,
    },
    timestamp: row.committed_at,
  }));
}

/**
 * Vector search on tickets table.
 */
async function searchTickets(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  embeddingStr: string,
  limit: number,
  filters: Record<string, string>,
): Promise<SearchResult[]> {
  const filterClauses: string[] = [`workspace_id = '${workspaceId}'`];
  if (filters["source"]) filterClauses.push(`source = '${filters["source"]}'`);
  if (filters["status"]) filterClauses.push(`status = '${filters["status"]}'`);
  if (filters["assignee"]) filterClauses.push(`assignee ILIKE '%${filters["assignee"]}%'`);
  if (filters["sprint"]) filterClauses.push(`sprint_name ILIKE '%${filters["sprint"]}%'`);

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
    similarity: number;
  }[]>(
    `SELECT id, external_id, source, title, description, status, priority, assignee, project_name, updated_at,
     1 - (embedding <=> $1::vector) AS similarity
     FROM tickets
     WHERE ${whereClause} AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embeddingStr, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "tickets" as QuerySource,
    title: row.title,
    body: row.description?.slice(0, 200),
    citation: `${row.external_id} (${row.source})`,
    rrfScore: 0,
    finalScore: row.similarity,
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
 * Vector search on Sentry issues table.
 */
async function searchSentryIssues(
  rawDb: ReturnType<typeof getDatabase>["$client"],
  workspaceId: string,
  embeddingStr: string,
  limit: number,
  filters: Record<string, string>,
): Promise<SearchResult[]> {
  const filterClauses: string[] = [`workspace_id = '${workspaceId}'`];
  if (filters["level"]) filterClauses.push(`level = '${filters["level"]}'`);
  if (filters["status"]) filterClauses.push(`status = '${filters["status"]}'`);
  if (filters["project"]) filterClauses.push(`project_name = '${filters["project"]}'`);

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
    similarity: number;
  }[]>(
    `SELECT id, sentry_id, title, culprit, level, status, times_seen, last_seen, project_name,
     1 - (embedding <=> $1::vector) AS similarity
     FROM sentry_issues
     WHERE ${whereClause} AND embedding IS NOT NULL
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [embeddingStr, limit],
  );

  return rows.map((row) => ({
    id: row.id,
    source: "sentry_issues" as QuerySource,
    title: row.title,
    body: row.culprit ?? undefined,
    citation: `Sentry issue in ${row.project_name} (${row.level})`,
    rrfScore: 0,
    finalScore: row.similarity,
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
