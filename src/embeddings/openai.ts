/**
 * OpenAI Embedding Provider
 *
 * Uses text-embedding-3-small for high-quality embeddings.
 */

import type { EmbeddingProvider, EmbeddingResult, BatchEmbeddingResult } from "./types.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("OpenAIEmbeddings");

const DEFAULT_MODEL = "text-embedding-3-small";
const MODEL_DIMENSIONS: Record<string, number> = {
  "text-embedding-3-small": 1536,
  "text-embedding-3-large": 3072,
  "text-embedding-ada-002": 1536,
};

export class OpenAIEmbeddingProvider implements EmbeddingProvider {
  readonly providerId = "openai";
  readonly modelId: string;
  readonly fullModelName: string;
  readonly dimension: number;

  private readonly apiKey: string;
  private readonly baseUrl = "https://api.openai.com/v1";

  constructor(apiKey: string, model?: string) {
    this.apiKey = apiKey;
    this.modelId = model ?? DEFAULT_MODEL;
    this.fullModelName = `openai:${this.modelId}`;
    this.dimension = MODEL_DIMENSIONS[this.modelId] ?? 1536;
  }

  async isAvailable(): Promise<boolean> {
    try {
      // Simple API key validation - make a minimal request
      const response = await fetch(`${this.baseUrl}/models`, {
        headers: { Authorization: `Bearer ${this.apiKey}` },
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  async embed(text: string): Promise<EmbeddingResult> {
    const result = await this.embedBatch([text]);
    const first = result.embeddings[0];
    if (!first) {
      throw new Error("No embedding returned from OpenAI");
    }
    return first;
  }

  async embedBatch(texts: string[]): Promise<BatchEmbeddingResult> {
    logger.debug("Generating embeddings", {
      count: texts.length,
      model: this.modelId,
    });

    const response = await fetch(`${this.baseUrl}/embeddings`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: this.modelId,
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI API error: ${response.status} - ${error}`);
    }

    const data = (await response.json()) as OpenAIEmbeddingResponse;

    return {
      embeddings: data.data.map((item) => ({
        embedding: item.embedding,
        model: this.fullModelName,
        dimension: this.dimension,
      })),
      totalTokens: data.usage?.total_tokens,
    };
  }
}

interface OpenAIEmbeddingResponse {
  data: Array<{ embedding: number[]; index: number }>;
  usage?: { total_tokens: number };
}
