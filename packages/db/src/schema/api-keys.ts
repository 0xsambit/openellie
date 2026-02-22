import {
  pgTable,
  uuid,
  text,
  boolean,
  timestamp,
  index,
} from "drizzle-orm/pg-core";
import { workspaces } from "./workspaces.js";

/**
 * API keys table — stores encrypted AI provider credentials per workspace.
 * Only one key can be active at a time (is_active = true).
 */
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),

    workspaceId: uuid("workspace_id")
      .references(() => workspaces.id, { onDelete: "cascade" })
      .notNull(),

    /** AI provider: 'openai' | 'anthropic' | 'groq' | 'ollama' | 'custom' */
    provider: text("provider").notNull(),

    /**
     * AES-256-GCM encrypted API key.
     * Format: "iv:authTag:ciphertext" (all base64, colon-delimited).
     */
    encryptedKey: text("encrypted_key").notNull(),

    /**
     * Chat completion model name.
     * e.g. 'claude-opus-4-5-20251101', 'gpt-4o', 'llama-3.3-70b-versatile'
     */
    modelName: text("model_name").notNull(),

    /**
     * Embedding model name — must produce 1536-dimensional vectors.
     * e.g. 'text-embedding-3-small', 'voyage-3-large'
     */
    embeddingModel: text("embedding_model").default("text-embedding-3-small").notNull(),

    /**
     * Optional custom base URL for Ollama or OpenAI-compatible APIs.
     * e.g. 'http://localhost:11434'
     */
    baseUrl: text("base_url"),

    /**
     * Whether this is the currently active key.
     * Only one key should be active per workspace at a time.
     * Changing the active key triggers a wipe-and-re-embed job.
     */
    isActive: boolean("is_active").default(true).notNull(),

    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("api_keys_workspace_id_idx").on(t.workspaceId),
    index("api_keys_active_idx").on(t.workspaceId, t.isActive),
  ],
);

export type ApiKey = typeof apiKeys.$inferSelect;
export type NewApiKey = typeof apiKeys.$inferInsert;
