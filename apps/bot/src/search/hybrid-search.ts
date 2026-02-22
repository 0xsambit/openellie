import { vectorSearch } from "./vector-search.js";
import { keywordSearch } from "./keyword-search.js";
import { logger } from "../lib/logger.js";
import { QUERY_PIPELINE } from "@openellie/shared/constants";
import type { SearchResult, QueryPlan } from "../pipeline/types.js";

/**
 * Performs hybrid search combining vector similarity + full-text keyword search,
 * fused using Reciprocal Rank Fusion (RRF).
 *
 * RRF formula: score(d) = Σ 1/(k + rank(d))
 * where k=60 (standard), rank is 1-based position in each ranked list.
 *
 * Higher RRF scores = more relevant across both search methods.
 *
 * @param plan - Query plan specifying source, search text, and filters.
 * @param workspaceId - Workspace UUID.
 * @returns Deduplicated, RRF-fused results ranked by relevance.
 */
export async function hybridSearch(
  plan: QueryPlan,
  workspaceId: string,
): Promise<SearchResult[]> {
  const startTime = Date.now();

  // Run vector and keyword search in parallel
  const [vectorResults, keywordResults] = await Promise.all([
    vectorSearch({
      source: plan.source,
      searchText: plan.searchText,
      workspaceId,
      limit: plan.limit,
      filters: plan.structuredFilters,
    }),
    keywordSearch({
      source: plan.source,
      searchText: plan.searchText,
      workspaceId,
      limit: plan.limit,
      filters: plan.structuredFilters,
    }),
  ]);

  // Apply RRF fusion
  const fused = reciprocalRankFusion(vectorResults, keywordResults, QUERY_PIPELINE.RRF_K);

  // Apply recency decay scoring
  const rescored = applyRecencyDecay(fused);

  // Sort by final score and limit
  const results = rescored
    .sort((a, b) => b.finalScore - a.finalScore)
    .slice(0, plan.limit);

  logger.debug(
    {
      source: plan.source,
      vectorCount: vectorResults.length,
      keywordCount: keywordResults.length,
      fusedCount: fused.size,
      finalCount: results.length,
      latencyMs: Date.now() - startTime,
    },
    "Hybrid search completed",
  );

  return results;
}

/**
 * Performs RRF fusion on two ranked result lists.
 *
 * @param listA - First ranked result list (e.g., vector search results).
 * @param listB - Second ranked result list (e.g., keyword search results).
 * @param k - RRF constant (default 60). Higher k reduces the impact of rank differences.
 * @returns Map of item ID to merged SearchResult with RRF score.
 */
function reciprocalRankFusion(
  listA: SearchResult[],
  listB: SearchResult[],
  k: number,
): Map<string, SearchResult> {
  const scores = new Map<string, { result: SearchResult; rrfScore: number }>();

  // Score results from list A
  for (let i = 0; i < listA.length; i++) {
    const result = listA[i];
    if (!result) continue;
    const rrfScore = 1 / (k + i + 1);
    scores.set(result.id, { result, rrfScore });
  }

  // Score results from list B and merge
  for (let i = 0; i < listB.length; i++) {
    const result = listB[i];
    if (!result) continue;
    const rrfScore = 1 / (k + i + 1);
    const existing = scores.get(result.id);

    if (existing) {
      // Sum RRF scores from both lists
      existing.rrfScore += rrfScore;
    } else {
      scores.set(result.id, { result, rrfScore });
    }
  }

  // Build output map
  const output = new Map<string, SearchResult>();
  for (const [id, { result, rrfScore }] of scores) {
    output.set(id, { ...result, rrfScore, finalScore: rrfScore });
  }

  return output;
}

/**
 * Applies a recency decay multiplier to RRF scores.
 *
 * Recent items get a boost: items from the last 24 hours get 1.5x,
 * items from the last 7 days get 1.2x, older items get no boost.
 *
 * @param results - Map of RRF-fused results.
 * @returns Array of results with finalScore adjusted for recency.
 */
function applyRecencyDecay(
  results: Map<string, SearchResult>,
): SearchResult[] {
  const now = Date.now();
  const DAY_MS = 24 * 60 * 60 * 1000;
  const WEEK_MS = 7 * DAY_MS;

  return Array.from(results.values()).map((result) => {
    const ageMs = now - result.timestamp.getTime();
    let recencyMultiplier = 1.0;

    if (ageMs < DAY_MS) {
      recencyMultiplier = 1.5; // Last 24 hours
    } else if (ageMs < WEEK_MS) {
      recencyMultiplier = 1.2; // Last 7 days
    }

    return {
      ...result,
      finalScore: result.rrfScore * recencyMultiplier,
    };
  });
}
