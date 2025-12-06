# Structured Output Examples

This document shows the structured output format for each Disney MCP tool.

## list_parks

### Output Schema

```json
{
  "type": "object",
  "properties": {
    "destinations": {
      "type": "array",
      "items": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "name": { "type": "string" },
          "location": { "type": "string" },
          "timezone": { "type": "string" },
          "parks": {
            "type": "array",
            "items": {
              "type": "object",
              "properties": {
                "id": { "type": "string" },
                "name": { "type": "string" },
                "slug": { "type": "string", "nullable": true }
              }
            }
          }
        }
      }
    },
    "_meta": {
      "type": "object",
      "properties": {
        "cachedAt": { "type": "string" },
        "source": { "type": "string", "enum": ["disney", "themeparks-wiki"] }
      }
    }
  }
}
```

### Example Response

```json
{
  "destinations": [
    {
      "id": "wdw",
      "name": "Walt Disney World Resort",
      "location": "Orlando, FL",
      "timezone": "America/New_York",
      "parks": [
        {
          "id": "80007944",
          "name": "Magic Kingdom Park",
          "slug": "magic-kingdom"
        }
      ]
    }
  ],
  "_meta": {
    "cachedAt": "2025-12-06T00:00:00.000Z",
    "source": "disney"
  }
}
```

## find_attractions

### Example Response

```json
{
  "destination": "wdw",
  "parkId": "80007944",
  "count": 1,
  "attractions": [
    {
      "id": "80010190",
      "name": "Space Mountain",
      "slug": "space-mountain",
      "park": "Magic Kingdom Park",
      "location": {
        "latitude": 28.4186,
        "longitude": -81.5781
      },
      "url": "https://disneyworld.disney.go.com/attractions/magic-kingdom/space-mountain/",
      "metadata": {
        "heightRequirement": "44 inches (112 cm)",
        "thrillLevel": "thrill",
        "experienceType": "roller-coaster",
        "duration": "3 minutes"
      },
      "features": {
        "lightningLane": "multi-pass",
        "singleRider": false,
        "riderSwap": true,
        "photopass": true,
        "virtualQueue": false
      },
      "accessibility": {
        "wheelchairAccessible": false
      },
      "tags": ["dark", "indoor", "fast"]
    }
  ]
}
```

## find_dining

### Example Response

```json
{
  "destination": "wdw",
  "parkId": null,
  "count": 1,
  "dining": [
    {
      "id": "90001234",
      "name": "Be Our Guest Restaurant",
      "slug": "be-our-guest-restaurant",
      "park": "Magic Kingdom Park",
      "location": {
        "latitude": 28.4186,
        "longitude": -81.5781
      },
      "url": "https://disneyworld.disney.go.com/dining/magic-kingdom/be-our-guest-restaurant/",
      "metadata": {
        "serviceType": "table-service",
        "priceRange": "$$",
        "cuisine": ["French", "American"],
        "mealPeriods": ["breakfast", "lunch", "dinner"]
      },
      "features": {
        "reservationsAccepted": true,
        "reservationsRequired": true,
        "mobileOrder": false,
        "characterDining": false,
        "disneyDiningPlan": true
      }
    }
  ]
}
```

## search

### Example Response (Name Search)

```json
{
  "query": "space mountain",
  "found": true,
  "confidence": 0.95,
  "bestMatch": {
    "id": "80010190",
    "name": "Space Mountain",
    "type": "ATTRACTION",
    "destination": "wdw",
    "park": "Magic Kingdom Park"
  },
  "alternatives": [
    {
      "name": "Space Mountain (Disneyland)",
      "id": "80010191",
      "type": "ATTRACTION",
      "score": 0.85
    }
  ]
}
```

### Example Response (ID Search)

```json
{
  "found": true,
  "entity": {
    "id": "80010190",
    "name": "Space Mountain",
    "type": "ATTRACTION",
    "destination": "wdw",
    "park": "Magic Kingdom Park",
    "slug": "space-mountain",
    "location": {
      "latitude": 28.4186,
      "longitude": -81.5781
    }
  }
}
```

## discover

### Example Response

```json
{
  "query": "thrill rides",
  "found": true,
  "count": 2,
  "results": [
    {
      "name": "Space Mountain",
      "id": "80010190",
      "type": "ATTRACTION",
      "destination": "wdw",
      "park": "Magic Kingdom Park",
      "score": 0.92,
      "distance": 0.34
    },
    {
      "name": "Big Thunder Mountain Railroad",
      "id": "80010110",
      "type": "ATTRACTION",
      "destination": "wdw",
      "park": "Magic Kingdom Park",
      "score": 0.88,
      "distance": 0.42
    }
  ]
}
```

## status

### Example Response

```json
{
  "server": {
    "version": "1.0.0",
    "uptime": 3600,
    "timestamp": "2025-12-06T00:00:00.000Z"
  },
  "sessions": {
    "wdw": {
      "hasSession": true,
      "isValid": true,
      "expiresAt": "2025-12-06T01:00:00.000Z",
      "errorCount": 0
    },
    "dlr": {
      "hasSession": false,
      "isValid": false,
      "expiresAt": null,
      "errorCount": 0
    }
  },
  "cache": {
    "totalEntries": 100,
    "expiredEntries": 5,
    "sources": {
      "disney": 95,
      "themeparks-wiki": 5
    }
  },
  "database": {
    "entityCount": 500,
    "cacheEntries": 100,
    "sizeKb": 2048
  },
  "health": {
    "databaseHealthy": true,
    "cacheHealthy": true,
    "wdwSessionHealthy": true,
    "dlrSessionHealthy": false
  }
}
```

### Example Response (With Details)

```json
{
  "server": { "..." },
  "sessions": { "..." },
  "cache": { "..." },
  "database": { "..." },
  "health": { "..." },
  "details": {
    "wdw": {
      "attractions": 200,
      "restaurants": 150,
      "shows": 50
    },
    "dlr": {
      "attractions": 100,
      "restaurants": 80,
      "shows": 30
    }
  }
}
```

## initialize

### Example Response

```json
{
  "success": true,
  "message": "Synced 500 entities from wdw",
  "stats": {
    "destinations": ["wdw"],
    "attractions": 200,
    "dining": 150,
    "shows": 50,
    "shops": 80,
    "events": 20,
    "embeddings": {
      "total": 500,
      "byModel": {
        "Xenova/all-MiniLM-L6-v2": 500
      }
    },
    "provider": "Xenova/all-MiniLM-L6-v2",
    "timing": {
      "dataLoadMs": 5000,
      "embeddingMs": 10000
    }
  },
  "note": "All embeddings ready for semantic search."
}
```

## Benefits of Structured Output

1. **Type Safety**: LLMs can validate the response structure
2. **Better Parsing**: No need to parse JSON strings
3. **Field Discovery**: LLMs can discover available fields
4. **Error Handling**: Schema violations are caught early
5. **Documentation**: Self-documenting API responses

## Usage in MCP

When an LLM calls a tool, it receives both:

1. **Text Content** (legacy): JSON stringified response in `content[0].text`
2. **Structured Content** (new): Native JavaScript object in `structuredContent`

LLMs that support structured output will prefer `structuredContent` for more accurate parsing.
