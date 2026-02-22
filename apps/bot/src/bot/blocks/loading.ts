import type { Block, KnownBlock } from "@slack/types";

/**
 * Builds a loading state Block Kit response.
 * Used immediately upon receiving a Slack query to acknowledge quickly.
 *
 * @param queryText - The user's raw query, displayed while processing.
 * @returns Array of Slack blocks showing a loading indicator.
 */
export function buildLoadingBlocks(queryText: string): (Block | KnownBlock)[] {
  const truncatedQuery =
    queryText.length > 100 ? queryText.slice(0, 97) + "..." : queryText;

  return [
    {
      type: "section",
      text: {
        type: "mrkdwn",
        text: `:mag: *Searching your engineering data...*\n> ${truncatedQuery}`,
      },
    },
    {
      type: "context",
      elements: [
        {
          type: "mrkdwn",
          text: "This usually takes 5–15 seconds.",
        },
      ],
    },
  ];
}
