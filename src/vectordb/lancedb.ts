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
    await table.delete(`id = '${record.id}' AND model = '${record.model}'`);
  } catch {
    // Ignore delete errors (record might not exist)
  }

  await table.add([record]);
  logger.debug("Saved embedding", { id: record.id, model: record.model });
}

/**
 * Save multiple embeddings in batch.
 */
export async function saveEmbeddingsBatch(records: EmbeddingRecord[]): Promise<void> {
  if (records.length === 0) return;

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
  const deleteConditions = records.map((r) => `(id = '${r.id}' AND model = '${r.model}')`);

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
    const results = await table
      .query()
      .where(`id = '${entityId}' AND model = '${model}'`)
      .limit(1)
      .toArray();

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
  const { limit = 10, entityType, destinationId } = options;

  try {
    const table = await getTable();

    // Build filter for model + optional filters
    const filters: string[] = [`model = '${model}'`];
    if (entityType) filters.push(`entityType = '${entityType}'`);
    if (destinationId) filters.push(`destinationId = '${destinationId}'`);

    const whereClause = filters.join(" AND ");

    const results = await table.vectorSearch(queryVector).where(whereClause).limit(limit).toArray();

    return results as unknown as VectorSearchResult[];
  } catch (error) {
    if (error instanceof Error && error.message === "TABLE_NOT_EXISTS") {
      return [];
    }
    throw error;
  }
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
    const whereClause = model ? `id = '${entityId}' AND model = '${model}'` : `id = '${entityId}'`;
    await table.delete(whereClause);
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
