/**
 * Embedding Provider Types
 *
 * Factory pattern interfaces for swappable embedding providers.
 */

/** Embedding result from a provider */
export interface EmbeddingResult {
  readonly embedding: number[];
  readonly model: string;
  readonly dimension: number;
  readonly tokenCount?: number;
}

/** Batch embedding result */
export interface BatchEmbeddingResult {
  readonly embeddings: EmbeddingResult[];
  readonly totalTokens?: number;
}

/** Embedding provider interface */
export interface EmbeddingProvider {
  /** Provider identifier (e.g., 'openai', 'transformers') */
  readonly providerId: string;

  /** Model identifier (e.g., 'text-embedding-3-small', 'all-MiniLM-L6-v2') */
  readonly modelId: string;

  /** Full model name for storage (e.g., 'openai:text-embedding-3-small') */
  readonly fullModelName: string;

  /** Embedding dimension */
  readonly dimension: number;

  /** Generate embedding for a single text */
  embed(text: string): Promise<EmbeddingResult>;

  /** Generate embeddings for multiple texts (batch) */
  embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;

  /** Check if provider is available/configured */
  isAvailable(): Promise<boolean>;
}

/** Provider factory configuration */
export interface EmbeddingConfig {
  /** Preferred provider: 'openai' | 'transformers' | 'auto' */
  readonly provider: "openai" | "transformers" | "auto";
  /** OpenAI API key (optional, read from env if not provided) */
  readonly openaiApiKey?: string;
  /** OpenAI model override */
  readonly openaiModel?: string;
}
