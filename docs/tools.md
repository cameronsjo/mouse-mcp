# MCP Tools Reference

This document provides detailed reference for all MCP tools exposed by mouse-mcp.

## Overview

mouse-mcp exposes 6 tools through the Model Context Protocol:

| Tool | Purpose |
|------|---------|
| `disney_destinations` | List all supported parks and resorts |
| `disney_attractions` | Get attractions with filtering |
| `disney_dining` | Get dining locations with filtering |
| `disney_entity` | Search entities by name or semantically |
| `disney_status` | Health checks and statistics |
| `disney_sync` | Preload data and generate embeddings |

## disney_destinations

List all supported Disney destinations with their parks.

### Source

`src/tools/destinations.ts`

### Parameters

None required.

### Response

```json
{
  "destinations": [
    {
      "id": "wdw",
      "name": "Walt Disney World Resort",
      "location": "Orlando, FL",
      "timezone": "America/New_York",
      "parks": [
        { "id": "80007944", "name": "Magic Kingdom Park", "slug": "magic-kingdom" },
        { "id": "80007838", "name": "EPCOT", "slug": "epcot" },
        { "id": "80007998", "name": "Disney's Hollywood Studios", "slug": "hollywood-studios" },
        { "id": "80007823", "name": "Disney's Animal Kingdom Theme Park", "slug": "animal-kingdom" }
      ]
    },
    {
      "id": "dlr",
      "name": "Disneyland Resort",
      "location": "Anaheim, CA",
      "timezone": "America/Los_Angeles",
      "parks": [
        { "id": "330339", "name": "Disneyland Park", "slug": "disneyland" },
        { "id": "336894", "name": "Disney California Adventure Park", "slug": "california-adventure" }
      ]
    }
  ]
}
```

### Example Usage

```
Use disney_destinations to list all parks
```

## disney_attractions

Get attractions for a destination or park with optional filtering.

### Source

`src/tools/attractions.ts`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `destination` | string | **Yes** | `"wdw"` or `"dlr"` |
| `parkId` | string | No | Filter to specific park ID |
| `filters.hasLightningLane` | boolean | No | Only Lightning Lane attractions |
| `filters.maxHeightRequirement` | number | No | Max height in inches |
| `filters.thrillLevel` | string | No | `"family"`, `"moderate"`, or `"thrill"` |
| `filters.hasSingleRider` | boolean | No | Only single rider attractions |

### Response

```json
{
  "destination": "wdw",
  "parkId": "80007944",
  "count": 42,
  "attractions": [
    {
      "id": "80010190",
      "name": "Space Mountain",
      "slug": "space-mountain",
      "type": "ATTRACTION",
      "destination": "wdw",
      "park": "Magic Kingdom Park",
      "parkId": "80007944",
      "heightRequirement": {
        "inches": 44,
        "centimeters": 112,
        "description": "44 in"
      },
      "thrillLevel": "thrill",
      "lightningLane": {
        "tier": "multi-pass",
        "available": true
      },
      "singleRider": false,
      "riderSwap": true,
      "virtualQueue": false,
      "wheelchairAccessible": true
    }
  ],
  "cacheInfo": {
    "source": "disney",
    "cachedAt": "2024-01-15T10:30:00.000Z",
    "expiresAt": "2024-01-16T10:30:00.000Z"
  }
}
```

### Example Usage

```
Use disney_attractions with destination "wdw" and filters.thrillLevel "thrill"
```

```
Get Magic Kingdom attractions with disney_attractions destination "wdw" parkId "80007944"
```

## disney_dining

Get dining locations for a destination or park with optional filtering.

### Source

`src/tools/dining.ts`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `destination` | string | **Yes** | `"wdw"` or `"dlr"` |
| `parkId` | string | No | Filter to specific park ID |
| `filters.serviceType` | string | No | `"table-service"`, `"quick-service"`, `"character-dining"`, `"fine-signature-dining"`, `"lounge"`, `"food-cart"` |
| `filters.mealPeriod` | string | No | `"breakfast"`, `"lunch"`, `"dinner"`, `"snacks"` |
| `filters.reservationsAccepted` | boolean | No | Only reservation restaurants |
| `filters.characterDining` | boolean | No | Only character dining |
| `filters.mobileOrder` | boolean | No | Only mobile order locations |

### Response

```json
{
  "destination": "wdw",
  "count": 85,
  "dining": [
    {
      "id": "90001314",
      "name": "Be Our Guest Restaurant",
      "slug": "be-our-guest-restaurant",
      "type": "RESTAURANT",
      "destination": "wdw",
      "park": "Magic Kingdom Park",
      "parkId": "80007944",
      "serviceType": "table-service",
      "mealPeriods": ["lunch", "dinner"],
      "cuisineTypes": ["French"],
      "priceRange": {
        "symbol": "$$$",
        "description": "$$$ (Expensive)"
      },
      "mobileOrder": false,
      "reservationsRequired": true,
      "reservationsAccepted": true,
      "characterDining": false,
      "disneyDiningPlan": true
    }
  ],
  "cacheInfo": {
    "source": "disney",
    "cachedAt": "2024-01-15T10:30:00.000Z",
    "expiresAt": "2024-01-16T10:30:00.000Z"
  }
}
```

### Example Usage

```
Use disney_dining with destination "wdw" and filters.characterDining true
```

```
Find quick service at EPCOT with disney_dining destination "wdw" parkId "80007838" filters.serviceType "quick-service"
```

## disney_entity

