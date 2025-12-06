# Database Schema

This document describes the SQLite database schema and operations used by mouse-mcp.

## Overview

mouse-mcp uses SQLite (via sql.js WebAssembly) for persistent storage of:

- **Sessions**: Disney API authentication state
- **Cache**: API response caching with TTL
- **Entities**: Normalized park entity data
- **Embeddings**: Vector embeddings for semantic search

## Database Location

Default path: `~/.cache/mouse-mcp/disney.db`

Configurable via `MOUSE_MCP_DB_PATH` environment variable.

## Schema

### Source File

`src/db/schema.ts`

### Current Version

Schema version: **2**

### Sessions Table

Stores Playwright-based authentication state.

```sql
CREATE TABLE IF NOT EXISTS sessions (
  destination TEXT PRIMARY KEY,        -- 'wdw' or 'dlr'
  state TEXT NOT NULL DEFAULT 'uninitialized',
                                       -- 'uninitialized' | 'active' | 'expired' | 'error'
  cookies TEXT NOT NULL DEFAULT '[]',  -- JSON array of SessionCookie
  tokens TEXT NOT NULL DEFAULT '{}',   -- JSON object with auth tokens
  created_at TEXT NOT NULL,            -- ISO 8601 timestamp
  refreshed_at TEXT NOT NULL,          -- ISO 8601 timestamp
  expires_at TEXT NOT NULL,            -- ISO 8601 timestamp
  error_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT                      -- Last error message
);
```

**Session States**:

| State | Description |
|-------|-------------|
| `uninitialized` | No session established yet |
| `active` | Valid session with cookies |
| `expired` | Session past expiration |
| `error` | Session in error state |

**Tokens Structure**:

```typescript
interface SessionTokens {
  sessionId?: string;   // SWID cookie value
  authToken?: string;   // From localStorage
  csrfToken?: string;   // CSRF protection token
}
```

### Cache Table

Stores API responses with TTL-based expiration.

```sql
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,           -- Cache key (e.g., 'attractions:wdw')
  data TEXT NOT NULL,             -- JSON serialized response
  source TEXT NOT NULL,           -- 'disney' or 'themeparks-wiki'
  cached_at TEXT NOT NULL,        -- ISO 8601 timestamp
  expires_at TEXT NOT NULL        -- ISO 8601 timestamp
);

CREATE INDEX IF NOT EXISTS idx_cache_expires_at ON cache(expires_at);
```

**Cache Key Format**:

```
{entityType}:{destinationId}[:{parkId}]
```

Examples:

- `attractions:wdw` - All WDW attractions
- `dining:dlr:330339` - Disneyland Park dining
- `destinations` - All destinations

### Entities Table

Stores normalized entity data for search.

```sql
CREATE TABLE IF NOT EXISTS entities (
  id TEXT PRIMARY KEY,               -- Entity ID (e.g., '80010190')
  name TEXT NOT NULL,                -- Display name
  slug TEXT,                         -- URL-friendly name
  entity_type TEXT NOT NULL,         -- 'ATTRACTION' | 'RESTAURANT' | 'SHOW'
  destination_id TEXT NOT NULL,      -- 'wdw' or 'dlr'
  park_id TEXT,                      -- Park ID (nullable for resort-level)
  park_name TEXT,                    -- Park display name
  data TEXT NOT NULL,                -- Full JSON entity data
  updated_at TEXT NOT NULL           -- ISO 8601 timestamp
);

CREATE INDEX IF NOT EXISTS idx_entities_destination ON entities(destination_id);
CREATE INDEX IF NOT EXISTS idx_entities_park ON entities(park_id);
CREATE INDEX IF NOT EXISTS idx_entities_type ON entities(entity_type);
CREATE INDEX IF NOT EXISTS idx_entities_name ON entities(name);
```

**Entity Types**:

| Type | Description |
|------|-------------|
| `ATTRACTION` | Rides and attractions |
| `RESTAURANT` | Dining locations |
| `SHOW` | Entertainment and shows |

### Embeddings Table

