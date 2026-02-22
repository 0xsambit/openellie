import { z } from "zod";

/**
 * Zod schema for all required and optional environment variables.
 * The process exits immediately on startup if required vars are missing or invalid.
 */
const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),

  // Slack
  SLACK_BOT_TOKEN: z
    .string()
    .min(1)
    .describe("Slack Bot User OAuth Token (xoxb-...)"),
  SLACK_SIGNING_SECRET: z
    .string()
    .min(1)
    .describe("Slack App Signing Secret"),
  SLACK_APP_TOKEN: z
    .string()
    .min(1)
    .describe("Slack App-Level Token for Socket Mode (xapp-...)"),
  SLACK_TEAM_ID: z
    .string()
    .min(1)
    .describe("Slack Team ID (T...)"),
  SLACK_TEAM_NAME: z
    .string()
    .optional()
    .describe("Slack workspace display name (optional)"),

  // Database
  DATABASE_URL: z
    .string()
    .url()
    .describe("PostgreSQL connection URL"),

  // Redis
  REDIS_URL: z
    .string()
    .url()
    .describe("Redis connection URL"),

  // Encryption
  ENCRYPTION_MASTER_KEY: z
    .string()
    .regex(/^[0-9a-fA-F]{64}$/, "Must be a 64-character hex string (32 bytes)")
    .describe("Master AES-256-GCM encryption key — 32 bytes as hex"),

  // GitHub
  GITHUB_PAT: z
    .string()
    .optional()
    .describe("GitHub Personal Access Token"),
  GITHUB_REPOS: z
    .string()
    .optional()
    .transform((val) => (val ? val.split(",").map((r) => r.trim()).filter(Boolean) : []))
    .describe("Comma-separated list of repos to sync (owner/repo)"),

  // AI Provider
  AI_PROVIDER: z
    .enum(["openai", "anthropic", "groq", "ollama", "custom"])
    .default("openai"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o"),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default("claude-opus-4-5-20251101"),
  GROQ_API_KEY: z.string().optional(),
  GROQ_MODEL: z.string().default("llama-3.3-70b-versatile"),
  OLLAMA_BASE_URL: z.string().url().optional(),
  OLLAMA_MODEL: z.string().default("llama3.2"),
  CUSTOM_AI_BASE_URL: z.string().url().optional(),
  CUSTOM_AI_MODEL: z.string().optional(),

  // Embedding
  EMBEDDING_MODEL: z
    .enum(["text-embedding-3-small", "voyage-3-large"])
    .default("text-embedding-3-small"),
  VOYAGE_API_KEY: z.string().optional(),

  // Bot API
  BOT_PORT: z.coerce.number().int().positive().default(3000),
  BOT_API_SECRET: z
    .string()
    .min(16)
    .describe("Internal service secret for dashboard↔bot API calls"),

  // Sync settings
  SYNC_FREQUENCY_HOURS: z.coerce.number().int().positive().default(4),
  DATA_RETENTION_DAYS: z.coerce.number().int().positive().default(90),

  // Feature flags
  ENABLE_POSTHOG_CONNECTOR: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
  ENABLE_USAGE_ANALYTICS: z
    .string()
    .transform((v) => v === "true")
    .default("false"),
});

export type Env = z.infer<typeof envSchema>;

let _env: Env | null = null;

/**
 * Parses and validates environment variables using Zod.
 * Exits the process immediately if any required variable is missing or invalid.
 *
 * @returns Validated environment configuration.
 */
export function loadEnv(): Env {
  if (_env) return _env;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    process.stderr.write(
      `\n[OpenEllie] Fatal: Invalid environment configuration:\n${errors}\n\n` +
        `  Please check your .env file against .env.example\n\n`,
    );
    process.exit(1);
  }

  _env = result.data;
  return _env;
}

/**
 * Returns the validated environment configuration.
 * Calls loadEnv() on first access (fail-fast on missing vars).
 */
export function getEnv(): Env {
  return loadEnv();
}
