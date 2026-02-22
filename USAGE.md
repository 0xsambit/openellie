# OpenEllie Usage Guide

This guide covers day-to-day usage of OpenEllie in Slack, including query examples, syncing behavior, and troubleshooting.

For setup and installation, see [README.md](README.md).

---

## Interacting with OpenEllie

OpenEllie responds to three interaction modes in Slack:

### 1. @mention in channels

Mention the bot in any channel it's been invited to:

```
@OpenEllie show open PRs in the api-service repo
@OpenEllie what commits landed yesterday?
@OpenEllie who has the most open PRs this week?
```

The bot will:

1. Post a loading message immediately
2. Run the query pipeline (intent classification → search → answer generation)
3. Replace the loading message with the answer, including source citations
4. If the answer is long, post the remainder in a thread reply

### 2. /ellie slash command

Use the `/ellie` slash command from any channel:

```
/ellie show merged PRs from @alice this week
/ellie list recent releases for the frontend repo
/ellie what changed in the payments service since Monday?
```

The slash command posts the answer publicly in the channel.

### 3. Message shortcut (right-click)

Right-click any message in Slack and select **"Ask OpenEllie about this"** from the shortcut menu. OpenEllie will use the message text as context to query your engineering data.

This is useful for quickly getting context about error messages, deployment notifications, or team discussions.

---

## Query Examples by Category

### Pull Requests

```
@OpenEllie show open PRs in myorg/api-service
@OpenEllie list merged PRs from last week
@OpenEllie find PRs with the "bug" label
@OpenEllie who has PRs waiting for review?
@OpenEllie show draft PRs in the frontend repo
```

### Commits

```
@OpenEllie what commits landed in api-service yesterday?
@OpenEllie show recent commits by @john
@OpenEllie what changed in the payments service this week?
```

### Releases / Deployments

```
@OpenEllie list recent releases for myorg/api-service
@OpenEllie when was the last deployment of the frontend?
@OpenEllie show releases from this month
```

### Cross-Source Queries

```
@OpenEllie what PRs and commits are related to the auth refactor?
@OpenEllie summarize engineering activity this sprint
@OpenEllie what happened in the backend repos last week?
```

### Tickets (Phase 2 — Jira/Linear)

These queries will work once the Jira or Linear connector is enabled:

```
@OpenEllie show open tickets assigned to me
@OpenEllie what are the blockers in the current sprint?
@OpenEllie list high-priority tickets for the platform team
```

### Sentry Errors (Phase 2)

These queries will work once the Sentry connector is enabled:

```
@OpenEllie are there any new Sentry errors in the payments service?
@OpenEllie show critical errors from the last 24 hours
```

---

## How Answers Work

### Answer Format

Answers include:

- A direct response to your question formatted in Slack mrkdwn
- Source citations linking to specific PRs, commits, or releases
- A feedback footer with thumbs up/down buttons

### Feedback Buttons

Every answer includes **helpful** and **not helpful** buttons. Clicking these records feedback in the database, which helps track answer quality over time. No personal data is stored with feedback — only the query log ID and the vote.

### Long Answers

Slack has message size limits. If an answer exceeds the limit:

- The main message is truncated at a safe boundary
- The remaining content is posted as a thread reply labeled "Continued..."

---

## Data Syncing

### Automatic Sync

Once configured, OpenEllie automatically syncs data from connected sources on a schedule:

- **Default frequency**: Every 4 hours (configurable via `SYNC_FREQUENCY_HOURS`)
- **First sync**: Triggered automatically on bot startup
- **Incremental sync**: After the initial full sync, only new/updated items are fetched

### What Gets Synced (GitHub)

| Data Type     | Details                                                      |
| ------------- | ------------------------------------------------------------ |
| Pull Requests | Title, body, state, author, reviewers, labels, branch, stats |
| Commits       | Message, author, SHA, additions/deletions, timestamp         |
| Reviews       | Reviewer, state (approved/changes_requested), body           |
| Releases      | Tag, name, body, published date, prerelease flag             |

### Sync Status

The bot logs sync progress. In development mode with `LOG_LEVEL=debug`, you'll see:

```
INFO  Sync job started { connectorType: "github", repos: ["myorg/api-service"] }
INFO  Synced pull requests { repoName: "myorg/api-service", count: 47 }
INFO  Synced commits { repoName: "myorg/api-service", count: 312 }
INFO  Sync job completed { itemsSynced: 359, durationMs: 12543 }
```

### Embeddings

