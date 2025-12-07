/**
 * Entity Change History
 *
 * Tracks changes to Disney entities over time for:
 * - Refurbishments and closures
 * - New attractions/restaurants opening
 * - Name changes
 * - Attribute changes (height requirements, pricing, etc.)
 */

import { getDatabase, persistDatabase } from "./database.js";
import { createLogger } from "../shared/logger.js";
import type { DisneyEntity, DestinationId, EntityType } from "../types/index.js";

const logger = createLogger("History");

/** Change type classification */
export type ChangeType = "created" | "updated" | "deleted";

/** Represents a single change record */
export interface EntityChange {
  readonly id: number;
  readonly entityId: string;
  readonly changeType: ChangeType;
  readonly oldData: DisneyEntity | null;
  readonly newData: DisneyEntity | null;
  readonly changedFields: string[];
  readonly detectedAt: string;
}

/** Summary of changes for an entity */
export interface EntityChangeSummary {
  readonly entityId: string;
  readonly entityName: string;
  readonly entityType: EntityType;
  readonly changeCount: number;
  readonly lastChange: EntityChange;
  readonly firstSeen: string;
}

/** Filter options for querying history */
export interface HistoryQueryOptions {
  readonly entityId?: string;
  readonly destinationId?: DestinationId;
  readonly entityType?: EntityType;
  readonly changeType?: ChangeType;
  readonly since?: string;
  readonly until?: string;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Fields to track for change detection.
 * Excludes frequently changing or unimportant fields.
 */
const TRACKED_FIELDS: Record<string, string[]> = {
  ATTRACTION: [
    "name",
    "heightRequirement",
    "thrillLevel",
    "experienceType",
    "duration",
    "lightningLane",
    "singleRider",
    "riderSwap",
    "virtualQueue",
    "tags",
  ],
  RESTAURANT: [
    "name",
    "serviceType",
    "mealPeriods",
    "cuisineTypes",
    "priceRange",
    "mobileOrder",
    "reservationsRequired",
    "characterDining",
    "tags",
  ],
  SHOW: ["name", "showType", "duration", "tags"],
  SHOP: ["name", "shopType", "tags"],
  EVENT: ["name", "eventType", "tags"],
  HOTEL: ["name", "tier", "area", "transportation", "amenities", "tags"],
  DEFAULT: ["name", "tags"],
};

/**
 * Detect changes between two entity versions.
 * Returns array of changed field names.
 */
export function detectChanges(
  oldEntity: DisneyEntity | null,
  newEntity: DisneyEntity
): string[] {
  if (!oldEntity) {
    return ["*"]; // New entity - all fields are "changed"
  }

  const trackedFields =
    TRACKED_FIELDS[newEntity.entityType] ?? TRACKED_FIELDS.DEFAULT ?? [];
  const changedFields: string[] = [];

  for (const field of trackedFields) {
    const oldValue = (oldEntity as unknown as Record<string, unknown>)[field];
    const newValue = (newEntity as unknown as Record<string, unknown>)[field];

    // Deep comparison for objects/arrays
    if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
      changedFields.push(field);
    }
  }

  return changedFields;
}

/**
 * Record a change to an entity.
 */
export async function recordChange(
  entityId: string,
  changeType: ChangeType,
  oldData: DisneyEntity | null,
  newData: DisneyEntity | null,
  changedFields: string[]
): Promise<void> {
  if (changedFields.length === 0 && changeType === "updated") {
    // No meaningful changes detected
    return;
  }

  const db = await getDatabase();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO entity_history
     (entity_id, change_type, old_data, new_data, changed_fields, detected_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      entityId,
      changeType,
      oldData ? JSON.stringify(oldData) : null,
      newData ? JSON.stringify(newData) : null,
      JSON.stringify(changedFields),
      now,
    ]
  );

  persistDatabase();

  const entityName = newData?.name ?? oldData?.name ?? entityId;
  logger.info("Change recorded", {
    entityId,
    entityName,
    changeType,
    changedFields,
  });
}

/**
 * Get history for a specific entity.
 */
