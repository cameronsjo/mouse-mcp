/**
 * Entity Storage
 *
 * SQLite storage for Disney entities.
 * Uses Fuse.js for fuzzy search (FTS5 not available in sql.js).
 */

import { getDatabase, persistDatabase } from "./database.js";
import { createLogger } from "../shared/logger.js";
import { fuzzySearch } from "../shared/fuzzy-match.js";
import { getEntityEmitter } from "../events/entity-events.js";
import { withSpan, SpanAttributes, SpanOperations } from "../shared/index.js";
import type {
  DisneyEntity,
  DisneyAttraction,
  DisneyDining,
  DisneyShow,
  DisneyShop,
  DisneyEvent,
  DestinationId,
  EntityType,
} from "../types/index.js";

const logger = createLogger("Entities");

/**
 * Save an entity (insert or update).
 * Emits 'entity:saved' event to trigger async embedding generation.
 */
export async function saveEntity(entity: DisneyEntity): Promise<void> {
  return withSpan(`entity.save ${entity.id}`, SpanOperations.DB_INSERT, async (span) => {
    span?.setAttribute(SpanAttributes.DB_SYSTEM, "sqlite");
    span?.setAttribute(SpanAttributes.DB_OPERATION, "INSERT OR REPLACE");
    span?.setAttribute(SpanAttributes.DISNEY_ENTITY_ID, entity.id);
    span?.setAttribute(SpanAttributes.DISNEY_ENTITY_TYPE, entity.entityType);
    span?.setAttribute(SpanAttributes.DISNEY_DESTINATION, entity.destinationId);

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

    // Emit event for embedding generation (fire-and-forget)
    const emitter = getEntityEmitter();
    emitter.emitEvent("entity:saved", { entity, timestamp: now });
  });
}

/**
 * Save multiple entities in a batch.
 * Emits 'entity:batch-saved' event to trigger async batch embedding generation.
 */
export async function saveEntities(entities: DisneyEntity[]): Promise<void> {
  return withSpan("entity.save-batch", SpanOperations.DB_INSERT, async (span) => {
    span?.setAttribute(SpanAttributes.DB_SYSTEM, "sqlite");
    span?.setAttribute(SpanAttributes.DB_OPERATION, "INSERT OR REPLACE");
    span?.setAttribute("entity.batch_size", entities.length);

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

    // Emit event for batch embedding generation (fire-and-forget)
    const emitter = getEntityEmitter();
    emitter.emitEvent("entity:batch-saved", { entities, count: entities.length, timestamp: now });
  });
}

/**
 * Get an entity by ID.
 */
export async function getEntityById<T extends DisneyEntity>(id: string): Promise<T | null> {
  return withSpan(`entity.get ${id}`, SpanOperations.DB_QUERY, async (span) => {
    span?.setAttribute(SpanAttributes.DB_SYSTEM, "sqlite");
    span?.setAttribute(SpanAttributes.DB_OPERATION, "SELECT");
    span?.setAttribute(SpanAttributes.DISNEY_ENTITY_ID, id);

    const db = await getDatabase();

    const result = db.exec("SELECT data FROM entities WHERE id = ?", [id]);

    const firstResult = result[0];
    if (!firstResult || firstResult.values.length === 0) {
      span?.setAttribute("entity.found", false);
      return null;
    }

    const firstRow = firstResult.values[0];
    if (!firstRow) {
      span?.setAttribute("entity.found", false);
      return null;
    }

    try {
      const entity = JSON.parse(String(firstRow[0])) as T;
      span?.setAttribute("entity.found", true);
      span?.setAttribute(SpanAttributes.DISNEY_ENTITY_TYPE, entity.entityType);
      return entity;
    } catch {
      span?.setAttribute("entity.found", false);
      return null;
    }
  });
}

/**
 * Get entities by destination and optional type filter.
 */
export async function getEntities<T extends DisneyEntity>(options: {
  destinationId: DestinationId;
  entityType?: EntityType;
  parkId?: string;
}): Promise<T[]> {
  return withSpan("entity.get-many", SpanOperations.DB_QUERY, async (span) => {
    span?.setAttribute(SpanAttributes.DB_SYSTEM, "sqlite");
    span?.setAttribute(SpanAttributes.DB_OPERATION, "SELECT");
    span?.setAttribute(SpanAttributes.DISNEY_DESTINATION, options.destinationId);

    if (options.entityType) {
      span?.setAttribute(SpanAttributes.DISNEY_ENTITY_TYPE, options.entityType);
    }
    if (options.parkId) {
      span?.setAttribute(SpanAttributes.DISNEY_PARK, options.parkId);
    }

    const db = await getDatabase();

    let sql = "SELECT data FROM entities WHERE destination_id = ?";
    const params: Array<string | null> = [options.destinationId];

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
      span?.setAttribute("entity.count", 0);
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

    span?.setAttribute("entity.count", entities.length);
    return entities;
  });
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
 * Get shops for a destination.
 */
export async function getShops(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyShop[]> {
  return getEntities<DisneyShop>({
    destinationId,
    entityType: "SHOP",
    parkId,
  });
}

/**
 * Get events/tours for a destination.
 */
export async function getEvents(
  destinationId: DestinationId,
  parkId?: string
): Promise<DisneyEvent[]> {
  return getEntities<DisneyEvent>({
    destinationId,
    entityType: "EVENT",
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
  return withSpan("entity.search", SpanOperations.DB_QUERY, async (span) => {
    span?.setAttribute(SpanAttributes.DB_SYSTEM, "sqlite");
    span?.setAttribute(SpanAttributes.DB_OPERATION, "SELECT");
    span?.setAttribute("search.query", query);
    span?.setAttribute("search.limit", options.limit ?? 20);

    if (options.destinationId) {
      span?.setAttribute(SpanAttributes.DISNEY_DESTINATION, options.destinationId);
    }
    if (options.entityType) {
      span?.setAttribute(SpanAttributes.DISNEY_ENTITY_TYPE, options.entityType);
    }

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
      span?.setAttribute("search.candidates", 0);
      span?.setAttribute("search.results", 0);
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

    span?.setAttribute("search.candidates", entities.length);

    // Use Fuse.js for fuzzy search
    const searchResults = fuzzySearch(query, entities, { limit });

    span?.setAttribute("search.results", searchResults.length);
    logger.debug("Fuzzy search completed", { query, count: searchResults.length });
    return searchResults.map((r) => r.entity);
  });
}

/**
 * Delete all entities for a destination.
 * Emits 'entity:deleted' event to trigger cleanup of related embeddings.
 */
export async function deleteEntitiesForDestination(destinationId: DestinationId): Promise<number> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const countResult = db.exec("SELECT COUNT(*) FROM entities WHERE destination_id = ?", [
    destinationId,
  ]);
  const count = (countResult[0]?.values[0]?.[0] as number) ?? 0;

  db.run("DELETE FROM entities WHERE destination_id = ?", [destinationId]);
  persistDatabase();

  logger.info("Deleted entities for destination", { destinationId, count });

  // Emit event for cleanup of embeddings
  if (count > 0) {
    const emitter = getEntityEmitter();
    emitter.emitEvent("entity:deleted", { destinationId, count, timestamp: now });
  }

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
    SHOP: 0,
    EVENT: 0,
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
