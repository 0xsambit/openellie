import type { Block, KnownBlock } from "@slack/types";
import { AppError, ErrorCode } from "../../lib/errors.js";

/**
 * Maps error codes to user-friendly Slack messages with actionable guidance.
 */
function getErrorMessage(error: AppError): {
  title: string;
  body: string;
  emoji: string;
} {
  switch (error.code) {
    case ErrorCode.AI_PROVIDER_NOT_CONFIGURED:
      return {
        emoji: ":key:",
        title: "AI provider not configured",
        body:
          "OpenEllie needs an AI provider key to answer questions.\n" +
          "Configure one in the dashboard under *API Keys*.",
      };

    case ErrorCode.CONNECTOR_NOT_FOUND:
      return {
        emoji: ":electric_plug:",
        title: "No data sources connected",
        body:
          "OpenEllie hasn't been connected to any engineering tools yet.\n" +
          "Add connections in the dashboard under *Connections*.",
      };

    case ErrorCode.CONNECTOR_NOT_IMPLEMENTED:
      return {
        emoji: ":construction:",
        title: "Connector not yet available",
        body: error.message,
      };

    case ErrorCode.QUERY_RATE_LIMITED:
      return {
        emoji: ":stopwatch:",
        title: "Rate limit reached",
        body: error.message,
      };

    case ErrorCode.QUERY_TIMEOUT:
      return {
        emoji: ":hourglass:",
        title: "Query timed out",
        body:
          "The search took too long to complete. Try a more specific question, " +
          "or check if your data sources are syncing properly.",
      };

    default:
      return {
        emoji: ":warning:",
        title: "Something went wrong",
        body:
          "OpenEllie encountered an unexpected error. " +
          "If this keeps happening, check the logs or open an issue on GitHub.",
      };
  }
}

/**
 * Builds an error Block Kit response for Slack.
 *
 * @param error - The error to display.
 * @param queryId - Optional query log ID for support reference.
 * @returns Array of Slack blocks showing the error.
 */
export function buildErrorBlocks(
  error: AppError,
  queryId?: string,
): (Block | KnownBlock)[] {
  const { title, body, emoji } = getErrorMessage(error);

  const blocks: (Block | KnownBlock)[] = [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `${emoji} *${title}*\n${body}`,
      },
    },
  ];

  if (queryId) {
    blocks.push({
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: `Reference: \`${queryId}\` | Powered by <https://github.com/openellie/openellie|OpenEllie>`,
        },
      ],
    });
  }

  return blocks;
}

/**
 * Builds a generic error block for non-AppError situations.
 *
 * @param message - Human-readable error message.
 */
export function buildGenericErrorBlocks(
  message: string,
): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:warning: *Error*\n${message}`,
      },
    },
  ];
}
