import { generateText } from "ai";
import { resolveActiveProvider } from "./provider.js";
import { buildAnswerPrompt } from "./prompts/answer.js";
import { SYSTEM_PROMPT } from "./prompts/system.js";
import { CompletionError } from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import type { AssembledContext } from "../pipeline/types.js";

/**
 * Result of the answer generation step.
 */
export interface GeneratedAnswer {
  /** Slack mrkdwn formatted answer text. */
  answerText: string;
  /** Total tokens consumed (prompt + completion). */
  tokenCount: number;
  /** Model name used for display in footer. */
  modelName: string;
  /** Provider identifier. */
  provider: string;
}

/**
 * Generates the final Slack answer from assembled context (Step 5 of the pipeline).
 *
 * Uses Vercel AI SDK's generateText() for non-streaming completion.
 * Non-streaming is required for Slack's response_action: 'update' pattern.
 *
 * @param query - Original user query.
 * @param context - Assembled and ranked context from search results.
 * @param workspaceId - Workspace UUID for provider resolution.
 * @returns Generated answer with metadata.
 */
export async function generateAnswer(
  query: string,
  context: AssembledContext,
  workspaceId: string,
): Promise<GeneratedAnswer> {
  const startTime = Date.now();

  try {
    const { languageModel, modelName, provider } =
      await resolveActiveProvider(workspaceId);

    const prompt = buildAnswerPrompt(
      query,
      context.formattedContext,
      context.resultCount > 0,
    );

    const result = await generateText({
      model: languageModel,
      system: SYSTEM_PROMPT,
      prompt,
      maxTokens: 2048,
      temperature: 0.1, // Low temperature for factual, consistent answers
    });

    const latencyMs = Date.now() - startTime;

    logger.debug(
      {
        resultCount: context.resultCount,
        tokenCount: result.usage.totalTokens,
        latencyMs,
        provider,
        modelName,
      },
      "Answer generation completed",
    );

    return {
      answerText: result.text,
      tokenCount: result.usage.totalTokens,
      modelName,
      provider,
    };
  } catch (error) {
    if (error instanceof CompletionError) throw error;
    throw new CompletionError(
      `Answer generation failed: ${error instanceof Error ? error.message : String(error)}`,
      "unknown",
      error,
    );
  }
}
