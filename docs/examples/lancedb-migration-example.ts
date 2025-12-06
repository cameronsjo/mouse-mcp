/**
 * LanceDB Migration Example
 *
 * This file demonstrates how to update lancedb.ts to use the SQL escaping functions.
 * These are examples showing the BEFORE (vulnerable) and AFTER (safe) code.
 *
 * DO NOT USE THIS FILE IN PRODUCTION - it's for reference only.
 */

import type { EmbeddingRecord, VectorSearchResult } from "./lancedb.js";
import { buildEqualityClause, buildWhereClause, type WhereCondition } from "./sql-escaping.js";

/* eslint-disable @typescript-eslint/no-unused-vars */

// ============================================================================
// EXAMPLE 1: saveEmbedding() - Single record upsert
// ============================================================================

/**
 * BEFORE: Direct string interpolation (VULNERABLE)
 */
async function saveEmbedding_BEFORE(record: EmbeddingRecord, table: any): Promise<void> {
  try {
    // VULNERABLE: If record.id or record.model contain single quotes,
    // they could break out of the string and inject SQL
    await table.delete(`id = '${record.id}' AND model = '${record.model}'`);
  } catch {
    // Ignore delete errors
  }
  await table.add([record]);
}

/**
 * AFTER: Using buildEqualityClause() (SAFE)
 */
async function saveEmbedding_AFTER(record: EmbeddingRecord, table: any): Promise<void> {
  try {
    // SAFE: buildEqualityClause properly escapes single quotes
    const whereClause = buildEqualityClause({
      id: record.id,
      model: record.model,
    });
    await table.delete(whereClause);
  } catch {
    // Ignore delete errors
  }
  await table.add([record]);
}

// ============================================================================
// EXAMPLE 2: saveEmbeddingsBatch() - Batch delete
// ============================================================================

/**
 * BEFORE: Direct string interpolation in map (VULNERABLE)
 */
async function saveEmbeddingsBatch_BEFORE(records: EmbeddingRecord[], table: any): Promise<void> {
  // VULNERABLE: Each record's id and model are directly interpolated
  const deleteConditions = records.map((r) => `(id = '${r.id}' AND model = '${r.model}')`);

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
}

/**
 * AFTER: Using buildEqualityClause() for each record (SAFE)
 */
async function saveEmbeddingsBatch_AFTER(records: EmbeddingRecord[], table: any): Promise<void> {
  // SAFE: Each condition is properly escaped
  const deleteConditions = records.map((r) =>
    buildEqualityClause({
      id: r.id,
      model: r.model,
    })
  );

  const CHUNK_SIZE = 50;
  for (let i = 0; i < deleteConditions.length; i += CHUNK_SIZE) {
    const chunk = deleteConditions.slice(i, i + CHUNK_SIZE);
    try {
      // Wrap each condition in parentheses and join with OR
      await table.delete(chunk.map((c) => `(${c})`).join(" OR "));
    } catch {
      // Ignore delete errors
    }
  }

  await table.add(records);
}

// ============================================================================
// EXAMPLE 3: getEmbedding() - Simple query
// ============================================================================

/**
 * BEFORE: Direct string interpolation (VULNERABLE)
 */
async function getEmbedding_BEFORE(
  entityId: string,
  model: string,
  table: any
): Promise<EmbeddingRecord | null> {
  // VULNERABLE: entityId or model could contain injection payloads
  const results = await table
    .query()
    .where(`id = '${entityId}' AND model = '${model}'`)
    .limit(1)
    .toArray();

  if (results.length === 0) return null;
  return results[0] as unknown as EmbeddingRecord;
}

/**
 * AFTER: Using buildEqualityClause() (SAFE)
 */
async function getEmbedding_AFTER(
  entityId: string,
  model: string,
  table: any
): Promise<EmbeddingRecord | null> {
  // SAFE: Properly escaped
  const whereClause = buildEqualityClause({
    id: entityId,
    model: model,
  });

  const results = await table.query().where(whereClause).limit(1).toArray();

  if (results.length === 0) return null;
  return results[0] as unknown as EmbeddingRecord;
}

// ============================================================================
// EXAMPLE 4: vectorSearch() - Dynamic filters
// ============================================================================

/**
 * BEFORE: Building filter array with string interpolation (VULNERABLE)
 */
async function vectorSearch_BEFORE(
  queryVector: number[],
  model: string,
  options: { entityType?: string; destinationId?: string },
  table: any
): Promise<VectorSearchResult[]> {
  // VULNERABLE: model, entityType, and destinationId are directly interpolated
  const filters: string[] = [`model = '${model}'`];
  if (options.entityType) filters.push(`entityType = '${options.entityType}'`);
  if (options.destinationId) filters.push(`destinationId = '${options.destinationId}'`);

  const whereClause = filters.join(" AND ");

  const results = await table.vectorSearch(queryVector).where(whereClause).limit(10).toArray();

  return results as unknown as VectorSearchResult[];
}

/**
 * AFTER: Using buildWhereClause() with structured conditions (SAFE)
 */
