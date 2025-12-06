# Architecture Overview

This document describes the high-level architecture of mouse-mcp, an MCP server that provides Disney Parks data to Claude and other AI applications.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           MCP Protocol Layer                             │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                    DisneyMcpServer                               │   │
│  │  - ListTools handler                                             │   │
│  │  - CallTool handler                                              │   │
│  │  - stdio transport                                               │   │
│  └─────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                              Tools Layer                                 │
│  ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐ │
│  │destinations│ │attractions│ │  dining   │ │  entity   │ │   sync    │ │
│  └───────────┘ └───────────┘ └───────────┘ └───────────┘ └───────────┘ │
│                              ┌───────────┐                               │
│                              │  status   │                               │
│                              └───────────┘                               │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌──────────────────────┐ ┌──────────────────┐ ┌──────────────────────────┐
│    API Clients       │ │    Database      │ │      Embeddings          │
│  ┌────────────────┐  │ │  ┌────────────┐  │ │  ┌────────────────────┐  │
│  │ Disney Finder  │  │ │  │  SQLite    │  │ │  │  OpenAI Provider   │  │
│  │   (primary)    │  │ │  │  (sql.js)  │  │ │  └────────────────────┘  │
│  └────────────────┘  │ │  └────────────┘  │ │  ┌────────────────────┐  │
│  ┌────────────────┐  │ │                  │ │  │ Transformers.js    │  │
│  │ThemeParks.wiki │  │ │  - sessions      │ │  │   (local)          │  │
│  │  (fallback)    │  │ │  - cache         │ │  └────────────────────┘  │
│  └────────────────┘  │ │  - entities      │ │                          │
│  ┌────────────────┐  │ │  - embeddings    │ │  - Semantic search       │
│  │SessionManager  │  │ │                  │ │  - Text preprocessing    │
│  │  (Playwright)  │  │ │                  │ │  - Vector similarity     │
│  └────────────────┘  │ │                  │ │                          │
└──────────────────────┘ └──────────────────┘ └──────────────────────────┘
```

## Core Components

### 1. MCP Server (`src/server.ts`)

The main entry point that handles the Model Context Protocol:

- **Server initialization**: Creates MCP server with tool capabilities
- **Request handlers**: Routes ListTools and CallTool requests
- **Error handling**: Graceful shutdown and error recovery
- **Transport**: Uses stdio for Claude Code communication

### 2. Tools Layer (`src/tools/`)

Six MCP tools expose Disney data to AI applications:

| Tool | Purpose |
|------|---------|
| `disney_destinations` | List all supported parks and resorts |
| `disney_attractions` | Get attractions with filtering |
| `disney_dining` | Get dining locations with filtering |
| `disney_entity` | Search entities by name (fuzzy/semantic) |
| `disney_status` | Health checks and cache statistics |
| `disney_sync` | Preload data and generate embeddings |

### 3. API Clients (`src/clients/`)

Data sourcing with automatic fallback:

- **DisneyFinderClient**: Primary source using Disney's official API
  - Requires browser-based authentication
  - Provides rich metadata (Lightning Lane, height requirements)
- **ThemeParksWikiClient**: Fallback when Disney auth fails
  - No authentication required
  - REST API at `api.themeparks.wiki`
- **SessionManager**: Playwright-based authentication
  - Establishes browser sessions on Disney websites
  - Extracts cookies for API requests
  - Daily session refresh with persistence

### 4. Database Layer (`src/db/`)

SQLite persistence using sql.js (WebAssembly):

- **sessions**: Authentication state per destination
- **cache**: API responses with TTL expiration
- **entities**: Normalized attraction/dining/show data
- **embeddings**: Vector embeddings for semantic search

### 5. Embeddings System (`src/embeddings/`)

Semantic search capabilities:

- **OpenAI Provider**: Cloud-based embeddings (when API key available)
- **Transformers.js Provider**: Local CPU-based embeddings (fallback)
- **Search**: Vector similarity with top-K filtering
- **Text Builder**: Entity preprocessing for embedding generation

## Design Principles

### Dual Data Source Pattern

```
┌─────────────────┐      ┌─────────────────┐
│  Disney Finder  │─────▶│ ThemeParks.wiki │
│   (primary)     │ fail │   (fallback)    │
└─────────────────┘      └─────────────────┘
```

The system always attempts Disney's official API first for richer data, then falls back to ThemeParks.wiki on authentication failure.

### Caching Strategy

- **24-hour TTL** for most entity data (attractions, dining, shows)
- **7-day TTL** for static destination data
- **SQLite persistence** survives process restarts
- **Automatic expiration cleanup** on startup

### Search Architecture

Two complementary search modes:

1. **Fuzzy Search** (default): Character-based name matching using Fuse.js
   - Best for: "Space Mountain", "Be Our Guest"
2. **Semantic Search**: Vector similarity using embeddings
   - Best for: "thrill rides for teenagers", "romantic dinner spots"

### Session Management

```
┌──────────┐    ┌───────────┐    ┌─────────────┐
│ Request  │───▶│  Session  │───▶│  Playwright │
│          │    │  Manager  │    │  Browser    │
└──────────┘    └───────────┘    └─────────────┘
                     │
                     ▼
              ┌─────────────┐
              │   SQLite    │
              │  (persist)  │
              └─────────────┘
