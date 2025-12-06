# Data Pipeline

This document describes how data flows through the mouse-mcp system, from external APIs to MCP tool responses.

## Pipeline Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        External Data Sources                             │
│  ┌─────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │   Disney Official APIs       │  │     ThemeParks.wiki API         │  │
│  │   (disneyworld.disney.go.com)│  │    (api.themeparks.wiki)        │  │
│  └─────────────────────────────┘  └─────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Ingestion Layer                                  │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    API Clients                                   │   │
│  │  - Authentication (Playwright sessions)                          │   │
│  │  - HTTP requests with retry logic                                │   │
│  │  - Response normalization                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Storage Layer                                    │
│  ┌──────────────────┐  ┌──────────────────┐  ┌──────────────────────┐  │
│  │     Cache        │  │    Entities      │  │    Embeddings        │  │
│  │  (API responses) │  │   (normalized)   │  │   (vector search)    │  │
│  └──────────────────┘  └──────────────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Query Layer                                      │
│  ┌──────────────────────────┐  ┌──────────────────────────────────────┐│
│  │     Fuzzy Search         │  │       Semantic Search                 ││
│  │     (Fuse.js)            │  │       (Vector similarity)             ││
│  └──────────────────────────┘  └──────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         Response Layer                                   │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    MCP Tool Responses                            │   │
│  │  - JSON formatted output                                         │   │
│  │  - Structured entity data                                        │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
```

## Data Sources

### Disney Official APIs

**Primary source** for rich metadata.

| Endpoint Pattern | Description |
|------------------|-------------|
| `/finder/api/v1/explorer-service/list/destination/{dest}/type/attraction` | All attractions for destination |
| `/finder/api/v1/explorer-service/list/ancestor/{parkId}/type/attraction` | Attractions filtered by park |
| `/finder/api/v1/explorer-service/list/destination/{dest}/type/dining` | All dining for destination |
| `/finder/api/v1/explorer-service/list/ancestor/{parkId}/type/dining` | Dining filtered by park |

**Base URLs**:

- WDW: `https://disneyworld.disney.go.com`
- DLR: `https://disneyland.disney.go.com`

**Authentication**: Browser session cookies obtained via Playwright.

### ThemeParks.wiki API

**Fallback source** when Disney auth fails.

| Endpoint | Description |
|----------|-------------|
| `GET /v1/destinations` | All destinations with parks |
| `GET /v1/entity/{uuid}/children` | All children of a destination |
| `GET /v1/entity/{id}` | Single entity by ID |

**Base URL**: `https://api.themeparks.wiki`

**Authentication**: None required.

## Ingestion Flow

### Step 1: Cache Check

```typescript
const cached = await cacheGet<DisneyAttraction[]>(cacheKey);
if (cached) {
  return cached.data;  // Cache hit - skip API call
}
```

Cache keys follow the pattern: `{entityType}:{destination}:{parkId?}`

Examples:

- `attractions:wdw` - All WDW attractions
- `attractions:wdw:80007944` - Magic Kingdom attractions only
- `dining:dlr` - All DLR dining

### Step 2: Session Acquisition

```typescript
const sessionManager = getSessionManager();
const headers = await sessionManager.getAuthHeaders(destinationId);
```

Session flow:

1. Check if valid session exists in SQLite
2. If expired or missing, launch Playwright browser
3. Navigate to Disney homepage
4. Handle cookie consent
5. Wait for session cookies
6. Extract and persist session data

### Step 3: API Request

```typescript
const response = await this.fetchWithAuth<DisneyApiResponse>(
  `${baseUrl}${endpoint}`,
  headers,
  destinationId
);
```

Request features:

- Timeout handling (configurable, default 30s)
- Exponential backoff retry (3 attempts)
- Non-retryable status codes: 400, 401, 403, 404
- Automatic session error reporting

### Step 4: Response Normalization

Disney API responses are normalized to internal types:

```typescript
// Disney API format (partial)
{
  "id": "80010190",
  "name": "Space Mountain",
  "heightRequirement": "44 in",
  "lightningLane": true,
  "singleRider": false,
  ...
}

// Normalized format
{
  "id": "80010190",
  "name": "Space Mountain",
  "slug": "space-mountain",
  "entityType": "ATTRACTION",
  "destinationId": "wdw",
  "parkId": "80007944",
  "parkName": "Magic Kingdom Park",
  "heightRequirement": {
    "inches": 44,
    "centimeters": 112,
    "description": "44 in"
  },
  "lightningLane": {
    "tier": "multi-pass",
    "available": true
  },
  "singleRider": false,
  ...
}
```

### Step 5: Storage

Data is stored in two locations:

```typescript
// Cache for quick retrieval
await cacheSet(cacheKey, attractions, { ttlHours: 24, source: "disney" });

// Entities table for search
await saveEntities(attractions);
```

## Caching Strategy

### Cache TTLs

| Data Type | TTL | Rationale |
|-----------|-----|-----------|
| Attractions | 24 hours | Changes infrequently |
| Dining | 24 hours | Menu updates are rare |
| Shows | 24 hours | Schedules change slowly |
| Destinations | 7 days | Static data |
| Sessions | 24 hours | Cookie expiration |

### Cache Key Format

