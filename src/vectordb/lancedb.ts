/**
 * LanceDB Vector Database
 *
 * Embedded vector database for semantic search.
 * Supports multiple embedding models in the same database.
 */

import * as lancedb from "@lancedb/lancedb";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { mkdir } from "node:fs/promises";
import { createLogger } from "../shared/logger.js";
import { withSpan, SpanAttributes, SpanOperations } from "../shared/index.js";
import { escapeSqlIdentifier, escapeSqlValue } from "./sql-escaping.js";

const logger = createLogger("LanceDB");

/** Embedding record stored in LanceDB */
export interface EmbeddingRecord {
  /** Entity ID (e.g., attraction ID) */
  id: string;
  /** Embedding model used (e.g., "transformers:all-MiniLM-L6-v2") */
  model: string;
  /** Vector embedding */
  vector: number[];
  /** Hash of input text (for staleness detection) */
  textHash: string;
  /** Entity type for filtering */
  entityType: string;
  /** Destination ID for filtering */
  destinationId: string;
  /** Entity name (for debugging) */
  name: string;
  /** Timestamp */
  createdAt: string;
  /** Index signature for LanceDB compatibility */
  [key: string]: unknown;
}

/** Search result from LanceDB */
export interface VectorSearchResult {
  id: string;
  model: string;
  entityType: string;
  destinationId: string;
  name: string;
  /** Distance score (lower = more similar) */
  _distance: number;
}

const TABLE_NAME = "embeddings";

let db: lancedb.Connection | null = null;
let dbPath: string | null = null;

/**
 * Get the LanceDB database path.
 * Uses project-local .data/lancedb directory.
 */
function getDbPath(): string {
  if (dbPath) return dbPath;
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  dbPath = join(projectRoot, ".data", "lancedb");
  return dbPath;
}

/**
 * Connect to LanceDB (creates if not exists).
 */
export async function connectLanceDB(): Promise<lancedb.Connection> {
  if (db) return db;

  const path = getDbPath();

  // Ensure directory exists
  await mkdir(path, { recursive: true });

  logger.info("Connecting to LanceDB", { path });
  db = await lancedb.connect(path);

  return db;
}

/**
 * Get or create the embeddings table.
 */
async function getTable(): Promise<lancedb.Table> {
  const conn = await connectLanceDB();
  const tableNames = await conn.tableNames();

  if (tableNames.includes(TABLE_NAME)) {
    return conn.openTable(TABLE_NAME);
  }

  // Table doesn't exist - will be created on first insert
  logger.info("Embeddings table will be created on first insert");
  throw new Error("TABLE_NOT_EXISTS");
}

/**
 * Save an embedding to LanceDB.
 * Upserts based on (id, model) composite key.
 */
export async function saveEmbedding(record: EmbeddingRecord): Promise<void> {
  return withSpan(`vectordb.save-embedding`, SpanOperations.DB_INSERT, async (span) => {
    span?.setAttribute(SpanAttributes.DB_SYSTEM, "lancedb");
    span?.setAttribute(SpanAttributes.DB_OPERATION, "upsert");
    span?.setAttribute(SpanAttributes.DISNEY_ENTITY_ID, record.id);
    span?.setAttribute(SpanAttributes.DISNEY_ENTITY_TYPE, record.entityType);
    span?.setAttribute(SpanAttributes.EMBEDDING_MODEL, record.model);
    span?.setAttribute(SpanAttributes.EMBEDDING_DIMENSIONS, record.vector.length);

    const conn = await connectLanceDB();
    const tableNames = await conn.tableNames();

    if (!tableNames.includes(TABLE_NAME)) {
      // Create table with first record
      logger.info("Creating embeddings table");
      await conn.createTable(TABLE_NAME, [record]);
      return;
    }

    const table = await conn.openTable(TABLE_NAME);

    // Upsert: delete existing + insert new
    // LanceDB merge insert requires scanning, so we delete first for small datasets
    try {
      const deleteClause = `${escapeSqlIdentifier("id")} = '${escapeSqlValue(record.id)}' AND ${escapeSqlIdentifier("model")} = '${escapeSqlValue(record.model)}'`;
      await table.delete(deleteClause);
    } catch {
      // Ignore delete errors (record might not exist)
    }

    await table.add([record]);
    logger.debug("Saved embedding", { id: record.id, model: record.model });
  });
}

/**
 * Save multiple embeddings in batch.
 */
export async function saveEmbeddingsBatch(records: EmbeddingRecord[]): Promise<void> {
  return withSpan(`vectordb.save-embeddings-batch`, SpanOperations.DB_INSERT, async (span) => {
    if (records.length === 0) return;

    span?.setAttribute(SpanAttributes.DB_SYSTEM, "lancedb");
    span?.setAttribute(SpanAttributes.DB_OPERATION, "upsert_batch");
    span?.setAttribute(SpanAttributes.EMBEDDING_BATCH_SIZE, records.length);
    if (records[0]) {
      span?.setAttribute(SpanAttributes.EMBEDDING_MODEL, records[0].model);
      span?.setAttribute(SpanAttributes.EMBEDDING_DIMENSIONS, records[0].vector.length);
    }

    const conn = await connectLanceDB();
    const tableNames = await conn.tableNames();

    if (!tableNames.includes(TABLE_NAME)) {
      // Create table with first batch
      logger.info("Creating embeddings table with batch", { count: records.length });
      await conn.createTable(TABLE_NAME, records);
      return;
    }

    const table = await conn.openTable(TABLE_NAME);

    // Delete existing records for these IDs/models
    const deleteConditions = records.map(
      (r) =>
        `(${escapeSqlIdentifier("id")} = '${escapeSqlValue(r.id)}' AND ${escapeSqlIdentifier("model")} = '${escapeSqlValue(r.model)}')`
    );

    // Delete in chunks to avoid query length limits
    const CHUNK_SIZE = 50;
    for (let i = 0; i < deleteConditions.length; i += CHUNK_SIZE) {
      const chunk = deleteConditions.slice(i, i + CHUNK_SIZE);
      try {
        await table.delete(chunk.join(" OR "));
      } catch {
        // Ignore delete errors
      }
    }

    await table.add(records);
    logger.info("Saved embeddings batch", { count: records.length });
  });
}