Look up a specific entity by ID or search by name. Supports fuzzy and semantic search.

### Source

`src/tools/entity.ts`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | No* | Entity ID for exact lookup |
| `name` | string | No* | Search query |
| `destination` | string | No | Limit search to `"wdw"` or `"dlr"` |
| `entityType` | string | No | `"ATTRACTION"`, `"RESTAURANT"`, or `"SHOW"` |
| `searchMode` | string | No | `"fuzzy"` (default) or `"semantic"` |

*Either `id` or `name` is required.

### Search Modes

**Fuzzy Search** (default):

- Character-based matching using Fuse.js
- Best for: exact names with typos ("Space Mountan")
- Fast, works offline

**Semantic Search**:

- Vector similarity using embeddings
- Best for: conceptual queries ("thrill rides for teenagers")
- Requires embeddings to be generated

### Response (Fuzzy Search)

```json
{
  "query": "space mountain",
  "searchMode": "fuzzy",
  "found": true,
  "confidence": 0.92,
  "bestMatch": {
    "id": "80010190",
    "name": "Space Mountain",
    "type": "ATTRACTION",
    "destination": "wdw",
    "park": "Magic Kingdom Park"
  },
  "alternatives": [
    {
      "name": "Space Mountain",
      "id": "353295",
      "type": "ATTRACTION",
      "score": 0.85
    }
  ]
}
```

### Response (Semantic Search)

```json
{
  "query": "thrill rides for teenagers",
  "searchMode": "semantic",
  "found": true,
  "confidence": 0.84,
  "similarity": 0.78,
  "bestMatch": {
    "id": "80010210",
    "name": "Expedition Everest",
    "type": "ATTRACTION",
    "destination": "wdw",
    "park": "Disney's Animal Kingdom Theme Park"
  },
  "alternatives": [
    {
      "name": "Rock 'n' Roller Coaster",
      "id": "80010218",
      "type": "ATTRACTION",
      "score": 0.81,
      "similarity": 0.74
    }
  ]
}
```

### Example Usage

```
Use disney_entity with id "80010190"
```

```
Search for "Be Our Guest" with disney_entity name "Be Our Guest"
```

```
Find romantic dinner spots with disney_entity name "romantic dinner date night" searchMode "semantic" entityType "RESTAURANT"
```

## disney_status

Get server health and cache statistics.

### Source

`src/tools/status.ts`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeDetails` | boolean | No | Include entity breakdown |

### Response

```json
{
  "status": "healthy",
  "sessions": {
    "wdw": {
      "hasSession": true,
      "isValid": true,
      "expiresAt": "2024-01-16T10:30:00.000Z",
      "errorCount": 0
    },
    "dlr": {
      "hasSession": true,
      "isValid": true,
      "expiresAt": "2024-01-16T10:30:00.000Z",
      "errorCount": 0
    }
  },
  "cache": {
    "entries": 12,
    "expiredPurged": 0
  },
  "entities": {
    "total": 487,
    "byType": {
      "ATTRACTION": 215,
      "RESTAURANT": 198,
      "SHOW": 74
    },
    "byDestination": {
      "wdw": 345,
      "dlr": 142
    }
  },
  "embeddings": {
    "total": 487,
    "byModel": {
      "openai:text-embedding-3-small": 487
    }
  },
  "uptime": "2h 15m 30s"
}
```

### Example Usage

```
Check server health with disney_status includeDetails true
```

## disney_sync

Preload all entity data and generate embeddings for semantic search.

### Source

`src/tools/sync.ts`

### Parameters

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `destination` | string | No | Sync specific destination only |
| `skipEmbeddings` | boolean | No | Skip embedding generation |

### Response

```json
{
  "success": true,
  "message": "Synced 487 entities from wdw, dlr",
  "stats": {
    "destinations": ["wdw", "dlr"],
    "attractions": 215,
    "dining": 198,
    "shows": 74,
    "embeddings": {
      "total": 487,
      "byModel": {
        "openai:text-embedding-3-small": 487
      }
    },
    "provider": "openai:text-embedding-3-small",
    "timing": {
      "dataLoadMs": 3250,
      "embeddingMs": 12500
    }
  },
  "note": "All embeddings ready for semantic search."
}
```

### Example Usage

```
Initialize the system with disney_sync
```

```
Sync only WDW data with disney_sync destination "wdw"
```

```
Quick sync without embeddings with disney_sync skipEmbeddings true
```

## Error Handling

All tools return consistent error responses:

```json
{
  "error": "Disney API error: 401",
  "code": "API_ERROR"
}
```

### Error Codes

| Code | Description |
|------|-------------|
| `VALIDATION_ERROR` | Invalid input parameters |
| `API_ERROR` | External API failure |
| `SESSION_ERROR` | Authentication failure |
| `CACHE_ERROR` | Caching issue |
| `DATABASE_ERROR` | SQLite operation failure |
| `UNKNOWN_ERROR` | Unexpected error |

## Tool Registration

Tools are registered in `src/tools/index.ts`:

```typescript
const tools: ToolEntry[] = [
  { definition: destinations.definition, handler: destinations.handler },
  { definition: attractions.definition, handler: attractions.handler },
  { definition: dining.definition, handler: dining.handler },
  { definition: entity.definition, handler: entity.handler },
  { definition: status.definition, handler: status.handler },
  { definition: sync.definition, handler: sync.handler },
];
```

Each tool exports:

- `definition`: MCP tool schema with name, description, and inputSchema
- `handler`: Async function that processes requests and returns MCP responses