After syncing, the embed worker automatically generates vector embeddings for new items. This enables semantic search (e.g., "auth refactor" matches PRs about authentication even if they don't use that exact phrase).

- **Model**: `text-embedding-3-small` by default (1536 dimensions)
- **Batch size**: 100 items per batch
- **Concurrency**: 3 workers maximum

---

## Rate Limiting

OpenEllie enforces rate limits to prevent abuse and manage API costs:

| Limit             | Value        | Scope              |
| ----------------- | ------------ | ------------------ |
| Workspace queries | 100 per hour | Shared across team |
| Per-user queries  | 20 per hour  | Per Slack user     |
| GitHub API        | 5000/hour    | Per PAT            |

When rate limited, the bot responds with a friendly message indicating when the limit resets.

---

## Query Pipeline (How It Works)

When you ask OpenEllie a question, it runs a 6-step pipeline:

1. **Intent Classification** — An LLM determines what you're asking about (PRs, commits, tickets, etc.) and extracts entities (users, repos, time ranges)
2. **Query Decomposition** — The query is broken into one or more search plans targeting specific data sources
3. **Hybrid Search** — Each plan runs three search strategies in parallel:
   - **Structured query** — Direct database filters (state, author, repo)
   - **Full-text search** — PostgreSQL tsvector keyword matching
   - **Vector search** — pgvector cosine similarity on embeddings
4. **Context Assembly** — Results are deduplicated, ranked via RRF (Reciprocal Rank Fusion), and truncated to fit within the LLM's context window (8000 tokens)
5. **Answer Generation** — An LLM synthesizes the context into a Slack-formatted answer with citations
6. **Cache + Log** — The result is cached in Redis (5-minute TTL) and logged for analytics

---

## Caching

Identical queries within a 5-minute window return cached results without making additional LLM calls. The cache key is based on the workspace ID and the exact query text.

---

## Environment Variable Reference

See the fully documented [`.env.example`](.env.example) for all available settings.

Key settings for bot behavior:

| Variable               | Default                  | Description                                    |
| ---------------------- | ------------------------ | ---------------------------------------------- |
| `AI_PROVIDER`          | `openai`                 | LLM provider: openai, anthropic, groq, ollama  |
| `EMBEDDING_MODEL`      | `text-embedding-3-small` | Must produce 1536-dim vectors                  |
| `SYNC_FREQUENCY_HOURS` | `4`                      | Auto-sync interval (1, 4, 12, 24)              |
| `DATA_RETENTION_DAYS`  | `90`                     | How long to keep historical data               |
| `LOG_LEVEL`            | `info`                   | Log verbosity: trace, debug, info, warn, error |

---

## Troubleshooting

### Bot doesn't respond to mentions

1. Ensure the bot is invited to the channel (`/invite @OpenEllie`)
2. Check that `app_mention` is subscribed in your Slack app's Event Subscriptions
3. Verify Socket Mode is enabled and `SLACK_APP_TOKEN` is set
4. Check bot logs for errors: `pnpm --filter @openellie/bot dev`

### "Workspace not initialized" error

The bot auto-creates a workspace record on startup. If you see this error:

- Ensure `DATABASE_URL` is correct and Postgres is running
- Ensure migrations have been run: `pnpm --filter @openellie/db db:migrate`
- Check that `SLACK_TEAM_ID` is set in your `.env`

### No search results

If queries return empty results:

- Check that at least one sync has completed (look for sync logs)
- Verify `GITHUB_PAT` has the `repo` scope
- Verify `GITHUB_REPOS` lists the correct repos (format: `owner/repo`)
- Wait for the embed worker to finish generating embeddings

### Rate limit errors from GitHub

The bot respects GitHub's API rate limits (5000 requests/hour for PATs). If you see rate limit warnings:

- Reduce `GITHUB_REPOS` to fewer repositories
- Increase `SYNC_FREQUENCY_HOURS` to reduce API call frequency
- The bot will automatically pause and retry after the rate limit window resets

### AI provider errors

- Verify your API key is valid and has credits
- For Ollama: ensure the server is running at `OLLAMA_BASE_URL` and the model is pulled
- Check that the model specified in `OPENAI_MODEL` / `ANTHROPIC_MODEL` / `GROQ_MODEL` exists

### Encryption key issues

If you change `ENCRYPTION_MASTER_KEY` after initial setup, all stored encrypted credentials will become unreadable. You'll need to re-configure connections.

---

## Supported AI Providers

| Provider  | Chat Model Examples              | Embedding                |
| --------- | -------------------------------- | ------------------------ |
| OpenAI    | `gpt-4o`, `gpt-4o-mini`          | `text-embedding-3-small` |
| Anthropic | `claude-opus-4-5-20251101`       | Use Voyage API           |
| Groq      | `llama-3.3-70b-versatile`        | Uses OpenAI fallback     |
| Ollama    | `llama3.2`, `mistral`, `mixtral` | Uses OpenAI fallback     |

**Embedding constraint**: All embedding models must produce 1536-dimensional vectors. The database schema uses `vector(1536)` columns. Switching AI providers does not affect embeddings unless you also change `EMBEDDING_MODEL`, in which case existing embeddings must be regenerated (the bot handles this automatically).
