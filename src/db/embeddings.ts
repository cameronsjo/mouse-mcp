/**
 * Embedding Storage
 *
 * SQLite storage for entity embeddings.
 */

import { getDatabase, persistDatabase } from "./database.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("EmbeddingStorage");

export interface StoredEmbedding {
  readonly entityId: string;
  readonly embedding: number[];
  readonly model: string;
  readonly dimension: number;
  readonly inputTextHash: string;
  readonly createdAt: string;
}

/**
 * Save an embedding for an entity.
 */
export async function saveEmbedding(
  entityId: string,
  embedding: number[],
  model: string,
  dimension: number,
  inputTextHash: string
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  db.run(
    `INSERT OR REPLACE INTO embeddings
     (entity_id, embedding, embedding_model, embedding_dim, input_text_hash, created_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [entityId, JSON.stringify(embedding), model, dimension, inputTextHash, now]
  );

  persistDatabase();
  logger.debug("Saved embedding", { entityId, model, dimension });
}

/**
 * Get embedding for an entity.
 */
export async function getEmbedding(entityId: string): Promise<StoredEmbedding | null> {
  const db = await getDatabase();

  const result = db.exec(
    `SELECT entity_id, embedding, embedding_model, embedding_dim, input_text_hash, created_at
     FROM embeddings WHERE entity_id = ?`,
    [entityId]
  );

  const firstResult = result[0];
  if (!firstResult || firstResult.values.length === 0) {
    return null;
  }

  const row = firstResult.values[0];
  if (!row) return null;

  return {
    entityId: String(row[0]),
    embedding: JSON.parse(String(row[1])) as number[],
    model: String(row[2]),
    dimension: Number(row[3]),
    inputTextHash: String(row[4]),
    createdAt: String(row[5]),
  };
}

/**
 * Get all embeddings for a model type.
 * Used for vector search across all entities.
 */
export async function getAllEmbeddings(modelFilter?: string): Promise<StoredEmbedding[]> {
  const db = await getDatabase();

  let sql = `SELECT entity_id, embedding, embedding_model, embedding_dim, input_text_hash, created_at
             FROM embeddings`;
  const params: string[] = [];

  if (modelFilter) {
    sql += " WHERE embedding_model = ?";
    params.push(modelFilter);
  }

  const result = db.exec(sql, params);

  const firstResult = result[0];
  if (!firstResult) {
    return [];
  }

  const embeddings: StoredEmbedding[] = [];
  for (const row of firstResult.values) {
    if (!row) continue;
    embeddings.push({
      entityId: String(row[0]),
      embedding: JSON.parse(String(row[1])) as number[],
      model: String(row[2]),
      dimension: Number(row[3]),
      inputTextHash: String(row[4]),
      createdAt: String(row[5]),
    });
  }

  return embeddings;
}

/**
 * Delete embedding for an entity.
 */
export async function deleteEmbedding(entityId: string): Promise<void> {
  const db = await getDatabase();
  db.run("DELETE FROM embeddings WHERE entity_id = ?", [entityId]);
  persistDatabase();
}

/**
 * Check if embedding is stale (input text changed).
 */
export async function isEmbeddingStale(entityId: string, currentHash: string): Promise<boolean> {
  const existing = await getEmbedding(entityId);
  if (!existing) {
    return true; // No embedding exists
  }
  return existing.inputTextHash !== currentHash;
}

/**
 * Get embedding statistics.
 */
export async function getEmbeddingStats(): Promise<{
  total: number;
  byModel: Record<string, number>;
}> {
  const db = await getDatabase();

  const totalResult = db.exec("SELECT COUNT(*) FROM embeddings");
  const total = Number(totalResult[0]?.values[0]?.[0] ?? 0);

  const byModelResult = db.exec(
    "SELECT embedding_model, COUNT(*) FROM embeddings GROUP BY embedding_model"
  );

  const byModel: Record<string, number> = {};
  const modelData = byModelResult[0];
  if (modelData) {
    for (const row of modelData.values) {
      if (row) {
        byModel[String(row[0])] = Number(row[1]);
      }
    }
  }

  return { total, byModel };
}
