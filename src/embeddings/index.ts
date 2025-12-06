/**
 * Embedding Provider Factory
 *
 * Creates embedding providers based on configuration and availability.
 * Supports OpenAI (when API key available) and Transformers.js (local fallback).
 */

import type { EmbeddingProvider, EmbeddingConfig } from "./types.js";
import { createLogger } from "../shared/logger.js";
import { getConfig } from "../config/index.js";
import { OpenAIEmbeddingProvider } from "./openai.js";
import { TransformersEmbeddingProvider } from "./transformers.js";

const logger = createLogger("Embeddings");

let cachedProvider: EmbeddingProvider | null = null;

/**
 * Get the configured embedding provider.
 * Uses factory pattern with automatic fallback.
 */
export async function getEmbeddingProvider(
  config?: Partial<EmbeddingConfig>
): Promise<EmbeddingProvider> {
  if (cachedProvider) {
    return cachedProvider;
  }

  const appConfig = getConfig();
  const provider = config?.provider ?? appConfig.embeddingProvider ?? "auto";
  const openaiKey = config?.openaiApiKey ?? appConfig.openaiApiKey;

  // Explicit provider selection
  if (provider === "openai") {
    if (!openaiKey) {
      throw new Error("OpenAI provider requested but OPENAI_API_KEY not set");
    }
    cachedProvider = new OpenAIEmbeddingProvider(openaiKey, config?.openaiModel);
    logger.info("Using OpenAI embedding provider", {
      model: cachedProvider.modelId,
    });
    return cachedProvider;
  }

  if (provider === "transformers") {
    cachedProvider = await TransformersEmbeddingProvider.create();
    logger.info("Using Transformers.js embedding provider", {
      model: cachedProvider.modelId,
    });
    return cachedProvider;
  }

  // Auto mode: prefer OpenAI if available, fallback to Transformers.js
  if (openaiKey) {
    const openaiProvider = new OpenAIEmbeddingProvider(openaiKey, config?.openaiModel);
    if (await openaiProvider.isAvailable()) {
      cachedProvider = openaiProvider;
      logger.info("Auto-selected OpenAI embedding provider", {
        model: cachedProvider.modelId,
      });
      return cachedProvider;
    }
    logger.warn("OpenAI API key provided but API unavailable, falling back to Transformers.js");
  }

  // Fallback to Transformers.js
  cachedProvider = await TransformersEmbeddingProvider.create();
  logger.info("Auto-selected Transformers.js embedding provider (local)", {
    model: cachedProvider.modelId,
  });
  return cachedProvider;
}

/**
 * Reset the cached provider (useful for testing).
 */
export function resetEmbeddingProvider(): void {
  cachedProvider = null;
}

export type {
  EmbeddingProvider,
  EmbeddingConfig,
  EmbeddingResult,
  BatchEmbeddingResult,
} from "./types.js";
