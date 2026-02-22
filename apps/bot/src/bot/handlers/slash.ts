import type { SlashCommand, RespondFn } from "@slack/bolt";
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
 * Handles /ellie [query] slash commands.
 *
 * Slash commands have a 3-second ack deadline, so we:
 * 1. Immediately ack with a loading response (response_action: 'update' won't work here)
 * 2. Send loading as an ephemeral or channel message
 * 3. Use respond() to replace with the actual answer
 *
 * @param command - Slash command payload.
 * @param ack - Acknowledgment function (must be called within 3s).
 * @param respond - Respond function for sending/updating messages.
 * @param client - Slack WebClient.
 */
export async function handleSlashCommand({
  command,
  ack,
  respond,
  client,
}: {
  command: SlashCommand;
  ack: (...args: unknown[]) => Promise<void>;
  respond: RespondFn;
  client: WebClient;
}): Promise<void> {
  const rawQuery = command.text.trim();

  if (!rawQuery) {
    await ack({
      response_type: "ephemeral",
      text: "Usage: `/ellie [your question]`\nExample: `/ellie show open PRs from @john`",
    });
    return;
  }

  // Ack immediately with loading state to meet the 3s deadline
  await ack({
    response_type: "in_channel",
    blocks: buildLoadingBlocks(rawQuery),
    text: "Searching your engineering data...",
  });

  const requestId = generateRequestId();

  await withRequestContext(
    {
      requestId,
      slackUserId: command.user_id,
      slackChannelId: command.channel_id,
    },
    async () => {
      const startTime = Date.now();

      logger.info(
        { query: rawQuery, userId: command.user_id },
        "Processing slash command query",
      );

      try {
        const workspace = await getWorkspace();
        if (!workspace) {
          throw new AppError(
            "Workspace not initialized",
            ErrorCode.DB_QUERY_FAILED,
          );
        }

        const pipelineResult = await Promise.race([
          runQueryPipeline({
            query: rawQuery,
            workspaceId: workspace.id,
            slackUserId: command.user_id,
            slackChannelId: command.channel_id,
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

        const needsTruncation =
          pipelineResult.answerText.length > SLACK_LIMITS.TEXT_TRUNCATION_CHARS;

        await respond({
          response_type: "in_channel",
          replace_original: true,
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

        // Post overflow in thread if needed — use client since respond() doesn't support thread
        if (needsTruncation && command.channel_id) {
          const overflowText = pipelineResult.answerText.slice(
            SLACK_LIMITS.TEXT_TRUNCATION_CHARS,
          );
          // We don't have a message ts from respond(), so post as a separate message
          await client.chat.postMessage({
            channel: command.channel_id,
            blocks: buildOverflowBlocks(overflowText),
            text: "Continued...",
          });
        }

        logger.info(
          { queryLogId: pipelineResult.queryLogId, latencyMs },
          "Slash command query completed",
        );
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const appError = toAppError(error, ErrorCode.AI_PROVIDER_ERROR);

        logger.error({ err: appError, latencyMs }, "Slash command query failed");

        await respond({
          response_type: "ephemeral",
          replace_original: true,
          blocks: buildErrorBlocks(appError),
          text: "OpenEllie encountered an error",
        });
      }
    },
  );
}
