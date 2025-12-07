# Embeddings & Semantic Search

This document describes the embedding system that powers semantic search in mouse-mcp.

## Overview

The embedding system enables natural language queries like "thrill rides for teenagers" or "romantic dinner spots" by converting entities and queries into vector representations and finding similar matches.

```
┌───────────────────────────────────────────────────────────────────────┐
│                        Embedding System                                │
│                                                                        │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐    │
│  │ Text Builder   │────▶│   Provider     │────▶│   Storage      │    │
│  │ (preprocess)   │     │  (OpenAI/TF)   │     │   (SQLite)     │    │
│  └────────────────┘     └────────────────┘     └────────────────┘    │
│                                                         │             │
│                                                         ▼             │
│  ┌────────────────┐     ┌────────────────┐     ┌────────────────┐    │
│  │ Query          │────▶│   Similarity   │────▶│   Results      │    │
│  │ Embedding      │     │   Calculation  │     │   Ranking      │    │
│  └────────────────┘     └────────────────┘     └────────────────┘    │
└───────────────────────────────────────────────────────────────────────┘
```

## Embedding Providers

### Provider Factory

`src/embeddings/index.ts`

The system supports multiple embedding providers with automatic fallback:

```typescript
export async function getEmbeddingProvider(
  config?: Partial<EmbeddingConfig>
): Promise<EmbeddingProvider> {
  const provider = config?.provider ?? "auto";
  const openaiKey = config?.openaiApiKey ?? process.env["OPENAI_API_KEY"];

  // Explicit selection
  if (provider === "openai") {
    return new OpenAIEmbeddingProvider(openaiKey, config?.openaiModel);
  }

  if (provider === "transformers") {
    return await TransformersEmbeddingProvider.create();
  }

  // Auto mode: prefer OpenAI if available
  if (openaiKey) {
    const openaiProvider = new OpenAIEmbeddingProvider(openaiKey);
    if (await openaiProvider.isAvailable()) {
      return openaiProvider;
    }
  }

  // Fallback to local Transformers.js
  return await TransformersEmbeddingProvider.create();
}
```

### OpenAI Provider

`src/embeddings/openai.ts`

Uses OpenAI's embedding API for high-quality vectors.

**Configuration**:

- Model: `text-embedding-3-small` (default)
- Dimensions: 1536
- Requires `OPENAI_API_KEY` environment variable

**Methods**:

```typescript
interface EmbeddingProvider {
  readonly modelId: string;      // "text-embedding-3-small"
  readonly fullModelName: string; // "openai:text-embedding-3-small"
  readonly dimension: number;     // 1536

  embed(text: string): Promise<EmbeddingResult>;
  embedBatch(texts: string[]): Promise<BatchEmbeddingResult>;
  isAvailable(): Promise<boolean>;
}
```

**Example Usage**:

```typescript
const provider = new OpenAIEmbeddingProvider(apiKey);
const result = await provider.embed("Space Mountain thrill ride");
// result.embedding: number[1536]
// result.model: "text-embedding-3-small"
// result.dimension: 1536
```

### Transformers.js Provider

`src/embeddings/transformers.ts`

Local CPU-based embeddings using the Xenova/Transformers.js library.

**Configuration**:

- Model: `Xenova/all-MiniLM-L6-v2`
- Dimensions: 384
- No API key required
- First run downloads model (~23MB)

**Methods**:

Same interface as OpenAI provider.

**Example Usage**:

```typescript
const provider = await TransformersEmbeddingProvider.create();
const result = await provider.embed("Space Mountain thrill ride");
// result.embedding: number[384]
// result.model: "all-MiniLM-L6-v2"
// result.dimension: 384
```

## Text Preprocessing

`src/embeddings/text-builder.ts`

Entities are converted to searchable text that captures their key characteristics.

### buildEmbeddingText()