export async function getEntityHistory(
  entityId: string,
  limit = 50
): Promise<EntityChange[]> {
  const db = await getDatabase();

  const result = db.exec(
    `SELECT id, entity_id, change_type, old_data, new_data, changed_fields, detected_at
     FROM entity_history
     WHERE entity_id = ?
     ORDER BY detected_at DESC
     LIMIT ?`,
    [entityId, limit]
  );

  return parseHistoryResults(result);
}

/**
 * Query history with filters.
 */
export async function queryHistory(
  options: HistoryQueryOptions = {}
): Promise<EntityChange[]> {
  const db = await getDatabase();
  const limit = options.limit ?? 100;
  const offset = options.offset ?? 0;

  let sql = `
    SELECT h.id, h.entity_id, h.change_type, h.old_data, h.new_data, h.changed_fields, h.detected_at
    FROM entity_history h
  `;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  // Join with entities table if filtering by destination or type
  if (options.destinationId ?? options.entityType) {
    sql = `
      SELECT h.id, h.entity_id, h.change_type, h.old_data, h.new_data, h.changed_fields, h.detected_at
      FROM entity_history h
      LEFT JOIN entities e ON h.entity_id = e.id
    `;

    if (options.destinationId) {
      conditions.push("e.destination_id = ?");
      params.push(options.destinationId);
    }

    if (options.entityType) {
      conditions.push("e.entity_type = ?");
      params.push(options.entityType);
    }
  }

  if (options.entityId) {
    conditions.push("h.entity_id = ?");
    params.push(options.entityId);
  }

  if (options.changeType) {
    conditions.push("h.change_type = ?");
    params.push(options.changeType);
  }

  if (options.since) {
    conditions.push("h.detected_at >= ?");
    params.push(options.since);
  }

  if (options.until) {
    conditions.push("h.detected_at <= ?");
    params.push(options.until);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " ORDER BY h.detected_at DESC LIMIT ? OFFSET ?";
  params.push(limit, offset);

  const result = db.exec(sql, params);
  return parseHistoryResults(result);
}

/**
 * Get recent changes (last N days).
 */
export async function getRecentChanges(
  days = 7,
  options: Omit<HistoryQueryOptions, "since"> = {}
): Promise<EntityChange[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);

  return queryHistory({
    ...options,
    since: since.toISOString(),
  });
}

/**
 * Get change summaries grouped by entity.
 */
export async function getChangeSummaries(
  options: HistoryQueryOptions = {}
): Promise<EntityChangeSummary[]> {
  const db = await getDatabase();

  let sql = `
    SELECT
      h.entity_id,
      e.name as entity_name,
      e.entity_type,
      COUNT(*) as change_count,
      MAX(h.detected_at) as last_change,
      MIN(h.detected_at) as first_seen
    FROM entity_history h
    LEFT JOIN entities e ON h.entity_id = e.id
  `;

  const conditions: string[] = [];
  const params: (string | number)[] = [];

  if (options.destinationId) {
    conditions.push("e.destination_id = ?");
    params.push(options.destinationId);
  }

  if (options.entityType) {
    conditions.push("e.entity_type = ?");
    params.push(options.entityType);
  }

  if (options.changeType) {
    conditions.push("h.change_type = ?");
    params.push(options.changeType);
  }

  if (options.since) {
    conditions.push("h.detected_at >= ?");
    params.push(options.since);
  }

  if (conditions.length > 0) {
    sql += " WHERE " + conditions.join(" AND ");
  }

  sql += " GROUP BY h.entity_id ORDER BY last_change DESC";

  if (options.limit) {
    sql += ` LIMIT ${options.limit}`;
  }

  const result = db.exec(sql, params);

  const firstResult = result[0];
  if (!firstResult) {
    return [];
  }

  const summaries: EntityChangeSummary[] = [];

  for (const row of firstResult.values) {
    if (!row) continue;

    const entityId = String(row[0]);
    const lastChangeHistory = await getEntityHistory(entityId, 1);
    const lastChange = lastChangeHistory[0];

    if (lastChange) {
      summaries.push({
        entityId,
        entityName: String(row[1] ?? "Unknown"),
        entityType: String(row[2] ?? "ATTRACTION") as EntityType,
        changeCount: Number(row[3]),
        lastChange,
        firstSeen: String(row[5]),
      });
    }
  }

  return summaries;
}

