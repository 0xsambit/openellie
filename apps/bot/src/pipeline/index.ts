import { createHash } from "crypto";
import { getRedis, RedisKeys } from "../lib/redis.js";
import { createQueryLog } from "../lib/db/queries/query-logs.js";
import { planQuery } from "../ai/query-planner.js";
import { generateAnswer } from "../ai/answer-gen.js";
import { hybridSearch } from "../search/hybrid-search.js";
import { assembleContext } from "./assemble.js";
import { logger } from "../lib/logger.js";
import { QUERY_PIPELINE } from "@openellie/shared/constants";
import type { PipelineInput, PipelineResult, SearchResult, QuerySource } from "./types.js";

/**
 * Main query pipeline orchestrator.
 *
 * Executes all 6 steps:
 * 1. Intent classification
 * 2. Query decomposition
 * 3. Hybrid search (vector + keyword + structured, RRF fusion)
 * 4. Context assembly (dedup, rank, token truncation)
 * 5. Answer generation
 * 6. Cache + log
 *
 * @param input - Pipeline input parameters from Slack handler.
 * @returns Final pipeline result with answer, sources, and tracking IDs.
 */
export async function runQueryPipeline(
  input: PipelineInput,
): Promise<PipelineResult> {
  const { query, workspaceId, slackUserId, slackChannelId } = input;

  // Step 6a: Check cache first (before any LLM calls)
  const cacheKey = buildCacheKey(workspaceId, query);
  const cached = await checkCache(cacheKey);

  if (cached) {
    logger.info({ cacheKey }, "Query served from cache");

    // Still log the cached query to query_logs for analytics
    const queryLog = await createQueryLog({
      workspaceId,
      slackUserId,
      slackChannelId,
      rawQuery: query,
      resolvedQuery: cached.resolvedQuery,
      sourcesUsed: cached.sourcesUsed,
      responseText: cached.answerText,
      latencyMs: 0,
      tokenCount: 0,
    });

    return {
      answerText: cached.answerText,
      sources: cached.sources,
      queryLogId: queryLog.id,
      modelName: cached.modelName,
      fromCache: true,
    };
  }

  // Steps 1+2: Query planning (intent classification + decomposition)
  const startTime = Date.now();
  logger.info({ query, workspaceId }, "Starting query pipeline");

  const { intentResult, queryPlans } = await planQuery(query, workspaceId);

  logger.debug(
    {
      intents: intentResult.intents,
      planCount: queryPlans.length,
      confidence: intentResult.confidence,
    },
    "Query planned",
  );

  // Step 3: Hybrid search for each query plan (in parallel)
  const searchResultArrays = await Promise.all(
    queryPlans.map((plan) => hybridSearch(plan, workspaceId)),
  );

  // Flatten all results
  const allResults: SearchResult[] = searchResultArrays.flat();
  const sourcesSearched: QuerySource[] = [
    ...new Set(queryPlans.map((p) => p.source)),
  ];

  logger.debug(
    { totalResults: allResults.length, sources: sourcesSearched },
    "Search completed",
  );

  // Step 4: Context assembly
  const context = assembleContext(allResults, sourcesSearched);

  // Step 5: Answer generation
  const answer = await generateAnswer(query, context, workspaceId);

  const latencyMs = Date.now() - startTime;

  // Step 6b: Log to query_logs
  const queryLog = await createQueryLog({
    workspaceId,
    slackUserId,
    slackChannelId,
    rawQuery: query,
    resolvedQuery: query, // We use the original query as the resolved one for now
    sourcesUsed: sourcesSearched,
    responseText: answer.answerText,
    latencyMs,
    tokenCount: answer.tokenCount,
  });

  // Step 6c: Store in cache
  await setCache(cacheKey, {
    answerText: answer.answerText,
    sources: context.sources,
    modelName: answer.modelName,
    resolvedQuery: query,
    sourcesUsed: sourcesSearched,
  });

  logger.info(
    {
      queryLogId: queryLog.id,
      latencyMs,
      tokenCount: answer.tokenCount,
      resultCount: context.resultCount,
      provider: answer.provider,
    },
    "Query pipeline completed",
  );

  return {
    answerText: answer.answerText,
    sources: context.sources,
    queryLogId: queryLog.id,
    modelName: answer.modelName,
    fromCache: false,
  };
}

/**
 * Builds the Redis cache key for a query.
 * Uses SHA-256 of workspaceId + normalized query to avoid key length issues.
 *
 * @param workspaceId - Workspace UUID.
 * @param query - Raw query string.
 */
function buildCacheKey(workspaceId: string, query: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, " ");
  const hash = createHash("sha256")
    .update(`${workspaceId}:${normalized}`)
    .digest("hex");
  return RedisKeys.queryCache(hash);
}

interface CachedResult {
  answerText: string;
  sources: { label: string; url?: string; detail?: string }[];
  modelName: string;
  resolvedQuery: string;
  sourcesUsed: QuerySource[];
}

/**
 * Checks the Redis cache for a query result.
 *
 * @param key - Redis cache key.
 * @returns Cached result or null if not found.
 */
async function checkCache(key: string): Promise<CachedResult | null> {
  try {
    const redis = getRedis();
    const cached = await redis.get(key);
    if (!cached) return null;
    return JSON.parse(cached) as CachedResult;
  } catch (error) {
    logger.warn({ err: error }, "Cache check failed — proceeding without cache");
    return null;
  }
}

/**
 * Stores a query result in Redis with TTL.
 *
 * @param key - Redis cache key.
 * @param result - Result to cache.
 */
async function setCache(key: string, result: CachedResult): Promise<void> {
  try {
    const redis = getRedis();
    await redis.setex(
      key,
      QUERY_PIPELINE.CACHE_TTL_SECONDS,
      JSON.stringify(result),
    );
  } catch (error) {
    logger.warn({ err: error }, "Cache write failed — result not cached");
  }
}
