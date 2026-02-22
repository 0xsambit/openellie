# OpenEllie — Development Guide

Everything you need to run, test, and develop OpenEllie locally.

---

## Prerequisites

| Tool           | Version  | Install                                                      |
| -------------- | -------- | ------------------------------------------------------------ |
| Node.js        | >=22.0.0 | [nodejs.org](https://nodejs.org)                             |
| pnpm           | >=9.0.0  | `npm install -g pnpm@9`                                      |
| Docker Desktop | latest   | [docker.com](https://www.docker.com/products/docker-desktop) |

You also need:

- A **Slack workspace** where you have permission to install apps
- A **GitHub Personal Access Token** with `repo` and `read:org` scopes
- An **AI provider API key** (OpenAI, Anthropic, Groq, or a local Ollama instance)

---

## 1. Slack App Setup (one-time)

Create a new Slack app at **https://api.slack.com/apps** → "Create New App" → "From scratch".
Name it `OpenEllie` and select your workspace.

### Enable Socket Mode

**Settings → Socket Mode** → Enable Socket Mode → Generate an App-Level Token with the
`connections:write` scope → name it `openellie-socket` → copy the `xapp-...` token.

### Bot Token Scopes

**Features → OAuth & Permissions → Bot Token Scopes** → add:

| Scope               | Purpose                       |
| ------------------- | ----------------------------- |
| `app_mentions:read` | Receive `@OpenEllie` mentions |
| `chat:write`        | Post messages                 |
| `channels:history`  | Read channel messages         |
| `commands`          | Handle slash commands         |

### Subscribe to Events

**Features → Event Subscriptions** → Enable Events → Subscribe to bot events:

- `app_mention`

### Add Slash Command

**Features → Slash Commands** → Create New Command:

- Command: `/ellie`
- Request URL: `https://example.com` (not used — Socket Mode handles it)
- Description: `Ask OpenEllie a question`

### Add Message Shortcut

**Features → Interactivity & Shortcuts** → Create New Shortcut → "On messages":

- Name: `Ask OpenEllie about this`
- Callback ID: `ask_openellie`

### Install to Workspace

**Settings → Install App** → Install to Workspace → copy the `xoxb-...` Bot User OAuth Token.

### Collect Your Three Tokens

```
SLACK_BOT_TOKEN=xoxb-...          # OAuth & Permissions → Bot User OAuth Token
SLACK_APP_TOKEN=xapp-...          # Basic Information → App-Level Tokens
SLACK_SIGNING_SECRET=...          # Basic Information → App Credentials → Signing Secret
```

Find your Workspace ID (`T...`): Settings → Basic Information or from the workspace URL
(`https://app.slack.com/client/TXXXXXXXX/...`).

---

## 2. Clone and Install

```bash
git clone https://github.com/your-org/openellie.git
cd openellie
pnpm install
```

---

## 3. Environment Configuration

```bash
cp .env.example .env
```

Edit `.env` and fill in the following required variables:

| Variable                | Description                          | Where to find it                                                                   |
| ----------------------- | ------------------------------------ | ---------------------------------------------------------------------------------- |
| `SLACK_BOT_TOKEN`       | Bot OAuth token (`xoxb-...`)         | Slack App → OAuth & Permissions                                                    |
| `SLACK_SIGNING_SECRET`  | Request signing secret               | Slack App → Basic Information                                                      |
| `SLACK_APP_TOKEN`       | Socket Mode token (`xapp-...`)       | Slack App → Basic Information → App-Level Tokens                                   |
| `SLACK_TEAM_ID`         | Workspace ID (`T...`)                | Slack workspace URL                                                                |
| `DATABASE_URL`          | Postgres connection string           | Use default for local: `postgresql://openellie:openellie@localhost:5432/openellie` |
| `REDIS_URL`             | Redis connection string              | Use default for local: `redis://localhost:6379`                                    |
| `ENCRYPTION_MASTER_KEY` | 32-byte hex key for AES-256-GCM      | Generate: `openssl rand -hex 32`                                                   |
| `GITHUB_PAT`            | Personal Access Token (`ghp_...`)    | github.com/settings/tokens — scopes: `repo`, `read:org`                            |
| `GITHUB_REPOS`          | Repos to sync (comma-separated)      | e.g. `myorg/api,myorg/frontend`                                                    |
| `AI_PROVIDER`           | Active provider                      | `openai`, `anthropic`, `groq`, or `ollama`                                         |
| `OPENAI_API_KEY`        | OpenAI key (if `AI_PROVIDER=openai`) | platform.openai.com/api-keys                                                       |
| `BOT_API_SECRET`        | Internal API secret                  | Generate: `openssl rand -hex 32`                                                   |

**AI Provider keys** — only set the key for your chosen provider:

| Provider  | Key variable        | Model variable    | Default model              |
| --------- | ------------------- | ----------------- | -------------------------- |
| OpenAI    | `OPENAI_API_KEY`    | `OPENAI_MODEL`    | `gpt-4o`                   |
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` | `claude-opus-4-5-20251101` |
| Groq      | `GROQ_API_KEY`      | `GROQ_MODEL`      | `llama-3.3-70b-versatile`  |
| Ollama    | —                   | `OLLAMA_MODEL`    | `llama3.2`                 |

**Note:** The embedding model must produce **1536-dimensional** vectors. Leave
`EMBEDDING_MODEL=text-embedding-3-small` (default) unless you have a specific reason to change it.

---

## 4. Start Infrastructure

```bash
docker compose up -d postgres redis
```

Verify both containers are healthy before proceeding:

```bash
docker compose ps
```

Expected output:

```
NAME                STATUS
openellie-postgres  Up (healthy)
openellie-redis     Up (healthy)
```

Local connection details:

- **PostgreSQL**: `localhost:5432` — user: `openellie`, password: `openellie`, db: `openellie`
- **Redis**: `localhost:6379` — no password in development

---

## 5. Database Setup

Run migrations to create all 13 tables with indexes and pgvector extension:

```bash
pnpm db:migrate
```

You should see output confirming each migration applied. This only needs to run once
(and again whenever you pull schema changes).

Inspect the schema visually:

```bash
pnpm --filter @openellie/db db:studio
```

Opens Drizzle Studio at `http://localhost:4983` — a browser UI to browse tables and rows.

---

## 6. Run in Development

```bash
pnpm --filter @openellie/bot dev
```

The bot starts with `tsx watch` (hot-reload on file save). Expected startup sequence:

```
INFO  OpenEllie bot starting up
INFO  Running database migrations            ← applies any pending migrations
INFO  Database connection pool initialized   ← Drizzle + postgres.js ready
INFO  Workspace record created               ← seeds workspace from SLACK_TEAM_ID
INFO  GitHub connection created from env     ← seeds connection from GITHUB_PAT
INFO  Hono HTTP server started { port: 3000 }
INFO  Bolt Socket Mode connected             ← Slack real-time connection established
INFO  BullMQ workers started (3)             ← sync, embed, cleanup workers active
INFO  Scheduled jobs registered              ← recurring sync scheduled
INFO  OpenEllie bot ready
```

If the bot crashes immediately, Zod will print the name of every missing env variable.

**Health check endpoints:**

- `GET http://localhost:3000/health` — returns `{ status: "ok" }` when running
- `GET http://localhost:3000/ready` — returns `{ status: "ready" }` once DB + Slack are connected

---

## 7. Verify It Works in Slack

1. **Invite the bot** to a channel: `/invite @OpenEllie`

2. **Wait for the first sync** — on startup the bot automatically queues a GitHub sync job.
   Watch the terminal for:

   ```
   INFO  Sync completed { source: "github", prs: 47, commits: 312, releases: 8 }
   INFO  Embed queue processing { batchSize: 100 }
   ```

3. **Ask a question via mention:**

   ```
   @OpenEllie show open PRs this week
   @OpenEllie what shipped last month?
   @OpenEllie who has the most commits in the last 30 days?
   ```

   Expected: a loading block appears immediately, then updates to an answer with citations.

4. **Use the slash command:**

   ```
   /ellie what broke in production last week?
   /ellie summarise recent releases
   ```

5. **Use the message shortcut:**
   Right-click any message → Shortcuts → "Ask OpenEllie about this" → a modal opens,
   type your question, submit. Answer is posted as a reply in the channel.

---

## 8. Static Checks

Run these before committing — they match what CI runs on every PR:

```bash
# TypeScript strict mode — must show 0 errors
pnpm typecheck

# ESLint — must show 0 errors (2 warnings in @openellie/db are known and safe to ignore)
pnpm lint

# Prettier formatting check
pnpm format:check

# Auto-fix formatting
pnpm format
```

---

## 9. Unit Tests

```bash
# Run all tests across all packages
pnpm test

# Run only the bot's tests
pnpm --filter @openellie/bot test

# Watch mode — re-runs on file save during development
pnpm --filter @openellie/bot test:watch
```

Tests use **Vitest**. Test files live alongside source files as `*.test.ts`.

---

## 10. Schema Changes

Whenever you change files in `packages/db/src/schema/`:

```bash
# 1. Generate a new SQL migration file
pnpm db:generate
# → creates packages/db/drizzle/XXXX_<name>.sql

# 2. Apply the migration to your local database
pnpm db:migrate

# 3. Commit both the schema change and the generated migration file
git add packages/db/src/schema/ packages/db/drizzle/
```

The `drizzle/` folder is source-controlled — migration files should be committed.

---

## 11. Full Docker Stack

To run the bot inside Docker (mirrors production):

```bash
# Build image and start all services (postgres + redis + bot)
docker compose up -d

# Tail bot logs
docker compose logs -f bot

# Stop everything
docker compose down
```

The bot service depends on postgres and redis being healthy before starting.
The `docker-compose.yml` mounts source files for hot-reload in development.

For production-like settings:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d
```

This enables `restart: always`, Redis password auth, and uses the production build target.

---

## 12. Troubleshooting

**Bot crashes on startup with env validation errors**
Zod prints exactly which variables are missing or malformed. Check `.env` against `.env.example`.

**`SLACK_APP_TOKEN must start with xapp-`**
You used the Bot Token instead of the App-Level Token. The App-Level Token is in
Slack App → Basic Information → App-Level Tokens.

**`db:migrate` fails**
Ensure the postgres container is running and healthy: `docker compose ps`. Confirm
`DATABASE_URL` in `.env` matches the docker-compose credentials.

**Bot connects but GitHub sync produces no data**

- Verify `GITHUB_PAT` has `repo` and `read:org` scopes
- Confirm `GITHUB_REPOS` format is `owner/repo` (e.g. `myorg/api-service`), comma-separated, no spaces
- Check logs for `RateLimitError` — the PAT may have hit GitHub's 5000 req/hr limit

**`@OpenEllie` mention gets no response**

- Confirm the bot is invited to the channel (`/invite @OpenEllie`)
- Check the terminal — if the pipeline errors, the exception is logged with full stack trace
- Verify `AI_PROVIDER` and the matching API key are set correctly in `.env`

**Embedding errors on startup**
The embedding model must produce exactly 1536-dimensional vectors. Don't change
`EMBEDDING_MODEL` unless the new model is documented as 1536-dim.

**Rate limit message in Slack**
The bot enforces 100 queries/hour per workspace and 20 queries/hour per user.
Wait an hour or adjust limits in `packages/shared/src/constants/limits.ts`.

**`Cannot find module` error when running `db:generate` or `db:studio`**
These scripts use `node --require tsx/cjs` to handle TypeScript imports. Ensure
`tsx` is installed: `pnpm --filter @openellie/db install`.

---

## 13. Project Structure

```
openellie/
├── apps/bot/src/
│   ├── ai/              # Vercel AI SDK provider + embeddings + prompts
│   ├── bot/             # Slack Bolt handlers (mention, slash, shortcut)
│   ├── connectors/      # GitHub (implemented), Jira/Linear/Sentry (Phase 2 stubs)
│   ├── jobs/            # BullMQ workers (sync, embed, cleanup) + scheduler
│   ├── lib/             # DB client, Redis, crypto, logger, env validation, queries
│   ├── pipeline/        # 6-step NL query pipeline
│   ├── search/          # Hybrid search (vector + keyword + RRF fusion)
│   └── index.ts         # Startup entry point
├── packages/
│   ├── db/              # Drizzle ORM schema (13 tables), migrations, client
│   ├── shared/          # Shared types, retry util, token-bucket, constants
│   └── tsconfig/        # TypeScript config presets
├── docker/
│   └── bot.Dockerfile   # Multi-stage build (dev + production)
├── docker-compose.yml
├── docker-compose.prod.yml
├── .env.example
└── turbo.json
```

---

## 14. Common Commands Reference

| Command                                 | What it does                           |
| --------------------------------------- | -------------------------------------- |
| `pnpm install`                          | Install all workspace dependencies     |
| `pnpm --filter @openellie/bot dev`      | Start bot in watch mode                |
| `pnpm typecheck`                        | TypeScript check across all packages   |
| `pnpm lint`                             | ESLint across all packages             |
| `pnpm format`                           | Prettier format all files              |
| `pnpm test`                             | Run all unit tests                     |
| `pnpm db:migrate`                       | Apply pending DB migrations            |
| `pnpm db:generate`                      | Generate migration from schema changes |
| `pnpm --filter @openellie/db db:studio` | Open Drizzle Studio UI                 |
| `docker compose up -d postgres redis`   | Start infrastructure only              |
| `docker compose up -d`                  | Start full stack (incl. bot)           |
| `docker compose down`                   | Stop and remove containers             |
| `docker compose logs -f bot`            | Tail bot container logs                |