```

Sessions are:

- Established via Playwright browser automation
- Persisted in SQLite for reuse across restarts
- Refreshed automatically when expired
- Deduplicated to prevent concurrent refresh storms

## Data Flow

### Typical Request Flow

```
1. Claude sends CallTool(disney_attractions, {destination: "wdw"})
         │
         ▼
2. Tool handler checks cache for "attractions:wdw"
         │
    ┌────┴────┐
    │ cached? │
    └────┬────┘
         │
    yes  │  no
    ┌────┘  └────┐
    │            │
    ▼            ▼
3a. Return   3b. DisneyFinderClient.getAttractions("wdw")
    cached            │
    data              ▼
              4. SessionManager.getAuthHeaders("wdw")
                      │
                      ▼
              5. Fetch from Disney API (or fallback)
                      │
                      ▼
              6. Normalize response
                      │
                      ▼
              7. Cache + persist to SQLite
                      │
                      ▼
              8. Return to tool handler
                      │
                      ▼
              9. Format MCP response
                      │
                      ▼
             10. Return to Claude
```

## Module Dependencies

```
index.ts
    └── server.ts
            ├── tools/*
            │       ├── clients/*
            │       │       └── session-manager.ts
            │       ├── db/*
            │       └── embeddings/*
            └── shared/*
                    ├── logger.ts
                    ├── errors.ts
                    └── retry.ts
```

## Error Handling

The system uses a hierarchy of custom errors:

```
DisneyMcpError (base)
    ├── SessionError     - Authentication failures
    ├── ApiError         - HTTP request failures
    ├── CacheError       - Caching issues
    ├── DatabaseError    - SQLite operations
    └── ValidationError  - Input validation
```

All errors are formatted consistently for MCP responses using `formatErrorResponse()`.

## Threading Model

- **Single-threaded**: Node.js event loop
- **Async I/O**: All database and network operations use async/await
- **Background tasks**: Embedding generation runs asynchronously
- **Deduplication**: Concurrent refresh requests are merged

## File Organization

```
src/
├── index.ts              # CLI entry point
├── server.ts             # MCP server implementation
├── config/
│   └── index.ts          # Environment configuration
├── types/
│   ├── disney.ts         # Entity type definitions
│   ├── session.ts        # Session types
│   └── index.ts          # Type exports
├── clients/
│   ├── index.ts          # Client exports
│   ├── disney-finder.ts  # Disney API client
│   ├── themeparks-wiki.ts # Fallback API client
│   └── session-manager.ts # Playwright auth
├── tools/
│   ├── index.ts          # Tool registration
│   ├── types.ts          # Tool interfaces
│   ├── destinations.ts   # List destinations
│   ├── attractions.ts    # Get attractions
│   ├── dining.ts         # Get dining
│   ├── entity.ts         # Entity search
│   ├── status.ts         # Health checks
│   └── sync.ts           # Data preloading
├── db/
│   ├── index.ts          # Database exports
│   ├── database.ts       # SQLite connection
│   ├── schema.ts         # Table definitions
│   ├── cache.ts          # Cache operations
│   ├── entities.ts       # Entity CRUD
│   ├── embeddings.ts     # Embedding storage
│   └── sessions.ts       # Session persistence
├── embeddings/
│   ├── index.ts          # Provider factory
│   ├── types.ts          # Embedding interfaces
│   ├── openai.ts         # OpenAI provider
│   ├── transformers.ts   # Local provider
│   ├── search.ts         # Semantic search
│   ├── text-builder.ts   # Text preprocessing
│   └── similarity.ts     # Vector operations
└── shared/
    ├── index.ts          # Shared exports
    ├── logger.ts         # Structured logging
    ├── errors.ts         # Custom errors
    ├── retry.ts          # Exponential backoff
    └── fuzzy-match.ts    # Fuse.js wrapper
```
