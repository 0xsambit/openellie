/* eslint-disable @typescript-eslint/no-base-to-string */
import { getEncoding } from "js-tiktoken";
import type { SearchResult, AssembledContext, QuerySource } from "./types.js";
import type { SourceItem } from "../bot/blocks/answer.js";
import { logger } from "../lib/logger.js";
import { QUERY_PIPELINE } from "@openellie/shared/constants";

// Initialize the cl100k_base encoding (used by GPT-4, Claude, etc.)
// This is loaded once and cached
const encoding = getEncoding("cl100k_base");

/**
 * Counts tokens in a string using tiktoken's cl100k_base encoding.
 *
 * @param text - Text to count tokens for.
 * @returns Approximate token count.
 */
export function countTokens(text: string): number {
  return encoding.encode(text).length;
}

/**
 * Assembles and formats search results into a context block for the LLM.
 *
 * Steps:
 * 1. Deduplicate by source+id
 * 2. Sort by finalScore descending
 * 3. Format each result as a context block
 * 4. Truncate to fit within MAX_CONTEXT_TOKENS
 * 5. Extract source citations for Slack Block Kit
 *
 * @param results - All search results from hybrid search (multiple sources).
 * @returns Assembled context ready for answer generation.
 */
export function assembleContext(
  results: SearchResult[],
  sourcesSearched: QuerySource[],
): AssembledContext {
  // Step 1: Deduplicate by ID (same item might appear from multiple query plans)
  const deduplicated = new Map<string, SearchResult>();
  for (const result of results) {
    const existing = deduplicated.get(result.id);
    if (!existing || result.finalScore > existing.finalScore) {
      deduplicated.set(result.id, result);
    }
  }

  // Step 2: Sort by finalScore descending
  const sorted = Array.from(deduplicated.values()).sort(
    (a, b) => b.finalScore - a.finalScore,
  );

  if (sorted.length === 0) {
    return {
      formattedContext: "",
      resultCount: 0,
      sources: [],
      tokenCount: 0,
      sourcesSearched,
    };
  }

  // Step 3: Format and truncate to token limit
  const contextParts: string[] = [];
  let totalTokens = 0;
  let includedCount = 0;

  for (const result of sorted) {
    const block = formatResultBlock(result);
    const blockTokens = countTokens(block);

    if (totalTokens + blockTokens > QUERY_PIPELINE.MAX_CONTEXT_TOKENS) {
      // Stop adding more context — token limit reached
      break;
    }

    contextParts.push(block);
    totalTokens += blockTokens;
    includedCount++;
  }

  // Step 4: Build source citations (top 5 for Slack Block Kit)
  const sources: SourceItem[] = sorted
    .slice(0, 5)
    .map((result) => ({
      label: result.citation,
      url: result.url,
      detail: getSourceDetail(result),
    }));

  const formattedContext =
    contextParts.length > 0
      ? `## Retrieved Engineering Data (${includedCount} items)\n\n` +
        contextParts.join("\n---\n")
      : "";

  logger.debug(
    {
      totalResults: results.length,
      deduplicated: deduplicated.size,
      included: includedCount,
      tokenCount: totalTokens,
    },
    "Context assembled",
  );

  return {
    formattedContext,
    resultCount: includedCount,
    sources,
    tokenCount: totalTokens,
    sourcesSearched,
  };
}

/**
 * Formats a single search result as a context block for the LLM.
 */
function formatResultBlock(result: SearchResult): string {
  const lines: string[] = [];

  switch (result.source) {
    case "github_prs": {
      const meta = result.metadata;
      lines.push(`### GitHub PR: ${result.citation}`);
      lines.push(`**Title:** ${result.title}`);
      if (meta["state"]) lines.push(`**State:** ${String(meta["state"])}`);
      if (meta["author"]) lines.push(`**Author:** ${String(meta["author"])}`);
      if (meta["headBranch"]) lines.push(`**Branch:** ${String(meta["headBranch"])}`);
      if (result.url) lines.push(`**URL:** ${result.url}`);
      if (result.body) lines.push(`**Description:** ${result.body}`);
      break;
    }

    case "github_commits": {
      const meta = result.metadata;
      lines.push(`### GitHub Commit: ${result.citation}`);
      lines.push(`**Message:** ${result.title}`);
      if (meta["authorName"]) lines.push(`**Author:** ${String(meta["authorName"])}`);
      if (meta["sha"]) lines.push(`**SHA:** \`${String(meta["sha"]).slice(0, 7)}\``);
      if (result.url) lines.push(`**URL:** ${result.url}`);
      break;
    }

    case "github_releases": {
      const meta = result.metadata;
      lines.push(`### GitHub Release: ${result.citation}`);
      lines.push(`**Tag:** ${String(meta["tagName"] ?? "")}`);
      lines.push(`**Repository:** ${String(meta["repoName"] ?? "")}`);
      lines.push(`**Published:** ${result.timestamp.toISOString()}`);
      if (result.url) lines.push(`**URL:** ${result.url}`);
      break;
    }

    case "tickets": {
      const meta = result.metadata;
      lines.push(`### Ticket: ${result.citation}`);
      lines.push(`**Title:** ${result.title}`);
      if (meta["status"]) lines.push(`**Status:** ${String(meta["status"])}`);
      if (meta["priority"]) lines.push(`**Priority:** ${String(meta["priority"])}`);
      if (meta["assignee"]) lines.push(`**Assignee:** ${String(meta["assignee"])}`);
      if (meta["projectName"]) lines.push(`**Project:** ${String(meta["projectName"])}`);
      if (result.body) lines.push(`**Description:** ${result.body}`);
      break;
    }

    case "sentry_issues": {
      const meta = result.metadata;
      lines.push(`### Sentry Issue: ${result.citation}`);
      lines.push(`**Title:** ${result.title}`);
      if (meta["level"]) lines.push(`**Level:** ${String(meta["level"])}`);
      if (meta["status"]) lines.push(`**Status:** ${String(meta["status"])}`);
      if (meta["timesSeen"]) lines.push(`**Times Seen:** ${String(meta["timesSeen"])}`);
      if (result.body) lines.push(`**Culprit:** ${result.body}`);
      lines.push(`**Last Seen:** ${result.timestamp.toISOString()}`);
      break;
    }
  }

  return lines.join("\n");
}

/**
 * Extracts a short detail string for the Slack source list.
 */
function getSourceDetail(result: SearchResult): string | undefined {
  const meta = result.metadata;

  switch (result.source) {
    case "github_prs":
      return meta["state"] ? `State: ${String(meta["state"])}` : undefined;
    case "github_commits":
      return meta["sha"] ? `\`${String(meta["sha"]).slice(0, 7)}\`` : undefined;
    case "tickets":
      return meta["status"] ? String(meta["status"]) : undefined;
    case "sentry_issues":
      return meta["level"] ? String(meta["level"]) : undefined;
    default:
      return undefined;
  }
}
