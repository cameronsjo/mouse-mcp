# mouse-mcp Documentation

Welcome to the mouse-mcp documentation. This MCP server provides Disney Parks data to Claude and other AI applications.

## Quick Links

| Document | Description |
|----------|-------------|
| [Architecture](./architecture.md) | System overview, component design, module structure |
| [Data Pipeline](./data-pipeline.md) | How data flows from APIs to MCP responses |
| [API Clients](./api-clients.md) | Disney and ThemeParks.wiki client details |
| [Embeddings](./embeddings.md) | Semantic search and vector embeddings |
| [Database](./database.md) | SQLite schema and operations |
| [Tools Reference](./tools.md) | Complete MCP tools documentation |
| [Configuration](./configuration.md) | Environment variables and settings |
| [Development](./development.md) | Setup, workflows, contributing |

## Overview

mouse-mcp is an MCP (Model Context Protocol) server that enables Claude Code and other AI applications to query Disney Parks information. It provides:

- **Attraction data**: Height requirements, Lightning Lane status, thrill levels
- **Dining data**: Service types, meal periods, reservations, character dining
- **Search**: Fuzzy name matching and semantic vector search
- **Caching**: 24-hour cache with SQLite persistence
- **Dual sources**: Disney official API with ThemeParks.wiki fallback

## Getting Started

### Installation

```bash
npm install
npm run build
```

### Claude Code Configuration

Add to your MCP configuration:

```json
{
  "mcpServers": {
    "disney": {
      "command": "node",
      "args": ["/path/to/mouse-mcp/dist/index.js"]
    }
  }
}
```

### First Use

1. Call `disney_sync` to preload all park data
2. Use `disney_destinations` to see available parks
3. Query attractions, dining, or search with `disney_entity`

## Architecture at a Glance

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Tools                             │   │
│  │  destinations | attractions | dining | entity | sync │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  API Clients                         │   │
│  │  ┌─────────────────┐    ┌─────────────────┐        │   │
│  │  │ Disney Finder   │───▶│ ThemeParks.wiki │        │   │
│  │  │    (primary)    │    │   (fallback)    │        │   │
│  │  └─────────────────┘    └─────────────────┘        │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   SQLite Database                    │   │
│  │  sessions | cache | entities | embeddings           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

## Supported Destinations

### Walt Disney World Resort (wdw)

- Magic Kingdom Park
- EPCOT
- Disney's Hollywood Studios
- Disney's Animal Kingdom Theme Park

### Disneyland Resort (dlr)

- Disneyland Park
- Disney California Adventure Park

## Key Concepts

### Dual Data Sources

The server uses Disney's official API for rich metadata, automatically falling back to ThemeParks.wiki when authentication fails.

### Caching

API responses are cached for 24 hours in SQLite. Cache persists across restarts.

### Search Modes

- **Fuzzy**: Character-based matching for names ("Space Mountain")
- **Semantic**: Vector similarity for concepts ("thrill rides for teenagers")

### Session Management

Playwright establishes browser sessions on Disney websites to extract authentication cookies.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MOUSE_MCP_LOG_LEVEL` | `INFO` | Log verbosity |
| `MOUSE_MCP_DB_PATH` | `~/.cache/mouse-mcp/disney.db` | Database path |
| `MOUSE_MCP_TIMEOUT` | `30000` | Request timeout (ms) |
| `MOUSE_MCP_EMBEDDING_PROVIDER` | `auto` | Embedding backend |
| `OPENAI_API_KEY` | - | For OpenAI embeddings |

See [Configuration](./configuration.md) for full details.

## Development

```bash
npm run dev       # Development with hot-reload
npm run build     # Compile TypeScript
npm run lint      # Run ESLint
npm test          # Run tests
npm run inspector # Test with MCP inspector
```

See [Development Guide](./development.md) for more.