/**
 * Get statistics about tracked changes.
 */
export async function getHistoryStats(): Promise<{
  totalChanges: number;
  byType: Record<ChangeType, number>;
  byEntityType: Record<string, number>;
  oldestChange: string | null;
  newestChange: string | null;
}> {
  const db = await getDatabase();

  const totalResult = db.exec("SELECT COUNT(*) FROM entity_history");
  const totalChanges = (totalResult[0]?.values[0]?.[0] as number) ?? 0;

  const byTypeResult = db.exec(`
    SELECT change_type, COUNT(*) as count
    FROM entity_history
    GROUP BY change_type
  `);

  const byType: Record<ChangeType, number> = {
    created: 0,
    updated: 0,
    deleted: 0,
  };

  if (byTypeResult[0]) {
    for (const row of byTypeResult[0].values) {
      if (row) {
        byType[String(row[0]) as ChangeType] = Number(row[1]);
      }
    }
  }

  const byEntityTypeResult = db.exec(`
    SELECT e.entity_type, COUNT(*) as count
    FROM entity_history h
    LEFT JOIN entities e ON h.entity_id = e.id
    GROUP BY e.entity_type
  `);

  const byEntityType: Record<string, number> = {};
  if (byEntityTypeResult[0]) {
    for (const row of byEntityTypeResult[0].values) {
      if (row && row[0]) {
        byEntityType[String(row[0])] = Number(row[1]);
      }
    }
  }

  const datesResult = db.exec(`
    SELECT MIN(detected_at), MAX(detected_at) FROM entity_history
  `);

  const oldestChange = datesResult[0]?.values[0]?.[0]
    ? String(datesResult[0].values[0][0])
    : null;
  const newestChange = datesResult[0]?.values[0]?.[1]
    ? String(datesResult[0].values[0][1])
    : null;

  return {
    totalChanges,
    byType,
    byEntityType,
    oldestChange,
    newestChange,
  };
}

/**
 * Parse SQL results into EntityChange objects.
 */
function parseHistoryResults(
  result: Array<{ columns: string[]; values: unknown[][] }>
): EntityChange[] {
  const firstResult = result[0];
  if (!firstResult) {
    return [];
  }

  const changes: EntityChange[] = [];

  for (const row of firstResult.values) {
    if (!row) continue;

    try {
      changes.push({
        id: Number(row[0]),
        entityId: String(row[1]),
        changeType: String(row[2]) as ChangeType,
        oldData: row[3] ? JSON.parse(String(row[3])) : null,
        newData: row[4] ? JSON.parse(String(row[4])) : null,
        changedFields: JSON.parse(String(row[5])),
        detectedAt: String(row[6]),
      });
    } catch {
      // Skip malformed entries
    }
  }

  return changes;
}

/**
 * Purge old history entries.
 * Keeps the most recent N entries per entity.
 */
export async function purgeOldHistory(keepPerEntity = 100): Promise<number> {
  const db = await getDatabase();

  // Get entities with more than keepPerEntity history entries
  const countResult = db.exec(`
    SELECT entity_id, COUNT(*) as cnt
    FROM entity_history
    GROUP BY entity_id
    HAVING cnt > ?
  `, [keepPerEntity]);

  if (!countResult[0]) {
    return 0;
  }

  let purgedCount = 0;

  for (const row of countResult[0].values) {
    if (!row) continue;

    const entityId = String(row[0]);
    const totalCount = Number(row[1]);
    const toDelete = totalCount - keepPerEntity;

    if (toDelete > 0) {
      db.run(`
        DELETE FROM entity_history
        WHERE entity_id = ?
        AND id IN (
          SELECT id FROM entity_history
          WHERE entity_id = ?
          ORDER BY detected_at ASC
          LIMIT ?
        )
      `, [entityId, entityId, toDelete]);

      purgedCount += toDelete;
    }
  }

  if (purgedCount > 0) {
    persistDatabase();
    logger.info("Purged old history entries", { purgedCount });
  }

  return purgedCount;
}
