import { initDb, getDb as getDbFromPackage } from "@openellie/db/client";
import type { DrizzleClient } from "@openellie/db/client";
import { getEnv } from "../env.js";
import { logger } from "../logger.js";

export type { DrizzleClient };

let _initialized = false;

/**
 * Initializes the database client with the configured connection string.
 * Safe to call multiple times — only initializes once.
 */
export function initDatabase(): DrizzleClient {
  if (_initialized) return getDatabase();

  const env = getEnv();
  const db = initDb(env.DATABASE_URL);
  _initialized = true;

  logger.info("Database client initialized");
  return db;
}

/**
 * Returns the singleton Drizzle database client.
 * Call initDatabase() during app startup before using this.
 */
export function getDatabase(): DrizzleClient {
  return getDbFromPackage();
}
