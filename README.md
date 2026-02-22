# OpenEllie

**Open-source, self-hosted Slack Engineering Intelligence Bot**

OpenEllie connects to your engineering tools (GitHub, Jira, Linear, Sentry) and answers natural-language questions from Slack — no SaaS, no data leaving your infrastructure.

```
@openellie show open PRs from @alice this week
@openellie what changed in the payments service last sprint?
@openellie are there any Sentry errors related to the auth refactor?
```

---

## Features

- **Natural language queries** — Intent classification + hybrid search (vector + full-text + structured)
- **GitHub connector** — PRs, commits, reviews, releases synced and searchable
- **AI provider flexibility** — OpenAI, Anthropic (Claude), Groq, or Ollama (local)
- **Self-hosted** — Your code, your data, your infrastructure
- **Privacy-first** — All credentials encrypted at rest (AES-256-GCM)
- **Phase 2 roadmap** — Jira, Linear, Sentry connectors (schemas already defined)

---

## Architecture

```
Slack (Socket Mode)
  └── @slack/bolt v4
        └── Query Pipeline
              ├── Step 1+2: LLM Intent + Query Plan (Vercel AI SDK + Zod)
              ├── Step 3:   Hybrid Search (pgvector + tsvector + RRF fusion)
              ├── Step 4:   Context Assembly (js-tiktoken, 8k token budget)
              └── Step 5:   Answer Generation (LLM → Slack mrkdwn)

BullMQ Workers
  ├── sync.worker   → GitHub connector → Drizzle (PostgreSQL + pgvector)
  ├── embed.worker  → Vercel AI SDK embedMany() → vector(1536) columns
  └── cleanup.worker → Data retention enforcement

Infrastructure: PostgreSQL 17 + pgvector · Redis 7.4 · Hono HTTP server
```

---

## Requirements

- Node.js 22+
- pnpm 9+
- Docker + Docker Compose (for Postgres + Redis)
- A Slack app with Socket Mode enabled
- An AI provider API key (OpenAI, Anthropic, Groq, or Ollama)
- A GitHub Personal Access Token

---

## Quick Start

### 1. Clone and install

```bash
git clone https://github.com/your-org/openellie.git
cd openellie
pnpm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Edit .env with your credentials (see Configuration below)
```

### 3. Start infrastructure

```bash
docker compose up -d postgres redis
```

### 4. Run database migrations

```bash
pnpm --filter @openellie/db db:migrate
```

### 5. Start the bot

```bash
pnpm --filter @openellie/bot dev
```

You should see:

```
INFO  OpenEllie bot starting up
INFO  Running database migrations
INFO  Database connection pool initialized
INFO  Workspace record created { workspaceId: "..." }
INFO  GitHub connection created from env vars { repoCount: 2 }
INFO  Hono HTTP server started { port: 3001 }
INFO  Bolt Socket Mode connected
INFO  BullMQ workers started
INFO  Scheduled jobs registered
INFO  OpenEllie bot ready
```

---

## Slack App Setup