```typescript
export function buildEmbeddingText(entity: DisneyEntity): string {
  const parts: string[] = [entity.name];

  // Add destination context
  parts.push(`at ${getDestinationName(entity.destinationId)}`);

  if (entity.parkName) {
    parts.push(`in ${entity.parkName}`);
  }

  // Type-specific attributes
  if (entity.entityType === "ATTRACTION") {
    const attr = entity as DisneyAttraction;
    if (attr.thrillLevel) {
      parts.push(`${attr.thrillLevel} thrill level ride`);
    }
    if (attr.heightRequirement) {
      parts.push(`height requirement ${attr.heightRequirement.inches} inches`);
    }
    if (attr.singleRider) {
      parts.push("single rider line available");
    }
    if (attr.lightningLane) {
      parts.push(`lightning lane ${attr.lightningLane.tier}`);
    }
    if (attr.experienceType) {
      parts.push(attr.experienceType);
    }
  }

  if (entity.entityType === "RESTAURANT") {
    const dining = entity as DisneyDining;
    if (dining.serviceType) {
      parts.push(`${dining.serviceType} restaurant`);
    }
    if (dining.cuisineTypes.length > 0) {
      parts.push(dining.cuisineTypes.join(", ") + " cuisine");
    }
    if (dining.characterDining) {
      parts.push("character dining experience");
    }
    if (dining.mealPeriods.length > 0) {
      parts.push(`serves ${dining.mealPeriods.join(", ")}`);
    }
  }

  if (entity.entityType === "SHOW") {
    const show = entity as DisneyShow;
    if (show.showType) {
      parts.push(`${show.showType} entertainment`);
    }
  }

  return parts.join(". ");
}
```

**Example Output**:

```
Input: Space Mountain attraction
Output: "Space Mountain. at Walt Disney World Resort. in Magic Kingdom Park.
         thrill thrill level ride. height requirement 44 inches.
         lightning lane multi-pass. indoor roller coaster."

Input: Be Our Guest Restaurant
Output: "Be Our Guest Restaurant. at Walt Disney World Resort.
         in Magic Kingdom Park. table-service restaurant.
         French cuisine. serves lunch, dinner."
```

### hashEmbeddingText()

Creates a hash of the embedding text to detect when re-embedding is needed:

```typescript
export function hashEmbeddingText(text: string): string {
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    const char = text.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return hash.toString(16);
}
```

## Embedding Storage

`src/db/embeddings.ts`

Embeddings are stored in SQLite for persistence across restarts.

### Schema

```sql
CREATE TABLE IF NOT EXISTS embeddings (
  entity_id TEXT PRIMARY KEY,
  embedding TEXT NOT NULL,          -- JSON array of numbers
  embedding_model TEXT NOT NULL,    -- "openai:text-embedding-3-small"
  embedding_dim INTEGER NOT NULL,   -- 1536 or 384
  input_text_hash TEXT NOT NULL,    -- Hash for staleness detection
  created_at TEXT NOT NULL,
  FOREIGN KEY (entity_id) REFERENCES entities(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_embeddings_model ON embeddings(embedding_model);
```

### Operations

```typescript
// Save embedding
async function saveEmbedding(
  entityId: string,
  embedding: number[],
  model: string,
  dimension: number,
  inputTextHash: string
): Promise<void>

// Get all embeddings for a model
async function getAllEmbeddings(
  model: string
): Promise<StoredEmbedding[]>

// Check if embedding needs regeneration
async function isEmbeddingStale(
  entityId: string,
  currentHash: string
): Promise<boolean>

// Get embedding statistics
async function getEmbeddingStats(): Promise<{
  total: number;
  byModel: Record<string, number>;
}>
```

## Similarity Calculation

`src/embeddings/similarity.ts`

### Cosine Similarity

```typescript
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have same dimension");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}
```

### Top-K Selection

```typescript
interface SimilarityMatch {
  index: number;
  similarity: number;
}

export function topKSimilar(
  query: number[],
  vectors: number[][],
  k: number
): SimilarityMatch[] {
  const similarities: SimilarityMatch[] = vectors.map((vec, index) => ({
    index,
    similarity: cosineSimilarity(query, vec),
  }));

  // Sort by similarity descending
  similarities.sort((a, b) => b.similarity - a.similarity);

  return similarities.slice(0, k);
}
```