async function vectorSearch_AFTER(
  queryVector: number[],
  model: string,
  options: { entityType?: string; destinationId?: string },
  table: any
): Promise<VectorSearchResult[]> {
  // SAFE: Build conditions array with proper typing
  const conditions: WhereCondition[] = [{ column: "model", operator: "=", value: model }];

  if (options.entityType) {
    conditions.push({ column: "entityType", operator: "=", value: options.entityType });
  }

  if (options.destinationId) {
    conditions.push({ column: "destinationId", operator: "=", value: options.destinationId });
  }

  const whereClause = buildWhereClause(conditions);

  const results = await table.vectorSearch(queryVector).where(whereClause).limit(10).toArray();

  return results as unknown as VectorSearchResult[];
}

// ============================================================================
// EXAMPLE 5: deleteEmbedding() - Optional parameter
// ============================================================================

/**
 * BEFORE: Conditional string building (VULNERABLE)
 */
async function deleteEmbedding_BEFORE(
  entityId: string,
  model: string | undefined,
  table: any
): Promise<void> {
  // VULNERABLE: Direct interpolation with ternary
  const whereClause = model ? `id = '${entityId}' AND model = '${model}'` : `id = '${entityId}'`;
  await table.delete(whereClause);
}

/**
 * AFTER: Using buildWhereClause() with conditional logic (SAFE)
 */
async function deleteEmbedding_AFTER(
  entityId: string,
  model: string | undefined,
  table: any
): Promise<void> {
  // SAFE: Build conditions based on optional parameter
  const conditions: WhereCondition[] = [{ column: "id", operator: "=", value: entityId }];

  if (model) {
    conditions.push({ column: "model", operator: "=", value: model });
  }

  const whereClause = buildWhereClause(conditions);
  await table.delete(whereClause);
}

// ============================================================================
// EXAMPLE 6: Complex query with different operators
// ============================================================================

/**
 * Example showing LIKE operator and inequality
 */
async function complexQuery_EXAMPLE(table: any): Promise<void> {
  // Search for embeddings with specific criteria
  const conditions: WhereCondition[] = [
    // Exact match
    { column: "model", operator: "=", value: "transformers:v2" },

    // Pattern matching
    { column: "name", operator: "LIKE", value: "%Space Mountain%" },

    // Inequality
    { column: "destinationId", operator: "!=", value: "deleted" },

    // NULL check
    { column: "deletedAt", operator: "IS", value: null },
  ];

  const whereClause = buildWhereClause(conditions, "AND");

  const results = await table.query().where(whereClause).toArray();

  console.log("Found records:", results);
}

// ============================================================================
// EXAMPLE 7: Handling injection attempts
// ============================================================================

/**
 * Example showing how injection attempts are safely handled
 */
function injectionAttemptsExample(): void {
  // Classic injection attempt: trying to return all records
  const maliciousId = "test' OR '1'='1";
  const maliciousModel = "model";

  // VULNERABLE: This would match ALL records
  const vulnerableQuery = `id = '${maliciousId}' AND model = '${maliciousModel}'`;
  console.log("VULNERABLE:", vulnerableQuery);
  // Output: id = 'test' OR '1'='1' AND model = 'model'
  // This breaks out of the string and adds an OR condition!

  // SAFE: Injection attempt is escaped
  const safeQuery = buildEqualityClause({
    id: maliciousId,
    model: maliciousModel,
  });
  console.log("SAFE:", safeQuery);
  // Output: `id` = 'test'' OR ''1''=''1' AND `model` = 'model'
  // The single quotes are escaped, so this is treated as a literal string!
}

// ============================================================================
// EXAMPLE 8: Numeric and boolean values
// ============================================================================

/**
 * Example showing different value types
 */
async function valueTypesExample(table: any): Promise<void> {
  const conditions: WhereCondition[] = [
    // String value
    { column: "name", operator: "=", value: "Space Mountain" },

    // Numeric value
    { column: "count", operator: ">", value: 10 },

    // Boolean value
    { column: "active", operator: "=", value: true },

    // NULL value
    { column: "deletedAt", operator: "IS", value: null },
  ];

  const whereClause = buildWhereClause(conditions);
  console.log("WHERE clause:", whereClause);
  // Output: `name` = 'Space Mountain' AND `count` > 10 AND `active` = true AND `deletedAt` IS NULL

  await table.query().where(whereClause).toArray();
}

// ============================================================================
// SUMMARY OF CHANGES
// ============================================================================

/**
 * Migration Checklist:
 *
 * 1. Import escaping functions:
 *    import { buildEqualityClause, buildWhereClause } from "./sql-escaping.js";
 *
 * 2. Replace simple equality conditions:
 *    `id = '${value}'` → buildEqualityClause({ id: value })
 *
 * 3. Replace complex conditions:
 *    Build WhereCondition[] array and use buildWhereClause()
 *
 * 4. Test thoroughly:
 *    - Run test suite
 *    - Test with special characters in data
 *    - Verify query results are correct
 *
 * 5. Benefits:
 *    - SQL injection prevention
 *    - Type safety
 *    - Better error messages
 *    - Easier to test
 *    - More maintainable
 */
