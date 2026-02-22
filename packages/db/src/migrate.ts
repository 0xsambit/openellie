import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Runs all pending Drizzle migrations against the database.
 * Also ensures the pgvector extension and required search indexes are created.
 *
 * @param connectionString - PostgreSQL connection URL.
 */
export async function runMigrations(connectionString: string): Promise<void> {
  // Use a single connection for migrations
  const sql = postgres(connectionString, { max: 1 });
  const db = drizzle(sql);

  try {
    // Ensure pgvector extension is enabled
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    await sql`CREATE EXTENSION IF NOT EXISTS pg_trgm`;

    // Run Drizzle migrations
    const migrationsFolder = join(__dirname, "../drizzle");
    await migrate(db, { migrationsFolder });

    // Create IVFFlat indexes for vector columns (not supported by Drizzle schema directly)
    // These are idempotent — safe to run on every startup
    await createVectorIndexes(sql);

    // Create full-text search GIN indexes
    await createFtsIndexes(sql);
  } finally {
    await sql.end();
  }
}

/**
 * Creates IVFFlat approximate nearest neighbor indexes on embedding columns.
 * These are separate from Drizzle-managed schema because pgvector index syntax
 * is not supported by Drizzle's schema builder.
 */
async function createVectorIndexes(
  sql: ReturnType<typeof postgres>,
): Promise<void> {
  const vectorIndexes = [
    {
      table: "github_pull_requests",
      column: "embedding",
      name: "github_prs_embedding_idx",
    },
    {
      table: "github_commits",
      column: "embedding",
      name: "github_commits_embedding_idx",
    },
    {
      table: "tickets",
      column: "embedding",
      name: "tickets_embedding_idx",
    },
    {
      table: "sentry_issues",
      column: "embedding",
      name: "sentry_issues_embedding_idx",
    },
  ];

  for (const { table, column, name } of vectorIndexes) {
    // IVFFlat with lists=100 — good for datasets up to ~1M rows
    await sql.unsafe(`
      CREATE INDEX IF NOT EXISTS ${name}
      ON ${table} USING ivfflat (${column} vector_cosine_ops)
      WITH (lists = 100)
    `);
  }
}

/**
 * Creates GIN indexes for full-text search using tsvector columns.
 * These enable fast keyword search alongside vector similarity.
 */
async function createFtsIndexes(
  sql: ReturnType<typeof postgres>,
): Promise<void> {
  // GitHub PRs: full-text on title + body
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS github_prs_fts_idx
    ON github_pull_requests
    USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, '')))
  `);

  // Commits: full-text on message
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS github_commits_fts_idx
    ON github_commits
    USING gin(to_tsvector('english', coalesce(message, '')))
  `);

  // Tickets: full-text on title + description
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS tickets_fts_idx
    ON tickets
    USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(description, '')))
  `);

  // Sentry issues: full-text on title + culprit
  await sql.unsafe(`
    CREATE INDEX IF NOT EXISTS sentry_issues_fts_idx
    ON sentry_issues
    USING gin(to_tsvector('english', coalesce(title, '') || ' ' || coalesce(culprit, '')))
  `);
}

// Allow running directly: tsx src/migrate.ts
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const connectionString = process.env["DATABASE_URL"];
  if (!connectionString) {
    process.stderr.write("DATABASE_URL environment variable is required\n");
    process.exit(1);
  }

  runMigrations(connectionString)
    .then(() => {
      process.stdout.write("Migrations completed successfully\n");
      process.exit(0);
    })
    .catch((err: unknown) => {
      process.stderr.write(`Migration failed: ${String(err)}\n`);
      process.exit(1);
    });
}
