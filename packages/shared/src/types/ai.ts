/**
 * Supported AI provider identifiers.
 */
export const AIProvider = {
  OPENAI: "openai",
  ANTHROPIC: "anthropic",
  GROQ: "groq",
  OLLAMA: "ollama",
  CUSTOM: "custom",
} as const;

export type AIProvider = (typeof AIProvider)[keyof typeof AIProvider];

/**
 * Embedding models that produce 1536-dimensional vectors.
 * Only these models are supported to keep the vector schema uniform.
 */
export const EmbeddingModel = {
  /** OpenAI text-embedding-3-small: 1536 dims (default) */
  TEXT_EMBEDDING_3_SMALL: "text-embedding-3-small",
  /** Voyage AI voyage-3-large: 1536 dims */
  VOYAGE_3_LARGE: "voyage-3-large",
} as const;

export type EmbeddingModel = (typeof EmbeddingModel)[keyof typeof EmbeddingModel];

/** Embedding vector dimension — fixed at 1536 across all supported models. */
export const EMBEDDING_DIMENSIONS = 1536 as const;

/**
 * Configuration for an AI provider instance.
 */
export interface AIProviderConfig {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

/**
 * Configuration for the embedding provider.
 */
export interface EmbeddingProviderConfig {
  model: EmbeddingModel;
  apiKey: string;
}
