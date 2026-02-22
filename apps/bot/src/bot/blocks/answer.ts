import type { Block, KnownBlock } from "@slack/types";
import { SLACK_LIMITS } from "@openellie/shared/constants";

/**
 * Represents a source item cited in a response.
 */
export interface SourceItem {
  label: string;
  url?: string;
  detail?: string;
}

/**
 * Options for building the answer blocks.
 */
export interface AnswerBlockOptions {
  /** The original query, shown as header. */
  query: string;
  /** The full answer text (Slack mrkdwn formatted). */
  answerText: string;
  /** Data sources used in generating the answer. */
  sources: SourceItem[];
  /** Latency in milliseconds. */
  latencyMs: number;
  /** AI model used. */
  modelName: string;
  /** Query log ID for feedback buttons. */
  queryLogId: string;
  /** Whether the answer was truncated (remainder in thread). */
  truncated?: boolean;
}

/**
 * Builds the main answer Block Kit response.
 *
 * Truncates answer text at 2800 chars if needed.
 * Includes sources, feedback buttons, and attribution footer.
 *
 * @param options - Answer display options.
 * @returns Array of Slack blocks for the main message.
 */
export function buildAnswerBlocks(
  options: AnswerBlockOptions,
): (Block | KnownBlock)[] {
  const {
    query,
    answerText,
    sources,
    latencyMs,
    modelName,
    queryLogId,
    truncated = false,
  } = options;

  // Truncate answer if needed
  let displayText = answerText;
  let isTruncated = truncated;

  if (answerText.length > SLACK_LIMITS.TEXT_TRUNCATION_CHARS) {
    displayText =
      answerText.slice(0, SLACK_LIMITS.TEXT_TRUNCATION_CHARS) +
      "\n\n_... continued in thread_";
    isTruncated = true;
  }

  // Format query header (truncate at 150 chars)
  const displayQuery =
    query.length > 150 ? query.slice(0, 147) + "..." : query;

  const blocks: (Block | KnownBlock)[] = [
    // Header: reformatted query
    {
      type: "header",
      text: {
        type: "plain_text",
        text: displayQuery,
        emoji: true,
      },
    },
    // Main answer
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: displayText,
      },
    },
  ];

  // Sources section (if any)
  if (sources.length > 0) {
    blocks.push({ type: "divider" });

    const sourceLines = sources
      .slice(0, 5) // Show max 5 sources
      .map((s) => {
        const link = s.url ? `<${s.url}|${s.label}>` : `*${s.label}*`;
        return s.detail ? `• ${link} — ${s.detail}` : `• ${link}`;
      })
      .join("\n");

    blocks.push({
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Sources*\n${sourceLines}`,
      },
    });
  }

  // Feedback buttons
  blocks.push({ type: "divider" });
  blocks.push({
    type: "actions",
    block_id: `feedback_${queryLogId}`,
    elements: [
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "👍 Helpful",
          emoji: true,
        },
        style: "primary",
        action_id: "feedback_helpful",
        value: queryLogId,
      },
      {
        type: "button",
        text: {
          type: "plain_text",
          text: "👎 Not helpful",
          emoji: true,
        },
        action_id: "feedback_not_helpful",
        value: queryLogId,
      },
    ],
  });

  // Footer
  const latencyDisplay =
    latencyMs < 1000 ? `${latencyMs}ms` : `${(latencyMs / 1000).toFixed(1)}s`;
  const truncatedNote = isTruncated ? " • Response truncated" : "";

  blocks.push({
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text:
          `:robot_face: ${latencyDisplay} • ${modelName}${truncatedNote} • ` +
          `Powered by <https://github.com/openellie/openellie|OpenEllie>`,
      },
    ],
  });

  return blocks;
}

/**
 * Builds the overflow text block posted as a thread reply
 * when answer text exceeds the Slack character limit.
 *
 * @param overflowText - The text that didn't fit in the main message.
 * @returns Array of Slack blocks for the thread reply.
 */
export function buildOverflowBlocks(
  overflowText: string,
): (Block | KnownBlock)[] {
  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `*Continued...*\n\n${overflowText}`,
      },
    },
  ];
}