```
{entityType}:{destinationId}[:{parkId}]
```

Examples:

- `attractions:wdw` - All WDW attractions
- `dining:dlr:330339` - Disneyland Park dining only

### Cache Operations

```typescript
// Get cached data (returns null if expired)
const cached = await cacheGet<T>(key);

// Set with TTL
await cacheSet(key, data, { ttlHours: 24, source: "disney" });

// Purge expired entries (runs on startup)
await cachePurgeExpired();
```

## Entity Storage

### Save Flow

```typescript
async function saveEntities(entities: DisneyEntity[]): Promise<void> {
  for (const entity of entities) {
    await db.run(`
      INSERT OR REPLACE INTO entities (
        id, name, slug, entity_type, destination_id,
        park_id, park_name, data, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      entity.id,
      entity.name,
      entity.slug,
      entity.entityType,
      entity.destinationId,
      entity.parkId,
      entity.parkName,
      JSON.stringify(entity),
      new Date().toISOString()
    ]);
  }
}
```

### Query Flow

```typescript
// By ID
const entity = await getEntityById<T>(id);

// By destination/type
const attractions = await getAttractions(destinationId, parkId);

// Fuzzy name search
const results = await searchEntitiesByName<T>(query, options);
```

## Embedding Pipeline

### Text Preprocessing

Entity metadata is combined into searchable text:

```typescript
function buildEmbeddingText(entity: DisneyEntity): string {
  const parts = [entity.name];

  if (entity.entityType === "ATTRACTION") {
    const attr = entity as DisneyAttraction;
    if (attr.thrillLevel) parts.push(`${attr.thrillLevel} thrill level`);
    if (attr.heightRequirement) parts.push(`height requirement ${attr.heightRequirement.inches} inches`);
    if (attr.singleRider) parts.push("single rider available");
    if (attr.lightningLane) parts.push(`lightning lane ${attr.lightningLane.tier}`);
  }

  // ... similar for dining, shows

  return parts.join(". ");
}
```

### Embedding Generation

```typescript
// Get embedding provider (OpenAI or Transformers.js)
const provider = await getEmbeddingProvider();

// Generate embedding
const result = await provider.embed(text);

// Store in database
await saveEmbedding(
  entity.id,
  result.embedding,
  result.model,
  result.dimension,
  hash
);
```

### Staleness Detection

Embeddings are regenerated when entity data changes:

```typescript
const hash = hashEmbeddingText(text);
const isStale = await isEmbeddingStale(entityId, hash);

if (isStale) {
  // Regenerate embedding
}
```

## Query Flow

### Fuzzy Search

```
User Query: "Space Mountan" (typo)
      │
      ▼
┌─────────────────────────────────────┐
│ Load candidates from DB             │
│ (filtered by destination/type)      │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ Fuse.js fuzzy matching              │
│ - threshold: 0.4                    │
│ - keys: ['name']                    │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ Results:                            │
│ 1. Space Mountain (score: 0.92)     │
│ 2. Space Mountain (score: 0.85)     │
└─────────────────────────────────────┘
```

### Semantic Search

```
User Query: "thrill rides for teenagers"
      │
      ▼
┌─────────────────────────────────────┐
│ Generate query embedding            │
│ [0.023, -0.156, 0.089, ...]        │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ Load all entity embeddings          │
│ from embeddings table               │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ Cosine similarity calculation       │
│ for each embedding                  │
└─────────────────────────────────────┘
      │
      ▼
┌─────────────────────────────────────┐
│ Top-K results:                      │
│ 1. Expedition Everest (sim: 0.84)   │
│ 2. Rock 'n' Roller Coaster (0.81)   │
│ 3. Tower of Terror (sim: 0.79)      │
└─────────────────────────────────────┘
```

## Response Formatting

All tool responses follow MCP format:

```typescript
return {
  content: [
    {
      type: "text",
      text: JSON.stringify({
        found: true,
        entity: {
          id: "80010190",
          name: "Space Mountain",
          type: "ATTRACTION",
          destination: "wdw",
          park: "Magic Kingdom Park",
          // ... full entity data
        }
      }, null, 2)
    }
  ]
};
```

## Error Handling

Errors at each stage are caught and formatted:

```typescript
try {
  // Pipeline operations
} catch (error) {
  return formatErrorResponse(error);
}

// Formatted error response
{
  "content": [{
    "type": "text",
    "text": "{\"error\": \"Disney API error: 401\", \"code\": \"API_ERROR\"}"
  }],
  "isError": true
}
```

## Performance Considerations

### Parallel Processing

Multiple entity types are fetched in parallel:

```typescript
const [attractions, dining, shows] = await Promise.all([
  client.getAttractions(dest),
  client.getDining(dest),
  client.getShows(dest),
]);
```

### Batch Embedding Generation

Embeddings are generated in batches:

```typescript
const BATCH_SIZE = 50;
for (let i = 0; i < entities.length; i += BATCH_SIZE) {
  const batch = entities.slice(i, i + BATCH_SIZE);
  const texts = batch.map(buildEmbeddingText);
  const results = await provider.embedBatch(texts);
  // Save embeddings
}
```

### Lazy Loading

- Embeddings are generated on-demand or via explicit sync
- Sessions are established only when needed
- Database is initialized lazily on first access
