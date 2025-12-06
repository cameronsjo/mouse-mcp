/**
 * SQLite Schema
 *
 * Database schema for sessions, cache, and entity storage.
 * Note: FTS5 not available in sql.js - using Fuse.js for fuzzy search instead.
 */

/** SQL statements to create the database schema */
export const SCHEMA_SQL = `
-- Sessions table for Playwright auth
CREATE TABLE IF NOT EXISTS sessions (
  destination TEXT PRIMARY KEY,
  state TEXT NOT NULL DEFAULT 'uninitialized',
  cookies TEXT NOT NULL DEFAULT '[]',
  tokens TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL,
  refreshed_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT
);

-- Cache table with TTL
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  data TEXT NOT NULL,
  source TEXT NOT NULL,
  cached_at TEXT NOT NULL,
  expires_at TEXT NOT NULL
);

-- Index for cache expiration queries
CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);

-- Entities table for searchable storage
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT,
  entity_type TEXT NOT NULL,
  destination_id TEXT NOT NULL,
  park_id TEXT,
  park_name TEXT,
  data TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_entities_destination ON entities(destination_id);
CREATE INDEX IF NOT EXISTS idx_entities_park ON entities(park_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);

-- Embeddings table for vector search
CREATE TABLE IF NOT EXISTS embeddings (
  entity_id TEXT PRIMARY KEY,
  embedding TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  input_text_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Index for embedding model queries
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(embedding_model);

-- Metadata table for schema versioning
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Set schema version
INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '2');
`;

/** Current schema version */
export const SCHEMA_VERSION = 2;

/** Migration SQL for upgrading from v1 to v2 */
export const MIGRATION_V1_TO_V2_SQL = `
-- Embeddings table for vector search
CREATE TABLE IF NOT EXISTS embeddings (
  entity_id TEXT PRIMARY KEY,
  embedding TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  input_text_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

-- Index for embedding model queries
CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(embedding_model);

-- Update schema version
UPDATE metadata SET value = '2' WHERE key = 'schema_version';
`;
