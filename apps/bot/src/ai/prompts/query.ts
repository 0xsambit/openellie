/**
 * Prompt for the query planning phase (Steps 1+2 of the pipeline).
 *
 * This prompt asks the LLM to:
 * 1. Classify the intent of the query
 * 2. Extract entities, time ranges, and filters
 * 3. Generate a structured query plan
 */
export function buildQueryPlanningPrompt(query: string, currentTime: string): string {
  return `You are analyzing a Slack query to an engineering intelligence bot. Extract structured query information.

Current time: ${currentTime}

Query: "${query}"

Analyze this query and respond with a JSON object matching this exact structure:
{
  "intents": ["PR_QUERY" | "COMMIT_QUERY" | "TICKET_QUERY" | "ERROR_QUERY" | "ANALYTICS_QUERY" | "CROSS_SOURCE_QUERY"],
  "confidence": 0.0-1.0,
  "entities": {
    "users": ["github_login_or_name"],
    "repos": ["owner/repo"],
    "projects": ["project_name"],
    "labels": ["label"],
    "sprints": ["sprint_name"],
    "branches": ["branch_name"]
  },
  "timeRange": {
    "since": "ISO 8601 timestamp or null",
    "until": "ISO 8601 timestamp or null",
    "description": "human description like 'last 3 days' or null"
  },
  "filters": {
    "state": "open|closed|merged|null",
    "priority": "urgent|high|medium|low|null",
    "type": "bug|story|task|epic|null",
    "level": "fatal|error|warning|null"
  },
  "queryPlans": [
    {
      "source": "github_prs|github_commits|github_releases|tickets|sentry_issues",
      "searchText": "text to use for semantic/keyword search",
      "structuredFilters": {
        "field": "value"
      },
      "limit": 20,
      "sortBy": "updated_at|created_at|last_seen|relevance",
      "sortOrder": "desc|asc"
    }
  ]
}

## Time Parsing Rules
- "today" = ${currentTime.split('T')[0]}
- "yesterday" = one day before today
- "this week" = last 7 days
- "this sprint" / "current sprint" = last 14 days (assume 2-week sprints)
- "last N days/weeks" = exact computation from current time
- Specific dates: parse as-is with timezone from current time

## Intent Classification
- PR_QUERY: questions about pull requests, reviews, code reviews, merges
- COMMIT_QUERY: questions about commits, changes, code history
- TICKET_QUERY: questions about Jira/Linear tickets, sprints, backlogs, velocity
- ERROR_QUERY: questions about Sentry errors, crashes, bugs
- ANALYTICS_QUERY: questions about metrics, trends, PostHog data
- CROSS_SOURCE_QUERY: questions correlating across multiple sources

Multiple intents are allowed when the query spans multiple data types.

## Entity Extraction
- Extract actual names/identifiers, not pronouns or references
- GitHub users appear as @mentions or plain names — extract the login
- Repo names appear as "owner/repo" or just "repo" — include owner if mentioned

Respond ONLY with the JSON object. No explanation.`;
}