1. Go to [api.slack.com/apps](https://api.slack.com/apps) → **Create New App** → **From Scratch**
2. Under **Socket Mode** → Enable Socket Mode → Generate an **App-Level Token** (scope: `connections:write`) → copy to `SLACK_APP_TOKEN`
3. Under **OAuth & Permissions** → **Bot Token Scopes**: add `app_mentions:read`, `chat:write`, `channels:history`, `commands`
4. Under **Event Subscriptions** → **Subscribe to Bot Events**: add `app_mention`
5. Under **Slash Commands** → Create `/ellie` command
6. Under **Interactivity** → Enable (required for message shortcuts + feedback buttons)
7. Under **App Shortcuts** → Create a Message shortcut named "Ask OpenEllie about this" with callback ID `ask_openellie`
8. **Install to Workspace** → copy `SLACK_BOT_TOKEN`
9. Copy your **Signing Secret** → `SLACK_SIGNING_SECRET`
10. Find your **Team ID** (workspace URL path or admin panel) → `SLACK_TEAM_ID`

---

## Configuration

All configuration is via environment variables. Full list in [`.env.example`](.env.example).

### Required

| Variable                | Description                                                     |
| ----------------------- | --------------------------------------------------------------- |
| `SLACK_BOT_TOKEN`       | Bot OAuth token (`xoxb-...`)                                    |
| `SLACK_SIGNING_SECRET`  | Slack signing secret for request verification                   |
| `SLACK_APP_TOKEN`       | App-level token for Socket Mode (`xapp-...`)                    |
| `SLACK_TEAM_ID`         | Your Slack workspace ID (`T...`)                                |
| `DATABASE_URL`          | PostgreSQL connection string                                    |
| `REDIS_URL`             | Redis connection string                                         |
| `ENCRYPTION_MASTER_KEY` | 64-character hex string (32 bytes) — run `openssl rand -hex 32` |
| `AI_PROVIDER`           | `openai` \| `anthropic` \| `groq` \| `ollama`                   |
| `OPENAI_API_KEY`        | Required if `AI_PROVIDER=openai`                                |
| `ANTHROPIC_API_KEY`     | Required if `AI_PROVIDER=anthropic`                             |
| `GROQ_API_KEY`          | Required if `AI_PROVIDER=groq`                                  |

### GitHub Sync

| Variable       | Description                                                            |
| -------------- | ---------------------------------------------------------------------- |
| `GITHUB_PAT`   | GitHub Personal Access Token (scopes: `repo`, `read:user`, `read:org`) |
| `GITHUB_REPOS` | Comma-separated repos to sync: `org/repo1,org/repo2`                   |

### Optional

| Variable               | Default                  | Description                       |
| ---------------------- | ------------------------ | --------------------------------- |
| `BOT_PORT`             | `3000`                   | Internal Hono HTTP server port    |
| `LOG_LEVEL`            | `info`                   | Pino log level                    |
| `SYNC_FREQUENCY_HOURS` | `4`                      | How often to sync connected tools |
| `DATA_RETENTION_DAYS`  | `90`                     | Days to keep historical data      |
| `EMBEDDING_MODEL`      | `text-embedding-3-small` | Must produce 1536-dim vectors     |

---

## Docker Compose (Production)

```bash
# Build and launch everything
docker compose -f docker-compose.yml up -d

# Or with the bot built from source:
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

The bot image is at `docker/bot.Dockerfile`.

---

## Development

```bash
# Start all packages in watch mode
pnpm dev

# Type check all packages
pnpm typecheck

# Lint all packages
pnpm lint

# Run tests
pnpm test

# Generate DB schema (after editing packages/db/src/schema/)
pnpm --filter @openellie/db db:generate

# Apply migrations
pnpm --filter @openellie/db db:migrate
```

---

## Project Structure

```
openellie/
├── apps/
│   └── bot/              # Slack bot (this is Phase 1)
│       └── src/
│           ├── ai/       # Vercel AI SDK provider, embeddings, prompts
│           ├── bot/      # Slack Bolt handlers, Block Kit builders, middleware
│           ├── connectors/  # GitHub connector + stubs for Jira/Linear/Sentry
│           ├── jobs/     # BullMQ queues, workers, scheduler
│           ├── lib/      # Shared utilities (db, redis, crypto, logger, errors)
│           ├── pipeline/ # 6-step NL query pipeline
│           └── search/   # Hybrid search (vector + keyword + RRF fusion)
├── packages/
│   ├── db/               # Drizzle ORM schema, migrations, typed queries
│   ├── shared/           # Shared types, utils (retry, token-bucket), constants
│   └── tsconfig/         # Shared TypeScript configs
└── docker/
    └── bot.Dockerfile
```

---

## Roadmap

- **Phase 1** (current): GitHub connector, query pipeline, Slack bot
- **Phase 2**: Jira + Linear + Sentry connectors
- **Phase 3**: Next.js config dashboard (connections, API keys, query history)
- **Phase 4**: PostHog analytics, production Docker multi-stage, CI/CD hardening

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## Security

See [SECURITY.md](SECURITY.md) for reporting vulnerabilities.

## License

MIT — see [LICENSE](LICENSE).
