/**
 * Semantic Vector Search
 *
 * Performs vector similarity search using LanceDB.
 */

import type { DisneyEntity, DestinationId, EntityType } from "../types/index.js";
import { getEmbeddingProvider } from "./index.js";
import {
  vectorSearch,
  saveEmbedding,
  saveEmbeddingsBatch,
  isEmbeddingStale,
  type EmbeddingRecord,
} from "../vectordb/index.js";
import { getEntityById } from "../db/entities.js";
import { buildEmbeddingText, hashEmbeddingText, formatQueryText } from "./text-builder.js";
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
  readonly distance: number;
}

/**
 * Convert LanceDB distance to similarity score.
 * LanceDB uses L2 distance by default (lower = more similar).
 * We convert to a 0-1 score where 1 = most similar.
 */
function distanceToScore(distance: number): number {
  // L2 distance of 0 = identical, grows unbounded
  // Convert to 0-1 score using exponential decay
  return Math.exp(-distance);
}

/**
 * Perform semantic search over entities using LanceDB.
 */
export async function semanticSearch<T extends DisneyEntity>(
  query: string,
  options: SemanticSearchOptions = {}
): Promise<Array<SemanticSearchResult<T>>> {
  const { limit = 10, minScore = 0.3 } = options;

  logger.debug("Semantic search", { query, options });

  // Get embedding provider
  const provider = await getEmbeddingProvider();

  // Generate query embedding with E5-style prefix for asymmetric search
  const formattedQuery = formatQueryText(query);
  const queryResult = await provider.embed(formattedQuery);
  const queryVector = queryResult.embedding;

  // Search LanceDB with filters
  const searchResults = await vectorSearch(queryVector, provider.fullModelName, {
    limit: limit * 2, // Get extra to filter by score
    entityType: options.entityType,
    destinationId: options.destinationId,
  });

  if (searchResults.length === 0) {
    logger.debug("No embeddings found, returning empty results");
    return [];
  }

  // Load entities and filter by score
  const results: Array<SemanticSearchResult<T>> = [];

  for (const match of searchResults) {
    if (results.length >= limit) break;

    const score = distanceToScore(match._distance);
    if (score < minScore) continue;

    const entity = await getEntityById<T>(match.id);
    if (!entity) continue;

    results.push({
      entity,
      score,
      distance: match._distance,
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
  const provider = await getEmbeddingProvider();
  const text = buildEmbeddingText(entity);
  const hash = hashEmbeddingText(text);

  // Check if embedding exists and is current
  if (!(await isEmbeddingStale(entity.id, provider.fullModelName, hash))) {
    return; // Embedding is current
  }

  logger.debug("Generating embedding for entity", {
    id: entity.id,
    name: entity.name,
    model: provider.fullModelName,
  });

  const result = await provider.embed(text);

  const record: EmbeddingRecord = {
    id: entity.id,
    model: result.model,
    vector: result.embedding,
    textHash: hash,
    entityType: entity.entityType,
    destinationId: entity.destinationId,
    name: entity.name,
    createdAt: new Date().toISOString(),
  };

  await saveEmbedding(record);
}

/**
 * Generate embeddings for multiple entities (batch).
 * More efficient than individual calls for bulk operations.
 */
export async function ensureEmbeddingsBatch(entities: DisneyEntity[]): Promise<number> {
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

    if (await isEmbeddingStale(entity.id, provider.fullModelName, hash)) {
      needsEmbedding.push({ entity, text, hash });
    }
  }

  if (needsEmbedding.length === 0) {
    return 0;
  }

  logger.info("Generating embeddings batch", {
    count: needsEmbedding.length,
    model: provider.fullModelName,
  });

  // Process in batches to avoid memory issues
  const BATCH_SIZE = 50;

  for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
    const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
    const texts = batch.map((b) => b.text);

    const results = await provider.embedBatch(texts);

    const records: EmbeddingRecord[] = [];

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j]!;
      const result = results.embeddings[j];
      if (!result) continue;

      records.push({
        id: item.entity.id,
        model: result.model,
        vector: result.embedding,
        textHash: item.hash,
        entityType: item.entity.entityType,
        destinationId: item.entity.destinationId,
        name: item.entity.name,
        createdAt: new Date().toISOString(),
      });

      generated++;
    }

    await saveEmbeddingsBatch(records);
  }

  logger.info("Embeddings batch complete", { generated });
  return generated;
}