Stores vector embeddings for semantic search.

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  entity_id TEXT PRIMARY KEY,        -- References entities(id)
  embedding TEXT NOT NULL,           -- JSON array of floats
  embedding_model TEXT NOT NULL,     -- e.g., 'openai:text-embedding-3-small'
  embedding_dim INTEGER NOT NULL,    -- Vector dimension (384 or 1536)
  input_text_hash TEXT NOT NULL,     -- Hash of input text for staleness
  created_at TEXT NOT NULL,          -- ISO 8601 timestamp
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(embedding_model);
```

### Metadata Table

Tracks schema version for migrations.

```sql
CREATE TABLE IF NOT EXISTS metadata (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

INSERT OR REPLACE INTO metadata (key, value) VALUES ('schema_version', '2');
```

## Database Operations

### Source Files

- `src/db/database.ts` - Connection management
- `src/db/cache.ts` - Cache operations
- `src/db/entities.ts` - Entity CRUD
- `src/db/embeddings.ts` - Embedding storage
- `src/db/sessions.ts` - Session persistence

### Connection Management

```typescript
import initSqlJs, { Database } from "sql.js";

let db: Database | null = null;

export async function getDatabase(): Promise<Database> {
  if (db) {
    return db;
  }

  const SQL = await initSqlJs();

  // Load existing database or create new
  const dbPath = getConfig().dbPath;

  if (existsSync(dbPath)) {
    const data = readFileSync(dbPath);
    db = new SQL.Database(data);
  } else {
    db = new SQL.Database();
    db.run(SCHEMA_SQL);
  }

  return db;
}

export async function closeDatabase(): Promise<void> {
  if (db) {
    // Persist to disk
    const data = db.export();
    writeFileSync(getConfig().dbPath, data);
    db.close();
    db = null;
  }
}
```

### Cache Operations

```typescript
// Get cached data
export async function cacheGet<T>(key: string): Promise<CacheEntry<T> | null> {
  const db = await getDatabase();
  const result = db.exec(`
    SELECT data, source, cached_at, expires_at
    FROM cache
    WHERE key = ? AND expires_at > datetime('now')
  `, [key]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const [data, source, cachedAt, expiresAt] = result[0].values[0];
  return {
    data: JSON.parse(data as string) as T,
    source: source as string,
    cachedAt: cachedAt as string,
    expiresAt: expiresAt as string,
  };
}

// Set cache with TTL
export async function cacheSet<T>(
  key: string,
  data: T,
  options: { ttlHours: number; source: string }
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + options.ttlHours * 60 * 60 * 1000).toISOString();

  db.run(`
    INSERT OR REPLACE INTO cache (key, data, source, cached_at, expires_at)
    VALUES (?, ?, ?, ?, ?)
  `, [key, JSON.stringify(data), options.source, now, expiresAt]);
}

// Purge expired entries
export async function cachePurgeExpired(): Promise<number> {
  const db = await getDatabase();
  db.run(`DELETE FROM cache WHERE expires_at < datetime('now')`);
  return db.getRowsModified();
}
```

### Entity Operations

```typescript
// Save entities (upsert)
export async function saveEntities(entities: DisneyEntity[]): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  const stmt = db.prepare(`
    INSERT OR REPLACE INTO entities
    (id, name, slug, entity_type, destination_id, park_id, park_name, data, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const entity of entities) {
    stmt.run([
      entity.id,
      entity.name,
      entity.slug,
      entity.entityType,
      entity.destinationId,
      entity.parkId,
      entity.parkName,
      JSON.stringify(entity),
      now,
    ]);
  }

  stmt.free();
}

// Get entity by ID
export async function getEntityById<T extends DisneyEntity>(
  id: string
): Promise<T | null> {
  const db = await getDatabase();
  const result = db.exec(`SELECT data FROM entities WHERE id = ?`, [id]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  return JSON.parse(result[0].values[0][0] as string) as T;
}

// Get entities by destination and type
export async function getEntitiesByType<T extends DisneyEntity>(
  destinationId: DestinationId,
  entityType: string,
  parkId?: string
): Promise<T[]> {
  const db = await getDatabase();

  let query = `
    SELECT data FROM entities
    WHERE destination_id = ? AND entity_type = ?
  `;
  const params: string[] = [destinationId, entityType];

  if (parkId) {
    query += ` AND park_id = ?`;
    params.push(parkId);
  }

  const result = db.exec(query, params);

  if (result.length === 0) {
    return [];
  }

  return result[0].values.map((row) => JSON.parse(row[0] as string) as T);
}

// Search entities by name
export async function searchEntitiesByName<T extends DisneyEntity>(
  query: string,
  options: SearchOptions = {}
): Promise<T[]> {
  const db = await getDatabase();

  let sql = `SELECT data FROM entities WHERE name LIKE ?`;
  const params: string[] = [`%${query}%`];

  if (options.destinationId) {
    sql += ` AND destination_id = ?`;
    params.push(options.destinationId);
  }

  if (options.entityType) {
    sql += ` AND entity_type = ?`;
    params.push(options.entityType);
  }

  if (options.limit) {
    sql += ` LIMIT ?`;
    params.push(String(options.limit));
  }

  const result = db.exec(sql, params);

  if (result.length === 0) {
    return [];
  }

  return result[0].values.map((row) => JSON.parse(row[0] as string) as T);
}
```

### Session Operations

```typescript
// Load session
export async function loadSession(
  destination: DestinationId
): Promise<DisneySession | null> {
  const db = await getDatabase();
  const result = db.exec(`
    SELECT destination, state, cookies, tokens, created_at,
           refreshed_at, expires_at, error_count, last_error
    FROM sessions WHERE destination = ?
  `, [destination]);

  if (result.length === 0 || result[0].values.length === 0) {
    return null;
  }

  const row = result[0].values[0];
  return {
    destination: row[0] as DestinationId,
    state: row[1] as DisneySession["state"],
    cookies: JSON.parse(row[2] as string),
    tokens: JSON.parse(row[3] as string),
    createdAt: row[4] as string,
    refreshedAt: row[5] as string,
    expiresAt: row[6] as string,
    errorCount: row[7] as number,
    lastError: row[8] as string | undefined,
  };
}

// Save session
export async function saveSession(session: DisneySession): Promise<void> {
  const db = await getDatabase();
  db.run(`
    INSERT OR REPLACE INTO sessions
    (destination, state, cookies, tokens, created_at, refreshed_at, expires_at, error_count, last_error)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `, [
    session.destination,
    session.state,
    JSON.stringify(session.cookies),
    JSON.stringify(session.tokens),
    session.createdAt,
    session.refreshedAt,
    session.expiresAt,
    session.errorCount,
    session.lastError ?? null,
  ]);
}

// Check if session is expired
export function isSessionExpired(
  session: DisneySession,
  bufferMinutes: number
): boolean {
  const expiresAt = new Date(session.expiresAt);
  const bufferMs = bufferMinutes * 60 * 1000;
  return Date.now() > expiresAt.getTime() - bufferMs;
}

// Update error tracking
export async function updateSessionError(
  destination: DestinationId,
  error: string
): Promise<void> {
  const db = await getDatabase();
  db.run(`
    UPDATE sessions
    SET error_count = error_count + 1, last_error = ?
    WHERE destination = ?
  `, [error, destination]);
}
```

### Embedding Operations

```typescript
// Save embedding
export async function saveEmbedding(
  entityId: string,
  embedding: number[],
  model: string,
  dimension: number,
  inputTextHash: string
): Promise<void> {
  const db = await getDatabase();
  const now = new Date().toISOString();

  db.run(`
    INSERT OR REPLACE INTO embeddings
    (entity_id, embedding, embedding_model, embedding_dim, input_text_hash, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `, [
    entityId,
    JSON.stringify(embedding),
    model,
    dimension,
    inputTextHash,
    now,
  ]);
}

// Get all embeddings for a model
export async function getAllEmbeddings(
  model: string
): Promise<StoredEmbedding[]> {
  const db = await getDatabase();
  const result = db.exec(`
    SELECT entity_id, embedding, embedding_dim
    FROM embeddings
    WHERE embedding_model = ?
  `, [model]);

  if (result.length === 0) {
    return [];
  }

  return result[0].values.map((row) => ({
    entityId: row[0] as string,
    embedding: JSON.parse(row[1] as string) as number[],
    dimension: row[2] as number,
  }));
}

// Check if embedding needs regeneration
export async function isEmbeddingStale(
  entityId: string,
  currentHash: string
): Promise<boolean> {
  const db = await getDatabase();
  const result = db.exec(`
    SELECT input_text_hash FROM embeddings WHERE entity_id = ?
  `, [entityId]);

  if (result.length === 0 || result[0].values.length === 0) {
    return true;  // No embedding exists
  }

  const storedHash = result[0].values[0][0] as string;
  return storedHash !== currentHash;
}

// Get embedding statistics
export async function getEmbeddingStats(): Promise<EmbeddingStats> {
  const db = await getDatabase();

  const countResult = db.exec(`SELECT COUNT(*) FROM embeddings`);
  const total = countResult[0]?.values[0]?.[0] as number ?? 0;

  const modelResult = db.exec(`
    SELECT embedding_model, COUNT(*) as count
    FROM embeddings
    GROUP BY embedding_model
  `);

  const byModel: Record<string, number> = {};
  if (modelResult.length > 0) {
    for (const row of modelResult[0].values) {
      byModel[row[0] as string] = row[1] as number;
    }
  }

  return { total, byModel };
}
```

## Migrations

### Version 1 to 2

Added embeddings table:

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  entity_id TEXT PRIMARY KEY,
  embedding TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dim INTEGER NOT NULL,
  input_text_hash TEXT NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(embedding_model);

UPDATE metadata SET value = '2' WHERE key = 'schema_version';
```

## sql.js Considerations

### Why sql.js?

- **Cross-platform**: Works on any Node.js platform via WebAssembly
- **No native dependencies**: No compilation required
- **Single-file database**: Easy to backup and manage
- **Full SQLite support**: Standard SQL syntax and features

### Limitations

- **In-memory until save**: Changes must be explicitly persisted
- **No FTS5**: Full-text search not available (using Fuse.js instead)
- **Single connection**: Not suitable for concurrent writes

### Persistence Strategy

Database is saved:

1. On graceful shutdown (`closeDatabase()`)
2. Periodically during long operations (TODO)
3. On process signals (SIGINT, SIGTERM)

```typescript
const shutdown = async () => {
  await closeDatabase();
  process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
```
