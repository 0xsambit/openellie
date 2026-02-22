import { embed, embedMany } from "ai";
import { resolveActiveProvider } from "./provider.js";
import { EmbeddingError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { EMBEDDING } from "@openellie/shared/constants";

/**
 * Generates a single embedding vector for the given text.
 *
 * @param text - Text to embed.
 * @param workspaceId - Workspace ID to resolve the active embedding model.
 * @returns 1536-dimensional float array.
 * @throws EmbeddingError if the API call fails.
 */
export async function generateEmbedding(
  text: string,
  workspaceId: string,
): Promise<number[]> {
  try {
    const { embeddingModel, provider } = await resolveActiveProvider(workspaceId);

    const result = await embed({
      model: embeddingModel,
      value: text,
    });

    if (result.embedding.length !== EMBEDDING.DIMENSIONS) {
      throw new EmbeddingError(
        `Expected ${EMBEDDING.DIMENSIONS} dimensions, got ${result.embedding.length}. ` +
          `Check your embedding model configuration — only 1536-dim models are supported.`,
        provider,
      );
    }

    return result.embedding;
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;
    throw new EmbeddingError(
      `Embedding generation failed: ${error instanceof Error ? error.message : String(error)}`,
      "unknown",
      error,
    );
  }
}

/**
 * Generates embeddings for a batch of texts.
 * More efficient than calling generateEmbedding() in a loop.
 *
 * @param texts - Array of texts to embed.
 * @param workspaceId - Workspace ID to resolve the active embedding model.
 * @returns Array of 1536-dimensional float arrays, in the same order as input.
 * @throws EmbeddingError if the API call fails or dimensions don't match.
 */
export async function generateEmbeddings(
  texts: string[],
  workspaceId: string,
): Promise<number[][]> {
  if (texts.length === 0) return [];

  try {
    const { embeddingModel, provider } = await resolveActiveProvider(workspaceId);

    const result = await embedMany({
      model: embeddingModel,
      values: texts,
    });

    // Validate all embeddings have the correct dimension
    for (let i = 0; i < result.embeddings.length; i++) {
      const embedding = result.embeddings[i];
      if (embedding && embedding.length !== EMBEDDING.DIMENSIONS) {
        throw new EmbeddingError(
          `Embedding ${i} has ${embedding.length} dimensions, expected ${EMBEDDING.DIMENSIONS}. ` +
            `Only text-embedding-3-small and voyage-3-large (1536 dims) are supported.`,
          provider,
        );
      }
    }

    logger.debug(
      { count: texts.length, usage: result.usage },
      "Generated embeddings batch",
    );

    return result.embeddings as number[][];
  } catch (error) {
    if (error instanceof EmbeddingError) throw error;
    throw new EmbeddingError(
      `Batch embedding failed: ${error instanceof Error ? error.message : String(error)}`,
      "unknown",
      error,
    );
  }
}

/**
 * Builds the embedding text for a GitHub pull request.
 * Combines the most semantically rich fields.
 *
 * @param title - PR title.
 * @param body - PR description (may be null).
 * @param labels - Array of label strings.
 * @param headBranch - Source branch name.
 */
export function buildPrEmbeddingText(
  opts: { title: string; body: string | null | undefined; labels: string[]; headBranch: string },
): string {
  const parts = [opts.title];
  if (opts.body) parts.push(opts.body.slice(0, 1000)); // Cap body at 1000 chars
  if (opts.labels.length > 0) parts.push(opts.labels.join(" "));
  parts.push(opts.headBranch);
  return parts.join("\n");
}

/**
 * Builds the embedding text for a GitHub commit.
 *
 * @param message - Full commit message.
 * @param repoName - Repository name (owner/repo).
 */
export function buildCommitEmbeddingText(
  opts: { message: string; repoName: string },
): string {
  // First 500 chars of message + repo name
  return `${opts.message.slice(0, 500)}\n${opts.repoName}`;
}

/**
 * Builds the embedding text for a ticket (Jira/Linear).
 *
 * @param title - Ticket title.
 * @param description - Ticket description (may be null).
 * @param labels - Array of label strings.
 * @param sprintName - Sprint/cycle name (may be null).
 */
export function buildTicketEmbeddingText(
  opts: { title: string; description: string | null | undefined; labels: string[] | null | undefined; sprintName: string | null | undefined },
): string {
  const parts = [opts.title];
  if (opts.description) parts.push(opts.description.slice(0, 1000));
  if (opts.labels && opts.labels.length > 0) parts.push(opts.labels.join(" "));
  if (opts.sprintName) parts.push(opts.sprintName);
  return parts.join("\n");
}

/**
 * Builds the embedding text for a Sentry issue.
 *
 * @param title - Issue title / exception type.
 * @param culprit - File path or module where error originated.
 */
export function buildSentryEmbeddingText(
  title: string,
  culprit: string | null | undefined,
): string {
  const parts = [title];
  if (culprit) parts.push(culprit);
  return parts.join("\n");
}
