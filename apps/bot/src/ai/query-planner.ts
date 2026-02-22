import { generateObject } from "ai";
import { z } from "zod";
import { resolveActiveProvider } from "./provider.js";
import { buildQueryPlanningPrompt } from "./prompts/query.js";
import { SYSTEM_PROMPT } from "./prompts/system.js";
import { CompletionError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { QueryPlan, IntentResult } from "../pipeline/types.js";

/**
 * Zod schema for the LLM's structured query planning response.
 */
const QueryPlanResponseSchema = z.object({
  intents: z.array(
    z.enum([
      "PR_QUERY",
      "COMMIT_QUERY",
      "TICKET_QUERY",
      "ERROR_QUERY",
      "ANALYTICS_QUERY",
      "CROSS_SOURCE_QUERY",
    ]),
  ),
  confidence: z.number().min(0).max(1),
  entities: z.object({
    users: z.array(z.string()).default([]),
    repos: z.array(z.string()).default([]),
    projects: z.array(z.string()).default([]),
    labels: z.array(z.string()).default([]),
    sprints: z.array(z.string()).default([]),
    branches: z.array(z.string()).default([]),
  }),
  timeRange: z.object({
    since: z.string().nullable(),
    until: z.string().nullable(),
    description: z.string().nullable(),
  }),
  filters: z.object({
    state: z.string().nullable(),
    priority: z.string().nullable(),
    type: z.string().nullable(),
    level: z.string().nullable(),
  }),
  queryPlans: z.array(
    z.object({
      source: z.enum([
        "github_prs",
        "github_commits",
        "github_releases",
        "tickets",
        "sentry_issues",
      ]),
      searchText: z.string(),
      structuredFilters: z.record(z.string()).default({}),
      limit: z.number().int().positive().default(20),
      sortBy: z.string().default("updated_at"),
      sortOrder: z.enum(["asc", "desc"]).default("desc"),
    }),
  ),
});

/**
 * Runs the query planning LLM call (Steps 1+2 of the pipeline).
 *
 * Uses Vercel AI SDK's generateObject() for structured output with
 * automatic schema validation — no manual JSON parsing.
 *
 * @param query - Raw user query from Slack.
 * @param workspaceId - Workspace UUID for provider resolution.
 * @returns Structured intent result and query plans.
 */
export async function planQuery(
  query: string,
  workspaceId: string,
): Promise<{ intentResult: IntentResult; queryPlans: QueryPlan[] }> {
  const startTime = Date.now();

  try {
    const { languageModel, provider } = await resolveActiveProvider(workspaceId);
    const currentTime = new Date().toISOString();

    const result = await generateObject({
      model: languageModel,
      system: SYSTEM_PROMPT,
      prompt: buildQueryPlanningPrompt(query, currentTime),
      schema: QueryPlanResponseSchema,
    });

    const latencyMs = Date.now() - startTime;
    logger.debug(
      {
        intents: result.object.intents,
        planCount: result.object.queryPlans.length,
        latencyMs,
        provider,
      },
      "Query planning completed",
    );

    // Map to internal types
    const intentResult: IntentResult = {
      intents: result.object.intents,
      confidence: result.object.confidence,
      entities: result.object.entities,
      timeRange: {
        since: result.object.timeRange.since
          ? new Date(result.object.timeRange.since)
          : null,
        until: result.object.timeRange.until
          ? new Date(result.object.timeRange.until)
          : null,
        description: result.object.timeRange.description,
      },
      filters: result.object.filters,
    };

    const queryPlans: QueryPlan[] = result.object.queryPlans.map((plan) => ({
      source: plan.source,
      searchText: plan.searchText,
      structuredFilters: plan.structuredFilters,
      limit: plan.limit,
      sortBy: plan.sortBy,
      sortOrder: plan.sortOrder,
    }));

    return { intentResult, queryPlans };
  } catch (error) {
    if (error instanceof CompletionError) throw error;
    throw new CompletionError(
      `Query planning failed: ${error instanceof Error ? error.message : String(error)}`,
      "unknown",
      error,
    );
  }
}
