/**
 * Database exports
 */

export {
  getDatabase,
  closeDatabase,
  persistDatabase,
  getDatabaseStats,
  type DatabaseStats,
} from "./database.js";

export {
  cacheGet,
  cacheSet,
  cacheDelete,
  cachePurgeExpired,
  cacheClear,
  getCacheStats,
  type CacheEntry,
  type CacheSetOptions,
  type CacheStats,
} from "./cache.js";

export {
  loadSession,
  loadAllSessions,
  saveSession,
  deleteSession,
  updateSessionError,
  resetSessionErrors,
  isSessionExpired,
} from "./sessions.js";

export {
  saveEntity,
  saveEntities,
  getEntityById,
  getEntities,
  getAttractions,
  getDining,
  getShows,
  getShops,
  getEvents,
  searchEntitiesByName,
  deleteEntitiesForDestination,
  getEntityCounts,
} from "./entities.js";

export {
  detectChanges,
  recordChange,
  getEntityHistory,
  queryHistory,
  getRecentChanges,
  getChangeSummaries,
  getHistoryStats,
  purgeOldHistory,
  type ChangeType,
  type EntityChange,
  type EntityChangeSummary,
  type HistoryQueryOptions,
} from "./history.js";

// Note: Embeddings now stored in LanceDB (see src/vectordb/)
