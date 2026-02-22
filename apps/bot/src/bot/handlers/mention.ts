import type { SayFn } from "@slack/bolt";
import type { WebClient } from "@slack/web-api";
import { buildLoadingBlocks } from "../blocks/loading.js";
import { buildAnswerBlocks, buildOverflowBlocks } from "../blocks/answer.js";
import { buildErrorBlocks } from "../blocks/error.js";
import { runQueryPipeline } from "../../pipeline/index.js";
import { getWorkspace } from "../../lib/db/queries/workspaces.js";
import { logger, withRequestContext, generateRequestId } from "../../lib/logger.js";
import { AppError, toAppError, ErrorCode } from "../../lib/errors.js";
import { SLACK_LIMITS, QUERY_PIPELINE } from "@openellie/shared/constants";

/**
 * Handles @OpenEllie mentions in Slack channels.
 *
 * Flow:
 * 1. Immediately post a loading message
 * 2. Run the query pipeline (async)
 * 3. Update the loading message with the answer (or error)
 * 4. If answer is too long, post overflow in thread
 *
 * @param event - Slack app_mention event.
 * @param say - Bolt say function for posting messages.
 * @param client - Slack WebClient for updating messages.
 */
export async function handleMention({
  event,
  say,
  client,
}: {
  event: { text: string; user: string; channel: string; ts: string; thread_ts?: string };
  say: SayFn;
  client: WebClient;
}): Promise<void> {
  const requestId = generateRequestId();

  await withRequestContext(
    {
      requestId,
      slackUserId: event.user,
      slackChannelId: event.channel,
    },
    async () => {
      // Strip bot mention from query text: "<@BOTID> query text" → "query text"
      const rawQuery = event.text.replace(/<@[A-Z0-9]+>\s*/g, "").trim();

      if (!rawQuery) {
        await say({
          text: "Hi! Mention me with a question, like: `@OpenEllie show open PRs from @john`",
          thread_ts: event.ts,
        });
        return;
      }

      logger.info({ query: rawQuery, userId: event.user }, "Processing mention query");

      // Step 1: Post loading message immediately
      const loadingResult = await client.chat.postMessage({
        channel: event.channel,
        thread_ts: event.thread_ts ?? event.ts,
        blocks: buildLoadingBlocks(rawQuery),
        text: "Searching your engineering data...",
      });

      const loadingTs = loadingResult.ts;
      const startTime = Date.now();

      try {
        const workspace = await getWorkspace();
        if (!workspace) {
          throw new AppError(
            "Workspace not initialized",
            ErrorCode.DB_QUERY_FAILED,
          );
        }

        // Run query pipeline with timeout
        const pipelineResult = await Promise.race([
          runQueryPipeline({
            query: rawQuery,
            workspaceId: workspace.id,
            slackUserId: event.user ?? "unknown",
            slackChannelId: event.channel,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new AppError(
                    "Query timed out after 30 seconds",
                    ErrorCode.QUERY_TIMEOUT,
                    408,
                  ),
                ),
              QUERY_PIPELINE.SLACK_TIMEOUT_MS,
            ),
          ),
        ]);

        const latencyMs = Date.now() - startTime;

        // Determine if answer needs to be split
        const needsTruncation =
          pipelineResult.answerText.length > SLACK_LIMITS.TEXT_TRUNCATION_CHARS;
        const overflowText = needsTruncation
          ? pipelineResult.answerText.slice(SLACK_LIMITS.TEXT_TRUNCATION_CHARS)
          : null;

        // Update loading message with answer
        await client.chat.update({
          channel: event.channel,
          ts: loadingTs!,
          blocks: buildAnswerBlocks({
            query: rawQuery,
            answerText: pipelineResult.answerText,
            sources: pipelineResult.sources,
            latencyMs,
            modelName: pipelineResult.modelName,
            queryLogId: pipelineResult.queryLogId,
            truncated: needsTruncation,
          }),
          text: pipelineResult.answerText.slice(0, 200),
        });

        // Post overflow in thread if needed
        if (overflowText) {
          await client.chat.postMessage({
            channel: event.channel,
            thread_ts: event.thread_ts ?? event.ts,
            blocks: buildOverflowBlocks(overflowText),
            text: "Continued...",
          });
        }

        logger.info(
          { queryLogId: pipelineResult.queryLogId, latencyMs },
          "Mention query completed",
        );
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const appError = toAppError(error, ErrorCode.AI_PROVIDER_ERROR);

        logger.error(
          { err: appError, latencyMs },
          "Mention query failed",
        );

        // Update loading message with error
        await client.chat.update({
          channel: event.channel,
          ts: loadingTs!,
          blocks: buildErrorBlocks(appError),
          text: "OpenEllie encountered an error",
        });
      }
    },
  );
}
