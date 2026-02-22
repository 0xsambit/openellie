# Contributing to OpenEllie

Thank you for your interest in contributing! OpenEllie is a community project and we welcome all contributions.

---

## Getting Started

1. **Fork** the repository
2. **Clone** your fork: `git clone https://github.com/your-username/openellie.git`
3. **Install dependencies**: `pnpm install`
4. **Create a branch**: `git checkout -b feat/your-feature-name`
5. **Make your changes**
6. **Run checks**: `pnpm typecheck && pnpm lint && pnpm test`
7. **Submit a pull request**

---

## Development Setup

See the [Quick Start](README.md#quick-start) section in the README.

For contributing to the bot locally, you'll need:

- A Slack development workspace
- The bot installed in that workspace with the required scopes
- PostgreSQL + Redis (via `docker compose up -d postgres redis`)

---

## Areas for Contribution

### Phase 2 Connectors

The highest-value contributions right now are Phase 2 connectors. Each connector needs:

1. `apps/bot/src/connectors/<name>/types.ts` — credential + config types
2. `apps/bot/src/connectors/<name>/client.ts` — API client factory
3. `apps/bot/src/connectors/<name>/sync.ts` — extends `BaseConnector`, implements `performSync()` + `performIncrementalSync()`

Available connectors to implement:

- **Jira** — Issue sync (project key filter, status/type filter)
- **Linear** — Issue + cycle sync (team filter)
- **Sentry** — Issue sync (project + environment filter)

The database schemas are already defined in `packages/db/src/schema/`.

### Bug Fixes

Check the [GitHub Issues](https://github.com/your-org/openellie/issues) page for open bugs.

### Documentation

- Improving setup guides
- Adding architecture diagrams
- Writing connector implementation guides

---

## Code Standards

### TypeScript

- `strict: true` — no `any`, no non-null assertions without a comment explaining why
- All new public APIs need TypeScript types (no `unknown` leaking out)
- Zod validation for all external inputs (connector credentials, Slack inputs, API responses)

### Naming

- Files: `kebab-case.ts`
- Classes: `PascalCase`
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`

### Tests

- Unit tests go in `*.test.ts` next to the file they test
- Use Vitest (`pnpm test`)
- Test the happy path + error cases for all public functions

### Commits

Follow [Conventional Commits](https://conventionalcommits.org):

```
feat: add Linear connector
fix: handle GitHub rate limit headers on 304 responses
docs: add Jira connector setup guide
chore: bump @octokit/rest to v21
```

---

## Adding a New Connector

1. Add the connector type to `packages/shared/src/types/connectors.ts`:

   ```typescript
   export const ConnectorType = {
     // ... existing types ...
     MY_CONNECTOR: "my_connector",
   } as const;
   ```

2. Add the database schema if needed in `packages/db/src/schema/`

3. Create the connector files:
   - `apps/bot/src/connectors/my-connector/types.ts`
   - `apps/bot/src/connectors/my-connector/client.ts`
   - `apps/bot/src/connectors/my-connector/sync.ts`

4. Register in the sync worker's `resolveConnector()` switch in `apps/bot/src/jobs/workers/sync.worker.ts`

5. Add embed sources in `enqueueEmbedJobs()` if your connector produces embeddable data

6. Add keyword + vector search cases in `apps/bot/src/search/`

7. Add a GitHub Issue template in `.github/ISSUE_TEMPLATE/new_connector.md`

---

## Pull Request Process

1. Fill out the pull request template
2. Ensure `pnpm typecheck`, `pnpm lint`, and `pnpm test` all pass
3. Link to a relevant GitHub Issue if applicable
4. Request review from a maintainer

---

## Questions?

Open a GitHub Issue with the `question` label, or start a Discussion.
