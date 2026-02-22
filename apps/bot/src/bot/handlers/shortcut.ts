import type { MessageShortcut } from "@slack/bolt";
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
 * Handles the "Ask OpenEllie about this" message shortcut.
 *
 * When a user right-clicks a message and selects this shortcut,
 * the message text is used as the query context.
 *
 * @param shortcut - Message shortcut payload.
 * @param ack - Acknowledgment function (must be called within 3s).
 * @param client - Slack WebClient.
 */
export async function handleMessageShortcut({
  shortcut,
  ack,
  client,
}: {
  shortcut: MessageShortcut;
  ack: () => Promise<void>;
  client: WebClient;
}): Promise<void> {
  // Must ack within 3 seconds
  await ack();

  const messageText =
    shortcut.message.text ?? "";

  if (!messageText.trim()) {
    await client.views.open({
      trigger_id: shortcut.trigger_id,
      view: {
        type: "modal",
        title: { type: "plain_text", text: "OpenEllie" },
        close: { type: "plain_text", text: "Close" },
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: ":warning: The selected message has no text to analyze.",
            },
          },
        ],
      },
    });
    return;
  }

  // Use the message text as the query
  const rawQuery = `Analyze this message and provide relevant engineering context: ${messageText}`;
  const channelId = shortcut.channel?.id ?? "";
  const userId = shortcut.user.id;

  const requestId = generateRequestId();

  await withRequestContext(
    {
      requestId,
      slackUserId: userId,
      slackChannelId: channelId,
    },
    async () => {
      logger.info(
        { messageLength: messageText.length, userId },
        "Processing message shortcut",
      );

      // Post loading message in the channel
      const loadingResult = await client.chat.postMessage({
        channel: channelId,
        blocks: buildLoadingBlocks(messageText.slice(0, 100) + "..."),
        text: "Searching your engineering data...",
      });

      const startTime = Date.now();

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
            slackUserId: userId,
            slackChannelId: channelId,
          }),
          new Promise<never>((_, reject) =>
            setTimeout(
              () =>
                reject(
                  new AppError(
                    "Query timed out",
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

        await client.chat.update({
          channel: channelId,
          ts: loadingResult.ts!,
          blocks: buildAnswerBlocks({
            query: messageText.slice(0, 100) + "...",
            answerText: pipelineResult.answerText,
            sources: pipelineResult.sources,
            latencyMs,
            modelName: pipelineResult.modelName,
            queryLogId: pipelineResult.queryLogId,
            truncated: needsTruncation,
          }),
          text: pipelineResult.answerText.slice(0, 200),
        });

        if (needsTruncation) {
          await client.chat.postMessage({
            channel: channelId,
            blocks: buildOverflowBlocks(
              pipelineResult.answerText.slice(SLACK_LIMITS.TEXT_TRUNCATION_CHARS),
            ),
            text: "Continued...",
          });
        }

        logger.info(
          { queryLogId: pipelineResult.queryLogId, latencyMs },
          "Message shortcut query completed",
        );
      } catch (error) {
        const latencyMs = Date.now() - startTime;
        const appError = toAppError(error, ErrorCode.AI_PROVIDER_ERROR);

        logger.error({ err: appError, latencyMs }, "Message shortcut query failed");

        await client.chat.update({
          channel: channelId,
          ts: loadingResult.ts!,
          blocks: buildErrorBlocks(appError),
          text: "OpenEllie encountered an error",
        });
      }
    },
  );
}
