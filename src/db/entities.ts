/**
 * Entity Storage
 *
 * SQLite storage for Disney entities.
 * Uses Fuse.js for fuzzy search (FTS5 not available in sql.js).
 */

import { getDatabase, persistDatabase } from "./database.js";
import { createLogger } from "../shared/logger.js";
import { fuzzySearch } from "../shared/fuzzy-match.js";
import type {
  DisneyEntity,
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DestinationId,
  EntityType,
} from "../types/index.js";

const logger = createLogger("Entities");

/**
 * Lazy-load embedding functions to avoid circular imports.
 * Embedding generation happens asynchronously after entity save.
 */
async function generateEmbeddingAsync(entity: DisneyEntity): Promise<void> {
  try {
    const { ensureEmbedding } = await import("../embeddings/search.js");
    await ensureEmbedding(entity);
  } catch (error) {
    logger.warn("Failed to generate embedding", { entityId: entity.id, error });
  }
}

async function generateEmbeddingsBatchAsync(entities: DisneyEntity[]): Promise<void> {
  try {
    const { ensureEmbeddingsBatch } = await import("../embeddings/search.js");
    await ensureEmbeddingsBatch(entities);
  } catch (error) {
    logger.warn("Failed to generate embeddings batch", { count: entities.length, error });
  }
}

/**
 * Save an entity (insert or update).
 * Triggers async embedding generation for semantic search.
 */
export async function saveEntity(entity: DisneyEntity): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  db.run(
    `INSERT OR REPLACE INTO entities
     (id, name, slug, entity_type, destination_id, park_id, park_name, data, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      entity.id,
      entity.name,
      entity.slug,
      entity.entityType,
      entity.destinationId,
      entity.parkId,
      entity.parkName,
      JSON.stringify(entity),
      now,
    ]
  );

  persistDatabase();

  // Fire-and-forget embedding generation
  void generateEmbeddingAsync(entity);
}

/**
 * Save multiple entities in a batch.
 * Triggers async batch embedding generation for semantic search.
 */
export async function saveEntities(entities: DisneyEntity[]): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  for (const entity of entities) {
    db.run(
      `INSERT OR REPLACE INTO entities
       (id, name, slug, entity_type, destination_id, park_id, park_name, data, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        entity.id,
        entity.name,
        entity.slug,
        entity.entityType,
        entity.destinationId,
        entity.parkId,
        entity.parkName,
        JSON.stringify(entity),
        now,
      ]
    );
  }

  persistDatabase();
  logger.debug("Saved entities", { count: entities.length });

  // Fire-and-forget batch embedding generation
  void generateEmbeddingsBatchAsync(entities);
}

/**
 * Get an entity by ID.
 */
export async function getEntityById<T extends DisneyEntity>(id: string): Promise<T | null> {
  const db = await getDatabase();

  const result = db.exec("SELECT data FROM entities WHERE id = ?", [id]);

  const firstResult = result[0];
  if (!firstResult || firstResult.values.length === 0) {
    return null;
  }

  const firstRow = firstResult.values[0];
  if (!firstRow) {
    return null;
  }

  try {
    return JSON.parse(String(firstRow[0])) as T;
  } catch {
    return null;
  }
}

/**
 * Get entities by destination and optional type filter.
 */
export async function getEntities<T extends DisneyEntity>(options: {
  destinationId: DestinationId;
  entityType?: EntityType;
  parkId?: string;
}): Promise<T[]> {
  const db = await getDatabase();

  let sql = "SELECT data FROM entities WHERE destination_id = ?";
  const params: (string | null)[] = [options.destinationId];

  if (options.entityType) {
    sql += " AND entity_type = ?";
    params.push(options.entityType);
  }

  if (options.parkId) {
    sql += " AND park_id = ?";
    params.push(options.parkId);
  }

  sql += " ORDER BY name";

  const result = db.exec(sql, params);

  const firstResult = result[0];
  if (!firstResult) {
    return [];
  }

  const entities: T[] = [];
  for (const row of firstResult.values) {
    if (!row) continue;
    try {
      entities.push(JSON.parse(String(row[0])) as T);
    } catch {
      // Skip invalid entries
    }
  }

  return entities;
}

/**
 * Get attractions for a destination.
 */
export async function getAttractions(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyAttraction[]> {
  return getEntities<DisneyAttraction>({
    destinationId,
    entityType: "ATTRACTION",
    parkId,
  });
}

/**
 * Get dining locations for a destination.
 */
export async function getDining(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyDining[]> {
  return getEntities<DisneyDining>({
    destinationId,
    entityType: "RESTAURANT",
    parkId,
  });
}

/**
 * Get shows/entertainment for a destination.
 */
export async function getShows(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyShow[]> {
  return getEntities<DisneyShow>({
    destinationId,
    entityType: "SHOW",
    parkId,
  });
}

/**
 * Search entities by name using fuzzy matching.
 * (FTS5 not available in sql.js - using Fuse.js instead)
 */
export async function searchEntitiesByName<T extends DisneyEntity>(
  query: string,
  options: {
    destinationId?: DestinationId;
    entityType?: EntityType;
    limit?: number;
  } = {}
): Promise<T[]> {
  const db = await getDatabase();
  const limit = options.limit ?? 20;

  // Build query to get candidates
  let sql = "SELECT data FROM entities WHERE 1=1";
  const params: string[] = [];

  if (options.destinationId) {
    sql += " AND destination_id = ?";
    params.push(options.destinationId);
  }

  if (options.entityType) {
    sql += " AND entity_type = ?";
    params.push(options.entityType);
  }

  const result = db.exec(sql, params);

  const firstResult = result[0];
  if (!firstResult) {
    return [];
  }

  // Parse all entities
  const entities: T[] = [];
  for (const row of firstResult.values) {
    if (!row) continue;
    try {
      entities.push(JSON.parse(String(row[0])) as T);
    } catch {
      // Skip invalid
    }
  }

  // Use Fuse.js for fuzzy search
  const searchResults = fuzzySearch(query, entities, { limit });

  logger.debug("Fuzzy search completed", { query, count: searchResults.length });
  return searchResults.map((r) => r.entity);
}

/**
 * Delete all entities for a destination.
 */
export async function deleteEntitiesForDestination(
  destinationId: DestinationId
): Promise<number> {
  const db = await getDatabase();

  const countResult = db.exec(
    "SELECT COUNT(*) FROM entities WHERE destination_id = ?",
    [destinationId]
  );
  const count = countResult[0]?.values[0]?.[0] as number ?? 0;

  db.run("DELETE FROM entities WHERE destination_id = ?", [destinationId]);
  persistDatabase();

  logger.info("Deleted entities for destination", { destinationId, count });
  return count;
}

/**
 * Get entity count by type for a destination.
 */
export async function getEntityCounts(
  destinationId: DestinationId
): Promise<Record<EntityType, number>> {
  const db = await getDatabase();

  const result = db.exec(
    `SELECT entity_type, COUNT(*) as count
     FROM entities
     WHERE destination_id = ?
     GROUP BY entity_type`,
    [destinationId]
  );

  const counts: Record<string, number> = {
    DESTINATION: 0,
    PARK: 0,
    ATTRACTION: 0,
    RESTAURANT: 0,
    SHOW: 0,
    HOTEL: 0,
  };

  const firstResult = result[0];
  if (firstResult) {
    for (const row of firstResult.values) {
      if (row) {
        counts[String(row[0])] = Number(row[1]);
      }
    }
  }

  return counts as Record<EntityType, number>;
}
