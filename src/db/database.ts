/**
 * Database Connection
 *
 * SQLite database using sql.js (WebAssembly-based, cross-platform).
 */

import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getConfig } from "../config/index.js";
import { createLogger } from "../shared/logger.js";
import { DatabaseError } from "../shared/errors.js";
import { SCHEMA_SQL, SCHEMA_VERSION } from "./schema.js";

const logger = createLogger("Database");

let db: SqlJsDatabase | null = null;
let dbPath: string | null = null;

/**
 * Get the database connection.
 * Initializes the database if not already done.
 */
export async function getDatabase(): Promise<SqlJsDatabase> {
  if (!db) {
    db = await initializeDatabase();
  }
  return db;
}

/**
 * Initialize the SQLite database.
 * Creates the database file and schema if needed.
 */
async function initializeDatabase(): Promise<SqlJsDatabase> {
  const config = getConfig();
  dbPath = config.dbPath;

  logger.info("Initializing database", { path: dbPath });

  // Ensure directory exists
  const dir = dirname(dbPath);
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
    logger.debug("Created database directory", { dir });
  }

  try {
    // Initialize sql.js
    const SQL = await initSqlJs();

    let database: SqlJsDatabase;

    // Load existing database or create new one
    if (existsSync(dbPath)) {
      try {
        const fileBuffer = readFileSync(dbPath);
        database = new SQL.Database(fileBuffer);
        logger.debug("Loaded existing database");
      } catch (error) {
        logger.warn("Failed to load database, creating new one", { error });
        database = new SQL.Database();
      }
    } else {
      database = new SQL.Database();
      logger.debug("Created new database");
    }

    // Check schema version
    const needsInit = checkSchemaVersion(database);

    if (needsInit) {
      logger.info("Creating database schema", { version: SCHEMA_VERSION });
      database.run(SCHEMA_SQL);
      saveDatabase(database);
    }

    logger.info("Database initialized successfully");
    return database;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new DatabaseError(`Failed to initialize database: ${message}`, {
      path: dbPath,
    });
  }
}

/**
 * Check if schema needs initialization.
 */
function checkSchemaVersion(database: SqlJsDatabase): boolean {
  try {
    // Check if metadata table exists
    const result = database.exec(
      "SELECT name FROM sqlite_master WHERE type='table' AND name='metadata'"
    );

    const tableResult = result[0];
    if (!tableResult || tableResult.values.length === 0) {
      return true;
    }

    // Check schema version
    const versionResult = database.exec(
      "SELECT value FROM metadata WHERE key = 'schema_version'"
    );

    const versionData = versionResult[0];
    if (!versionData || versionData.values.length === 0) {
      return true;
    }

    const firstRow = versionData.values[0];
    if (!firstRow) {
      return true;
    }

    const currentVersion = parseInt(String(firstRow[0]), 10);

    if (currentVersion < SCHEMA_VERSION) {
      logger.info("Schema migration needed", {
        currentVersion,
        targetVersion: SCHEMA_VERSION,
      });
      return true;
    }

    return false;
  } catch {
    return true;
  }
}

/**
 * Save the database to disk.
 */
function saveDatabase(database: SqlJsDatabase): void {
  if (!dbPath) return;

  try {
    const data = database.export();
    const buffer = Buffer.from(data);
    writeFileSync(dbPath, buffer);
    logger.debug("Database saved to disk");
  } catch (error) {
    logger.error("Failed to save database", error);
  }
}

/**
 * Save current database state to disk.
 * Call this after write operations.
 */
export function persistDatabase(): void {
  if (db) {
    saveDatabase(db);
  }
}

/**
 * Close the database connection.
 */
export function closeDatabase(): void {
  if (db) {
    logger.info("Closing database connection");
    persistDatabase();
    db.close();
    db = null;
    dbPath = null;
  }
}

/**
 * Get database statistics for status reporting.
 */
export interface DatabaseStats {
  cacheEntries: number;
  entityCount: number;
  sessionCount: number;
  dbSizeBytes: number;
}

export async function getDatabaseStats(): Promise<DatabaseStats> {
  const database = await getDatabase();

  const cacheResult = database.exec("SELECT COUNT(*) as count FROM cache");
  const cacheCount = cacheResult[0]?.values[0]?.[0] as number ?? 0;

  const entityResult = database.exec("SELECT COUNT(*) as count FROM entities");
  const entityCount = entityResult[0]?.values[0]?.[0] as number ?? 0;

  const sessionResult = database.exec("SELECT COUNT(*) as count FROM sessions");
  const sessionCount = sessionResult[0]?.values[0]?.[0] as number ?? 0;

  // Approximate size from exported buffer
  const exportedData = database.export();
  const dbSizeBytes = exportedData.length;

  return {
    cacheEntries: cacheCount,
    entityCount,
    sessionCount,
    dbSizeBytes,
  };
}
