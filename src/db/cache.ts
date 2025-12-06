/**
 * Cache Operations
 *
 * Cache with TTL support using SQLite.
 */

import { getDatabase, persistDatabase } from "./database.js";
import { createLogger } from "../shared/logger.js";

const logger = createLogger("Cache");

export interface CacheEntry<T> {
  data: T;
  source: "disney" | "themeparks-wiki";
  cachedAt: string;
  expiresAt: string;
}

export interface CacheSetOptions {
  /** TTL in hours (default: 24) */
  ttlHours?: number;
  /** Data source identifier */
  source?: "disney" | "themeparks-wiki";
}

/**
 * Get a cached value if not expired.
 */
export async function cacheGet<T>(key: string): Promise<CacheEntry<T> | null> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const result = db.exec(
    `SELECT data, source, cached_at, expires_at
     FROM cache
     WHERE key = ? AND expires_at > ?`,
    [key, now]
  );

  const firstResult = result[0];
  if (!firstResult || firstResult.values.length === 0) {
    return null;
  }

  const row = firstResult.values[0];
  if (!row) {
    return null;
  }

  try {
    logger.debug("Cache hit", { key });
    return {
      data: JSON.parse(String(row[0])) as T,
      source: String(row[1]) as "disney" | "themeparks-wiki",
      cachedAt: String(row[2]),
      expiresAt: String(row[3]),
    };
  } catch (error) {
    logger.warn("Failed to parse cached data", { key, error });
    await cacheDelete(key);
    return null;
  }
}

/**
 * Set a cached value with TTL.
 */
export async function cacheSet(
  key: string,
  data: unknown,
  options: CacheSetOptions = {}
): Promise<void> {
  const db = await getDatabase();
  const ttlHours = options.ttlHours ?? 24;
  const source = options.source ?? "themeparks-wiki";

  const now = new Date();
  const cachedAt = now.toISOString();
  const expiresAt = new Date(now.getTime() + ttlHours * 60 * 60 * 1000).toISOString();

  db.run(
    `INSERT OR REPLACE INTO cache (key, data, source, cached_at, expires_at)
     VALUES (?, ?, ?, ?, ?)`,
    [key, JSON.stringify(data), source, cachedAt, expiresAt]
  );

  persistDatabase();
  logger.debug("Cache set", { key, ttlHours, expiresAt });
}

/**
 * Delete a cached value.
 */
export async function cacheDelete(key: string): Promise<boolean> {
  const db = await getDatabase();

  // Check if exists first
  const check = db.exec("SELECT 1 FROM cache WHERE key = ?", [key]);
  const checkResult = check[0];
  if (!checkResult || checkResult.values.length === 0) {
    return false;
  }

  db.run("DELETE FROM cache WHERE key = ?", [key]);
  persistDatabase();
  return true;
}

/**
 * Clear all expired cache entries.
 */
export async function cachePurgeExpired(): Promise<number> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  // Count before delete
  const countResult = db.exec("SELECT COUNT(*) FROM cache WHERE expires_at <= ?", [now]);
  const count = (countResult[0]?.values[0]?.[0] as number) ?? 0;

  if (count > 0) {
    db.run("DELETE FROM cache WHERE expires_at <= ?", [now]);
    persistDatabase();
    logger.info("Purged expired cache entries", { count });
  }

  return count;
}

/**
 * Clear all cache entries.
 */
export async function cacheClear(): Promise<number> {
  const db = await getDatabase();

  const countResult = db.exec("SELECT COUNT(*) FROM cache");
  const count = (countResult[0]?.values[0]?.[0] as number) ?? 0;

  db.run("DELETE FROM cache");
  persistDatabase();

  logger.info("Cleared all cache entries", { count });
  return count;
}

/**
 * Get cache statistics.
 */
export interface CacheStats {
  totalEntries: number;
  expiredEntries: number;
  sources: Record<string, number>;
}

export async function getCacheStats(): Promise<CacheStats> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const totalResult = db.exec("SELECT COUNT(*) FROM cache");
  const total = (totalResult[0]?.values[0]?.[0] as number) ?? 0;

  const expiredResult = db.exec("SELECT COUNT(*) FROM cache WHERE expires_at <= ?", [now]);
  const expired = (expiredResult[0]?.values[0]?.[0] as number) ?? 0;

  const sourcesResult = db.exec("SELECT source, COUNT(*) as count FROM cache GROUP BY source");

  const sources: Record<string, number> = {};
  const sourcesData = sourcesResult[0];
  if (sourcesData) {
    for (const row of sourcesData.values) {
      if (row) {
        sources[String(row[0])] = Number(row[1]);
      }
    }
  }

  return {
    totalEntries: total,
    expiredEntries: expired,
    sources,
  };
}
