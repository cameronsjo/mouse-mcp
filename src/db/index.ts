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

// Note: Embeddings now stored in LanceDB (see src/vectordb/)
