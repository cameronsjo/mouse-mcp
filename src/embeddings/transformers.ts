/**
 * Transformers.js Embedding Provider
 *
 * Local embeddings using all-MiniLM-L6-v2 model.
 * No API key required - runs entirely locally.
 */

import type { EmbeddingProvider, EmbeddingResult, BatchEmbeddingResult } from "./types.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("TransformersEmbeddings");

const MODEL_NAME = "Xenova/all-MiniLM-L6-v2";
const DIMENSION = 384;

/** Type for Transformers.js pipeline */
type FeatureExtractionPipeline = (
  text: string | string[],
  options?: { pooling?: string; normalize?: boolean }
) => Promise<{ data: Float32Array | number[] }>;

export class TransformersEmbeddingProvider implements EmbeddingProvider {
  readonly providerId = "transformers";
  readonly modelId = "all-MiniLM-L6-v2";
  readonly fullModelName = `transformers:${this.modelId}`;
  readonly dimension = DIMENSION;

  private pipeline: FeatureExtractionPipeline | null = null;
  private loading: Promise<FeatureExtractionPipeline> | null = null;

  // Private constructor - use create() factory
  private constructor() {}

  /**
   * Factory method to create provider with lazy model loading.
   */
  static async create(): Promise<TransformersEmbeddingProvider> {
    const provider = new TransformersEmbeddingProvider();
    // Don't load model immediately - lazy load on first use
    return provider;
  }

  async isAvailable(): Promise<boolean> {
    // Transformers.js is always available (local)
    return true;
  }

  private async getPipeline(): Promise<FeatureExtractionPipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    // Prevent multiple parallel loads
    if (this.loading) {
      return this.loading;
    }

    this.loading = this.loadPipeline();
    this.pipeline = await this.loading;
    this.loading = null;

    return this.pipeline;
  }

  private async loadPipeline(): Promise<FeatureExtractionPipeline> {
    logger.info("Loading Transformers.js model", { model: MODEL_NAME });

    // Dynamic import to avoid loading at startup
    const { pipeline } = await import("@xenova/transformers");

    const pipe = await pipeline("feature-extraction", MODEL_NAME, {
      // Use quantized model for faster inference
      quantized: true,
    });

    logger.info("Transformers.js model loaded");
    return pipe as unknown as FeatureExtractionPipeline;
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const result = await this.embedBatch([text]);
    const first = result.embeddings[0];
    if (!first) {
      throw new Error("No embedding returned from Transformers.js");
    }
    return first;
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    logger.debug("Generating embeddings", {
      count: texts.length,
      model: this.modelId,
    });

    const pipe = await this.getPipeline();

    const embeddings: EmbeddingResult[] = [];

    for (const text of texts) {
      const output = await pipe(text, { pooling: "mean", normalize: true });

      // Convert Tensor to array
      const embedding = Array.from(output.data as Float32Array);

      embeddings.push({
        embedding,
        model: this.fullModelName,
        dimension: this.dimension,
      });
    }

    return { embeddings };
  }
}