/**
 * Get embedding for an entity and model.
 */
export async function getEmbedding(
  entityId: string,
  model: string
): Promise<EmbeddingRecord | null> {
  try {
    const table = await getTable();
    const whereClause = `${escapeSqlIdentifier("id")} = '${escapeSqlValue(entityId)}' AND ${escapeSqlIdentifier("model")} = '${escapeSqlValue(model)}'`;
    const results = await table.query().where(whereClause).limit(1).toArray();

    if (results.length === 0) return null;

    return results[0] as unknown as EmbeddingRecord;
  } catch (error) {
    if (error instanceof Error && error.message === "TABLE_NOT_EXISTS") {
      return null;
    }
    throw error;
  }
}

/**
 * Check if embedding is stale (text hash changed).
 */
export async function isEmbeddingStale(
  entityId: string,
  model: string,
  currentHash: string
): Promise<boolean> {
  const existing = await getEmbedding(entityId, model);
  if (!existing) return true;
  return existing.textHash !== currentHash;
}

/**
 * Perform vector similarity search.
 */
export async function vectorSearch(
  queryVector: number[],
  model: string,
  options: {
    limit?: number;
    entityType?: string;
    destinationId?: string;
  } = {}
): Promise<VectorSearchResult[]> {
  return withSpan(`vectordb.vector-search`, SpanOperations.DB_QUERY, async (span) => {
    const { limit = 10, entityType, destinationId } = options;

    span?.setAttribute(SpanAttributes.DB_SYSTEM, "lancedb");
    span?.setAttribute(SpanAttributes.DB_OPERATION, "vector_search");
    span?.setAttribute(SpanAttributes.EMBEDDING_MODEL, model);
    span?.setAttribute(SpanAttributes.EMBEDDING_DIMENSIONS, queryVector.length);
    span?.setAttribute("search.limit", limit);
    if (entityType) {
      span?.setAttribute(SpanAttributes.DISNEY_ENTITY_TYPE, entityType);
    }
    if (destinationId) {
      span?.setAttribute(SpanAttributes.DISNEY_DESTINATION, destinationId);
    }

    try {
      const table = await getTable();

      // Build filter for model + optional filters using proper SQL escaping
      const filters: string[] = [`${escapeSqlIdentifier("model")} = '${escapeSqlValue(model)}'`];
      if (entityType) {
        filters.push(`${escapeSqlIdentifier("entityType")} = '${escapeSqlValue(entityType)}'`);
      }
      if (destinationId) {
        filters.push(
          `${escapeSqlIdentifier("destinationId")} = '${escapeSqlValue(destinationId)}'`
        );
      }

      const whereClause = filters.join(" AND ");

      const results = await table
        .vectorSearch(queryVector)
        .where(whereClause)
        .limit(limit)
        .toArray();

      span?.setAttribute("search.results_count", results.length);

      return results as unknown as VectorSearchResult[];
    } catch (error) {
      if (error instanceof Error && error.message === "TABLE_NOT_EXISTS") {
        span?.setAttribute("search.results_count", 0);
        return [];
      }
      throw error;
    }
  });
}

/**
 * Get embedding statistics.
 */
export async function getEmbeddingStats(): Promise<{
  total: number;
  byModel: Record<string, number>;
}> {
  try {
    const table = await getTable();
    const allRecords = await table.query().toArray();

    const byModel: Record<string, number> = {};
    for (const record of allRecords) {
      const model = (record as unknown as EmbeddingRecord).model;
      byModel[model] = (byModel[model] ?? 0) + 1;
    }

    return {
      total: allRecords.length,
      byModel,
    };
  } catch (error) {
    if (error instanceof Error && error.message === "TABLE_NOT_EXISTS") {
      return { total: 0, byModel: {} };
    }
    throw error;
  }
}

/**
 * Delete embedding for an entity.
 */
export async function deleteEmbedding(entityId: string, model?: string): Promise<void> {
  try {
    const table = await getTable();
    const whereClause = model
      ? `${escapeSqlIdentifier("id")} = '${escapeSqlValue(entityId)}' AND ${escapeSqlIdentifier("model")} = '${escapeSqlValue(model)}'`
      : `${escapeSqlIdentifier("id")} = '${escapeSqlValue(entityId)}'`;
    await table.delete(whereClause);
  } catch (error) {
    if (error instanceof Error && error.message === "TABLE_NOT_EXISTS") {
      return;
    }
    throw error;
  }
}

/**
 * Delete all embeddings for a destination.
 * WHY: Called when entities are deleted to cleanup orphaned embeddings.
 */
export async function deleteEmbeddingsByDestination(destinationId: string): Promise<void> {
  try {
    const table = await getTable();
    await table.delete(
      `${escapeSqlIdentifier("destinationId")} = '${escapeSqlValue(destinationId)}'`
    );
    logger.info("Deleted embeddings for destination", { destinationId });
  } catch (error) {
    if (error instanceof Error && error.message === "TABLE_NOT_EXISTS") {
      return;
    }
    throw error;
  }
}

/**
 * Close the database connection.
 */
export async function closeLanceDB(): Promise<void> {
  if (db) {
    // LanceDB connection doesn't have explicit close
    db = null;
    logger.info("LanceDB connection closed");
  }
}
