/**
 * Prompt for the answer generation phase (Step 5 of the pipeline).
 *
 * Takes the original query and assembled context, produces a Slack-formatted answer.
 */
export function buildAnswerPrompt(
  query: string,
  contextBlocks: string,
  hasData: boolean,
): string {
  if (!hasData) {
    return `The user asked: "${query}"

No relevant data was found in the indexed engineering data.

Respond with a helpful message explaining:
1. What you searched for
2. Why data might be missing (e.g., GitHub connector might not be synced, or the specific data doesn't exist)
3. A concrete suggestion (e.g., "Try syncing GitHub from the dashboard" or "Check if the repository is configured in OpenEllie's connections")

Keep it brief and actionable. Use Slack mrkdwn formatting.`;
  }

  return `You are OpenEllie, an engineering intelligence Slack bot. Answer the user's query based on the provided data.

User Query: "${query}"

## Retrieved Data
${contextBlocks}

## Instructions
1. Answer the query directly and completely based on the data above
2. Cite specific items (e.g., "PR #234 in github/api-service", "PROJ-123")
3. Format your response using Slack mrkdwn:
   - *bold* for emphasis
   - \`code\` for IDs, SHAs, branch names
   - Bullet lists for multiple items
   - Include links as <url|text> when URLs are available
4. Be specific about counts, dates, and owners
5. If the data shows a partial picture, acknowledge it
6. Limit response to what's clearly supported by the data — no speculation
7. Keep the response concise but complete

Respond now with the Slack-formatted answer:`;
}
