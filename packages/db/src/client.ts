import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import * as schema from "./schema/index.js";

export type DrizzleClient = ReturnType<typeof createDbClient>;

/**
 * Creates a Drizzle ORM client connected to PostgreSQL.
 *
 * @param connectionString - PostgreSQL connection URL.
 * @param options - Optional configuration overrides.
 * @returns Typed Drizzle client with full schema.
 */
export function createDbClient(
  connectionString: string,
  options: { maxConnections?: number } = {},
) {
  const sql = postgres(connectionString, {
    max: options.maxConnections ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // pgvector requires this to handle array types correctly
    types: {
      // Register the vector type — pgvector OID is dynamic, handled via customType
    },
  });

  return drizzle(sql, { schema });
}

/** Shared db instance — initialized once per process. */
let _db: DrizzleClient | null = null;

/**
 * Returns the singleton Drizzle database client.
 * Call initDb() before using this.
 *
 * @throws Error if initDb() has not been called.
 */
export function getDb(): DrizzleClient {
  if (!_db) {
    throw new Error(
      "Database client not initialized. Call initDb(connectionString) first.",
    );
  }
  return _db;
}

/**
 * Initializes the singleton Drizzle database client.
 *
 * @param connectionString - PostgreSQL connection URL.
 * @param options - Optional configuration.
 */
export function initDb(
  connectionString: string,
  options: { maxConnections?: number } = {},
): DrizzleClient {
  _db = createDbClient(connectionString, options);
  return _db;
}