### Score Normalization

```typescript
export function normalizeScore(
  similarity: number,
  minThreshold: number
): number {
  // Map [minThreshold, 1.0] to [0.0, 1.0]
  if (similarity < minThreshold) {
    return 0;
  }
  return (similarity - minThreshold) / (1 - minThreshold);
}
```

## Semantic Search

`src/embeddings/search.ts`

### semanticSearch()

Main search function that combines all components:

```typescript
export async function semanticSearch<T extends DisneyEntity>(
  query: string,
  options: SemanticSearchOptions = {}
): Promise<SemanticSearchResult<T>[]> {
  const { limit = 10, minScore = 0.3 } = options;

  // 1. Get embedding provider
  const provider = await getEmbeddingProvider();

  // 2. Generate query embedding
  const queryResult = await provider.embed(query);
  const queryVector = queryResult.embedding;

  // 3. Load all entity embeddings
  const allEmbeddings = await getAllEmbeddings(provider.fullModelName);

  if (allEmbeddings.length === 0) {
    return [];
  }

  // 4. Calculate similarities
  const vectors = allEmbeddings.map((e) => e.embedding);
  const entityIds = allEmbeddings.map((e) => e.entityId);
  const topMatches = topKSimilar(queryVector, vectors, limit * 3);

  // 5. Load entities and apply filters
  const results: SemanticSearchResult<T>[] = [];

  for (const match of topMatches) {
    if (results.length >= limit) break;

    const entityId = entityIds[match.index];
    const entity = await getEntityById<T>(entityId);

    if (!entity) continue;

    // Apply destination/type filters
    if (options.destinationId && entity.destinationId !== options.destinationId) {
      continue;
    }
    if (options.entityType && entity.entityType !== options.entityType) {
      continue;
    }

    // Apply score threshold
    const score = normalizeScore(match.similarity, minScore);
    if (score <= 0) continue;

    results.push({
      entity,
      score,
      similarity: match.similarity,
    });
  }

  return results;
}
```

### Search Options

```typescript
interface SemanticSearchOptions {
  readonly destinationId?: DestinationId;  // Filter to wdw or dlr
  readonly entityType?: EntityType;         // ATTRACTION, RESTAURANT, SHOW
  readonly limit?: number;                  // Max results (default: 10)
  readonly minScore?: number;               // Minimum similarity (default: 0.3)
}
```

### Search Result

```typescript
interface SemanticSearchResult<T extends DisneyEntity> {
  readonly entity: T;         // Full entity data
  readonly score: number;     // Normalized score [0, 1]
  readonly similarity: number; // Raw cosine similarity [-1, 1]
}
```

## Batch Embedding Generation

For bulk operations like initial sync:

```typescript
export async function ensureEmbeddingsBatch(
  entities: DisneyEntity[]
): Promise<number> {
  const provider = await getEmbeddingProvider();
  let generated = 0;

  // Filter to entities needing embeddings
  const needsEmbedding: Array<{
    entity: DisneyEntity;
    text: string;
    hash: string;
  }> = [];

  for (const entity of entities) {
    const text = buildEmbeddingText(entity);
    const hash = hashEmbeddingText(text);

    if (await isEmbeddingStale(entity.id, hash)) {
      needsEmbedding.push({ entity, text, hash });
    }
  }

  // Process in batches
  const BATCH_SIZE = 50;

  for (let i = 0; i < needsEmbedding.length; i += BATCH_SIZE) {
    const batch = needsEmbedding.slice(i, i + BATCH_SIZE);
    const texts = batch.map((b) => b.text);

    const results = await provider.embedBatch(texts);

    for (let j = 0; j < batch.length; j++) {
      const item = batch[j];
      const result = results.embeddings[j];

      await saveEmbedding(
        item.entity.id,
        result.embedding,
        result.model,
        result.dimension,
        item.hash
      );
      generated++;
    }
  }

  return generated;
}
```

## Usage Examples

