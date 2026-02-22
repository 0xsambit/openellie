import { createOpenAI } from "@ai-sdk/openai";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createGroq } from "@ai-sdk/groq";
import type { LanguageModel, EmbeddingModel } from "ai";
import { getEnv } from "../lib/env.js";
import { getActiveApiKey } from "../lib/db/queries/api-keys.js";
import { decrypt } from "../lib/crypto.js";
import {
  AIProviderError,
  AppError,
  ErrorCode,
} from "../lib/errors.js";
import { logger } from "../lib/logger.js";
import { AIProvider, EmbeddingModel as EmbeddingModelEnum } from "@openellie/shared/types";

/**
 * Result of resolving the active AI provider configuration.
 */
export interface ActiveProviderConfig {
  /** Vercel AI SDK language model for chat completions. */
  languageModel: LanguageModel;
  /** Vercel AI SDK embedding model for vector generation. */
  embeddingModel: EmbeddingModel<string>;
  /** Human-readable model name for display in Slack responses. */
  modelName: string;
  /** Provider identifier. */
  provider: string;
}

/**
 * Resolves the active AI provider configuration for a workspace.
 *
 * Priority:
 * 1. Active API key from DB (configured via dashboard in Phase 3)
 * 2. Fallback to environment variables
 *
 * @param workspaceId - Workspace UUID.
 * @returns Configured language and embedding models.
 * @throws AIProviderError if no provider is configured.
 */
export async function resolveActiveProvider(
  workspaceId: string,
): Promise<ActiveProviderConfig> {
  // Try DB-configured key first
  try {
    const apiKeyRecord = await getActiveApiKey(workspaceId);

    if (apiKeyRecord) {
      const decryptedKey = decrypt(apiKeyRecord.encryptedKey, workspaceId);
      return buildProviderFromRecord(
        apiKeyRecord.provider,
        decryptedKey,
        apiKeyRecord.modelName,
        apiKeyRecord.embeddingModel,
        apiKeyRecord.baseUrl ?? undefined,
      );
    }
  } catch (error) {
    logger.warn({ err: error }, "Failed to load API key from DB, falling back to env");
  }

  // Fallback to environment variables
  return buildProviderFromEnv();
}

/**
 * Builds a provider configuration from a DB API key record.
 */
function buildProviderFromRecord(
  provider: string,
  apiKey: string,
  modelName: string,
  embeddingModelName: string,
  baseUrl?: string,
): ActiveProviderConfig {
  const { languageModel, embeddingModel } = createModels(
    provider,
    apiKey,
    modelName,
    embeddingModelName,
    baseUrl,
  );

  return { languageModel, embeddingModel, modelName, provider };
}

/**
 * Builds a provider configuration from environment variables.
 * Used as fallback when no DB key is configured.
 */
function buildProviderFromEnv(): ActiveProviderConfig {
  const env = getEnv();
  const provider = env.AI_PROVIDER;

  let apiKey: string;
  let modelName: string;
  let baseUrl: string | undefined;

  switch (provider) {
    case AIProvider.OPENAI:
      if (!env.OPENAI_API_KEY) {
        throw new AppError(
          "OPENAI_API_KEY environment variable is required when AI_PROVIDER=openai",
          ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
        );
      }
      apiKey = env.OPENAI_API_KEY;
      modelName = env.OPENAI_MODEL;
      break;

    case AIProvider.ANTHROPIC:
      if (!env.ANTHROPIC_API_KEY) {
        throw new AppError(
          "ANTHROPIC_API_KEY environment variable is required when AI_PROVIDER=anthropic",
          ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
        );
      }
      apiKey = env.ANTHROPIC_API_KEY;
      modelName = env.ANTHROPIC_MODEL;
      break;

    case AIProvider.GROQ:
      if (!env.GROQ_API_KEY) {
        throw new AppError(
          "GROQ_API_KEY environment variable is required when AI_PROVIDER=groq",
          ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
        );
      }
      apiKey = env.GROQ_API_KEY;
      modelName = env.GROQ_MODEL;
      break;

    case AIProvider.OLLAMA:
      apiKey = "ollama"; // Ollama doesn't require a real API key
      modelName = env.OLLAMA_MODEL;
      baseUrl = env.OLLAMA_BASE_URL;
      break;

    case AIProvider.CUSTOM:
      if (!env.CUSTOM_AI_BASE_URL || !env.CUSTOM_AI_MODEL) {
        throw new AppError(
          "CUSTOM_AI_BASE_URL and CUSTOM_AI_MODEL are required when AI_PROVIDER=custom",
          ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
        );
      }
      apiKey = env.OPENAI_API_KEY ?? "custom";
      modelName = env.CUSTOM_AI_MODEL;
      baseUrl = env.CUSTOM_AI_BASE_URL;
      break;

    default:
      throw new AppError(
        `Unsupported AI provider: ${String(provider)}`,
        ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
      );
  }

  const { languageModel, embeddingModel } = createModels(
    provider,
    apiKey,
    modelName,
    env.EMBEDDING_MODEL,
    baseUrl,
  );

  return { languageModel, embeddingModel, modelName, provider };
}

