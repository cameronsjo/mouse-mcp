/**
 * Vector Database exports
 */

export {
  connectLanceDB,
  closeLanceDB,
  saveEmbedding,
  saveEmbeddingsBatch,
  getEmbedding,
  isEmbeddingStale,
  vectorSearch,
  getEmbeddingStats,
  deleteEmbedding,
  deleteEmbeddingsByDestination,
  type EmbeddingRecord,
  type VectorSearchResult,
} from "./lancedb.js";

export {
  escapeSqlValue,
  escapeSqlIdentifier,
  buildWhereClause,
  buildEqualityClause,
  type WhereCondition,
  type ComparisonOperator,
  type LogicalOperator,
} from "./sql-escaping.js";
