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
  type EmbeddingRecord,
  type VectorSearchResult,
} from "./lancedb.js";
