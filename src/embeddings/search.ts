/**
 * Semantic Vector Search
 *
 * Performs vector similarity search using LanceDB.
 */

import type { DisneyEntity, DestinationId, EntityType } from "../types/index.js";
import { getEmbeddingProvider } from "./index.js";
import {
  DEFAULT_SEARCH_LIMIT,
  DEFAULT_MIN_SIMILARITY_SCORE,
  SEMANTIC_SEARCH_LIMIT_MULTIPLIER,
  EMBEDDING_BATCH_SIZE,
} from "../shared/constants.js";
import {
  vectorSearch,
  saveEmbedding,
  saveEmbeddingsBatch,
  isEmbeddingStale,
  type EmbeddingRecord,
} from "../vectordb/index.js";
import { getEntityById } from "../db/entities.js";
import { buildEmbeddingText, hashEmbeddingText } from "./text-builder.js";
import { createLogger } from "../shared/logger.js";
import { withSpan, SpanAttributes, SpanOperations } from "../shared/index.js";

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
  return withSpan(`embedding.semantic-search`, SpanOperations.EMBEDDING_SEARCH, async (span) => {
    const { limit = DEFAULT_SEARCH_LIMIT, minScore = DEFAULT_MIN_SIMILARITY_SCORE } = options;

    span?.setAttribute("search.query", query);
    span?.setAttribute("search.limit", limit);
    span?.setAttribute("search.min_score", minScore);
    if (options.entityType) {
      span?.setAttribute(SpanAttributes.DISNEY_ENTITY_TYPE, options.entityType);
    }
    if (options.destinationId) {
      span?.setAttribute(SpanAttributes.DISNEY_DESTINATION, options.destinationId);
    }

    logger.debug("Semantic search", { query, options });

    // Get embedding provider
    const provider = await getEmbeddingProvider();

    // Generate query embedding
    const queryResult = await provider.embed(query);
    const queryVector = queryResult.embedding;

    // Search LanceDB with filters
    const searchResults = await vectorSearch(queryVector, provider.fullModelName, {
      limit: limit * SEMANTIC_SEARCH_LIMIT_MULTIPLIER,
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

    span?.setAttribute("search.results_count", results.length);
    if (results[0]) {
      span?.setAttribute("search.top_score", results[0].score);
    }

    logger.debug("Semantic search complete", {
      query,
      resultsCount: results.length,
      topScore: results[0]?.score,
    });

    return results;
  });
}

/**
 * Ensure entity has an up-to-date embedding.
 * Generates embedding if missing or stale.
 */
export async function ensureEmbedding(entity: DisneyEntity): Promise<void> {
  return withSpan(`embedding.ensure`, SpanOperations.EMBEDDING_GENERATE, async (span) => {
    span?.setAttribute(SpanAttributes.DISNEY_ENTITY_ID, entity.id);
    span?.setAttribute(SpanAttributes.DISNEY_ENTITY_TYPE, entity.entityType);
    span?.setAttribute(SpanAttributes.DISNEY_DESTINATION, entity.destinationId);

    const provider = await getEmbeddingProvider();
    const text = buildEmbeddingText(entity);
    const hash = hashEmbeddingText(text);

    // Check if embedding exists and is current
    if (!(await isEmbeddingStale(entity.id, provider.fullModelName, hash))) {
      span?.setAttribute("embedding.cached", true);
      return; // Embedding is current
    }

    span?.setAttribute("embedding.cached", false);
    span?.setAttribute(SpanAttributes.EMBEDDING_PROVIDER, provider.providerId);
    span?.setAttribute(SpanAttributes.EMBEDDING_MODEL, provider.modelId);

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
  });
}

/**
 * Generate embeddings for multiple entities (batch).
 * More efficient than individual calls for bulk operations.
 */
export async function ensureEmbeddingsBatch(entities: DisneyEntity[]): Promise<number> {
  return withSpan(`embedding.ensure-batch`, SpanOperations.EMBEDDING_GENERATE, async (span) => {
    span?.setAttribute("embedding.total_entities", entities.length);

    const provider = await getEmbeddingProvider();
    let generated = 0;

    span?.setAttribute(SpanAttributes.EMBEDDING_PROVIDER, provider.providerId);
    span?.setAttribute(SpanAttributes.EMBEDDING_MODEL, provider.modelId);

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

    span?.setAttribute("embedding.needs_generation", needsEmbedding.length);
    span?.setAttribute("embedding.cached", entities.length - needsEmbedding.length);

    if (needsEmbedding.length === 0) {
      return 0;
    }

    logger.info("Generating embeddings batch", {
      count: needsEmbedding.length,
      model: provider.fullModelName,
    });

    // Process in batches to avoid memory issues
    for (let i = 0; i < needsEmbedding.length; i += EMBEDDING_BATCH_SIZE) {
      const batch = needsEmbedding.slice(i, i + EMBEDDING_BATCH_SIZE);
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

    span?.setAttribute("embedding.generated", generated);

    logger.info("Embeddings batch complete", { generated });
    return generated;
  });
}