/**
 * Creates Vercel AI SDK language and embedding model instances.
 */
function createModels(
  provider: string,
  apiKey: string,
  modelName: string,
  embeddingModelName: string,
  baseUrl?: string,
): { languageModel: LanguageModel; embeddingModel: EmbeddingModel<string> } {
  const env = getEnv();

  switch (provider) {
    case AIProvider.OPENAI: {
      const openai = createOpenAI({ apiKey });
      return {
        languageModel: openai(modelName),
        embeddingModel: openai.embedding(
          embeddingModelName === EmbeddingModelEnum.TEXT_EMBEDDING_3_SMALL
            ? "text-embedding-3-small"
            : "text-embedding-3-small",
        ),
      };
    }

    case AIProvider.ANTHROPIC: {
      const anthropic = createAnthropic({ apiKey });
      // Voyage embedding for Anthropic provider — use Voyage API key
      if (!env.VOYAGE_API_KEY && embeddingModelName === EmbeddingModelEnum.VOYAGE_3_LARGE) {
        logger.warn(
          "VOYAGE_API_KEY not set — falling back to OpenAI embeddings for Anthropic provider",
        );
      }
      // For Anthropic, use OpenAI embedding as fallback if no Voyage key
      const openaiForEmbed = env.OPENAI_API_KEY
        ? createOpenAI({ apiKey: env.OPENAI_API_KEY })
        : null;
      const voyageOpenAI = env.VOYAGE_API_KEY
        ? createOpenAI({
            apiKey: env.VOYAGE_API_KEY,
            baseURL: "https://api.voyageai.com/v1",
          })
        : null;

      const embeddingProvider = voyageOpenAI ?? openaiForEmbed;
      if (!embeddingProvider) {
        throw new AppError(
          "Either VOYAGE_API_KEY or OPENAI_API_KEY is required for embeddings with Anthropic provider",
          ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
        );
      }

      return {
        languageModel: anthropic(modelName),
        embeddingModel:
          voyageOpenAI
            ? voyageOpenAI.embedding("voyage-3-large")
            : embeddingProvider.embedding("text-embedding-3-small"),
      };
    }

    case AIProvider.GROQ: {
      const groq = createGroq({ apiKey });
      // Groq doesn't have embeddings — use OpenAI fallback
      if (!env.OPENAI_API_KEY) {
        throw new AppError(
          "OPENAI_API_KEY is required for embeddings when using Groq as the AI provider",
          ErrorCode.AI_PROVIDER_NOT_CONFIGURED,
        );
      }
      const openaiForEmbed = createOpenAI({ apiKey: env.OPENAI_API_KEY });
      return {
        languageModel: groq(modelName),
        embeddingModel: openaiForEmbed.embedding("text-embedding-3-small"),
      };
    }

    case AIProvider.OLLAMA:
    case AIProvider.CUSTOM: {
      // OpenAI-compatible: use custom baseURL
      const customOpenAI = createOpenAI({
        apiKey,
        baseURL: baseUrl ?? "http://localhost:11434/v1",
      });
      // For embeddings, use the model if it supports them, else fall back to OpenAI
      const embeddingModel =
        env.OPENAI_API_KEY
          ? createOpenAI({ apiKey: env.OPENAI_API_KEY }).embedding(
              "text-embedding-3-small",
            )
          : customOpenAI.embedding(modelName);

      return {
        languageModel: customOpenAI(modelName),
        embeddingModel,
      };
    }

    default:
      throw new AIProviderError(
        `Unsupported provider: ${String(provider)}`,
        String(provider),
      );
  }
}