### Basic Semantic Search

```typescript
// Find thrill rides for teenagers
const results = await semanticSearch<DisneyAttraction>(
  "thrill rides for teenagers",
  { entityType: "ATTRACTION", limit: 5 }
);

// results[0].entity.name: "Expedition Everest"
// results[0].score: 0.84
```

### Filtered Search

```typescript
// Find romantic restaurants at WDW
const results = await semanticSearch<DisneyDining>(
  "romantic dinner date night",
  {
    destinationId: "wdw",
    entityType: "RESTAURANT",
    limit: 10,
    minScore: 0.4
  }
);
```

### Ensuring Embeddings

```typescript
// Single entity
await ensureEmbedding(entity);

// Batch
const count = await ensureEmbeddingsBatch(entities);
console.log(`Generated ${count} embeddings`);
```

## Performance Considerations

### Memory Usage

- OpenAI embeddings: 1536 * 4 bytes = 6KB per entity
- Transformers.js: 384 * 4 bytes = 1.5KB per entity
- ~500 entities = 3MB (OpenAI) or 750KB (Transformers.js)

### Latency

- OpenAI API call: 100-500ms per embed
- Transformers.js: 50-200ms per embed (after model load)
- Batch operations: Much more efficient

### Staleness Detection

Embeddings are only regenerated when entity data changes:

```typescript
const hash = hashEmbeddingText(text);
if (await isEmbeddingStale(entityId, hash)) {
  // Regenerate
}
```

## E5-Style Query/Document Prefixes

Some embedding models are trained with **asymmetric prefixes** to distinguish between documents (stored content) and queries (search input). This technique was popularized by E5 models and is also used by BGE and GTE models.

### What Are E5 Prefixes?

When enabled, text is prefixed before embedding:
- **Documents** (stored entities): `"passage: Space Mountain thrill ride..."`
- **Queries** (search input): `"query: thrill rides for teenagers"`

These prefixes tell the model to embed the text differently:
- Documents are optimized for being found
- Queries are optimized for finding relevant documents

### When Do E5 Prefixes Help?

| Model | Uses Prefixes | Notes |
|-------|---------------|-------|
| `E5-base-v2`, `E5-large-v2` | ✅ Yes | Trained with prefixes |
| `BGE-base-en-v1.5`, `BGE-large-en` | ✅ Yes | Trained with prefixes |
| `GTE-base`, `GTE-large` | ✅ Yes | Trained with prefixes |
| `all-MiniLM-L6-v2` | ❌ No | Not trained with prefixes |
| OpenAI `text-embedding-3-*` | ❌ No | Not trained with prefixes |

**Rule of thumb**: If a model's documentation mentions "query:" and "passage:" or "document:" prefixes, enable them. Otherwise, keep them disabled.

### Configuration

Prefixes are controlled by the `MOUSE_MCP_E5_PREFIXES` environment variable:

```bash
# Disable prefixes (default, works with all-MiniLM-L6-v2 and OpenAI)
MOUSE_MCP_E5_PREFIXES=false

# Enable prefixes (use with E5, BGE, or GTE models)
MOUSE_MCP_E5_PREFIXES=true
```

**Important**: Changing this setting invalidates all existing embeddings. The text hash includes whether prefixes were applied, so embeddings will be regenerated on next sync.

### Why This Matters

Without prefixes on a prefix-trained model, you may see:
- Lower search quality
- Queries returning irrelevant results
- Similar items not clustering correctly

With prefixes on a model that doesn't use them:
- Slightly reduced quality (the prefix is just noise)
- Wasted token space on the prefix text

The default setting (`false`) is safe for the built-in `all-MiniLM-L6-v2` model and OpenAI embeddings.

## Configuration

Environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `MOUSE_MCP_EMBEDDING_PROVIDER` | `auto` | `openai`, `transformers`, or `auto` |
| `OPENAI_API_KEY` | - | Required for OpenAI provider |
| `MOUSE_MCP_E5_PREFIXES` | `false` | Enable E5-style query/document prefixes |
