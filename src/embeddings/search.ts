/**
 * Semantic Vector Search
 *
 * Performs vector similarity search over entity embeddings.
 */

import type {
  DisneyEntity,
  DestinationId,
  EntityType,
} from "../types/index.js";
import { getEmbeddingProvider } from "./index.js";
import {
  getAllEmbeddings,
  saveEmbedding,
  isEmbeddingStale,
} from "../db/embeddings.js";
import { getEntityById } from "../db/entities.js";
import { buildEmbeddingText, hashEmbeddingText } from "./text-builder.js";
import { topKSimilar, normalizeScore } from "./similarity.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("SemanticSearch");

export interface SemanticSearchOptions {
  readonly destinationId?: DestinationId;
  readonly entityType?: EntityType;
  readonly limit?: number;
  readonly minScore?: number;
}

export interface SemanticSearchResult<T extends DisneyEntity> {
  readonly entity: T;
  readonly score: number;
  readonly similarity: number;
}

/**
 * Perform semantic search over entities.
 */
export async function semanticSearch<T extends DisneyEntity>(
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SemanticSearchResult<T>[]> {
  const { limit = 10, minScore = 0.3 } = options;

  logger.debug("Semantic search", { query, options });

  // Get embedding provider
  const provider = await getEmbeddingProvider();

  // Generate query embedding
  const queryResult = await provider.embed(query);
  const queryVector = queryResult.embedding;

  // Get all embeddings (filtering happens after similarity calculation)
  const allEmbeddings = await getAllEmbeddings(provider.fullModelName);

  if (allEmbeddings.length === 0) {
    logger.debug("No embeddings found, returning empty results");
    return [];
  }

  // Build vectors array for similarity calculation
  const vectors = allEmbeddings.map((e) => e.embedding);
  const entityIds = allEmbeddings.map((e) => e.entityId);

  // Find top matches (get more than limit to allow for filtering)
  const topMatches = topKSimilar(queryVector, vectors, limit * 3);

  // Load entities and filter
  const results: SemanticSearchResult<T>[] = [];

  for (const match of topMatches) {
    if (results.length >= limit) break;

    const entityId = entityIds[match.index];
    if (!entityId) continue;

    const entity = await getEntityById<T>(entityId);
    if (!entity) continue;

    // Apply filters
    if (options.destinationId && entity.destinationId !== options.destinationId) {
      continue;
    }
    if (options.entityType && entity.entityType !== options.entityType) {
      continue;
    }

    // Calculate normalized score
    const score = normalizeScore(match.similarity, minScore);
    if (score <= 0) continue;

    results.push({
      entity,
      score,
      similarity: match.similarity,
    });
  }

  logger.debug("Semantic search complete", {
    query,
    resultsCount: results.length,
    topScore: results[0]?.score,
  });

  return results;
}

/**
 * Ensure entity has an up-to-date embedding.
 * Generates embedding if missing or stale.
 */
export async function ensureEmbedding(entity: DisneyEntity): Promise<void> {
  const text = buildEmbeddingText(entity);
  const hash = hashEmbeddingText(text);

  // Check if embedding exists and is current
  if (!(await isEmbeddingStale(entity.id, hash))) {
    return; // Embedding is current
  }

  logger.debug("Generating embedding for entity", {
    id: entity.id,
    name: entity.name,
  });

  const provider = await getEmbeddingProvider();
  const result = await provider.embed(text);

  await saveEmbedding(
    entity.id,
    result.embedding,
    result.model,
    result.dimension,
    hash
  );
}

/**
 * Generate embeddings for multiple entities (batch).
 * More efficient than individual calls for bulk operations.
 */
export async function ensureEmbeddingsBatch(
  entities: DisneyEntity[]
): Promise<number> {
  const provider = await getEmbeddingProvider();
  let generated = 0;

  // Filter to entities needing embeddings
  const needsEmbedding: Array<{
    entity: DisneyEntity;
    text: string;
    hash: string;
  }> = [];

  for (const entity of entities) {
    const text = buildEmbeddingText(entity);
    const hash = hashEmbeddingText(text);

    if (await isEmbeddingStale(entity.id, hash)) {
      needsEmbedding.push({ entity, text, hash });
    }
  }

  if (needsEmbedding.length === 0) {
    return 0;
  }

  logger.info("Generating embeddings batch", { count: needsEmbedding.length });

  // Process in batches to avoid memory issues
  const BATCH_SIZE = 50;

  for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
    const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
    const texts = batch.map((b) => b.text);

    const results = await provider.embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j]!;
      const result = results.embeddings[j];
      if (!result) continue;

      await saveEmbedding(
        item.entity.id,
        result.embedding,
        result.model,
        result.dimension,
        item.hash
      );
      generated++;
    }
  }

  logger.info("Embeddings batch complete", { generated });
  return generated;
}
