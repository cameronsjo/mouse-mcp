# Disney Parks MCP Server

An MCP (Model Context Protocol) server that provides Disney parks data to Claude Code. Returns structured data for attractions, dining, and other park entities.

## Features

- **Attraction data**: Height requirements, Lightning Lane status, thrill levels, single rider availability
- **Dining data**: Service type, meal periods, cuisine, reservations, mobile ordering
- **Fuzzy search**: Find entities by name with intelligent matching
- **Auto-caching**: 24-hour cache with SQLite persistence
- **Dual data sources**: Disney Finder API (primary) with ThemeParks.wiki fallback

## Installation

```bash
npm install
npm run build
```

## Usage

### With Claude Code

Add to your Claude Code MCP configuration:

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

### Development

```bash
# Run in development mode with auto-reload
npm run dev

# Type check without building
npm run check

# Test with MCP inspector
npm run inspector
```

## Tools

### `disney_destinations`

List all supported Disney destinations with their parks.

```
No parameters required
```

### `disney_attractions`

Get attractions for a destination or park.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `destination` | string | Yes | `wdw` or `dlr` |
| `parkId` | string | No | Filter to specific park |
| `filters.hasLightningLane` | boolean | No | Only Lightning Lane attractions |
| `filters.maxHeightRequirement` | number | No | Max height in inches |
| `filters.thrillLevel` | string | No | `family`, `moderate`, or `thrill` |
| `filters.hasSingleRider` | boolean | No | Only single rider attractions |

### `disney_dining`

Get dining locations for a destination or park.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `destination` | string | Yes | `wdw` or `dlr` |
| `parkId` | string | No | Filter to specific park |
| `filters.serviceType` | string | No | `table-service`, `quick-service`, etc. |
| `filters.mealPeriod` | string | No | `breakfast`, `lunch`, `dinner`, `snacks` |
| `filters.reservationsAccepted` | boolean | No | Only reservation restaurants |
| `filters.characterDining` | boolean | No | Only character dining |

### `disney_entity`

Look up a specific entity by ID or fuzzy name search.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `id` | string | No* | Entity ID for exact lookup |
| `name` | string | No* | Entity name for fuzzy search |
| `destination` | string | No | Limit search to `wdw` or `dlr` |
| `entityType` | string | No | `ATTRACTION` or `RESTAURANT` |

*Either `id` or `name` is required.

### `disney_status`

Get server health and cache statistics.

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `includeDetails` | boolean | No | Include entity breakdown |

## Configuration

Environment variables (all prefixed with `MOUSE_MCP_`):

| Variable | Default | Description |
|----------|---------|-------------|
| `MOUSE_MCP_LOG_LEVEL` | `INFO` | Log level: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `MOUSE_MCP_DB_PATH` | `~/.cache/mouse-mcp/disney.db` | SQLite database path |
| `MOUSE_MCP_TIMEOUT` | `30000` | Request timeout in ms |
| `MOUSE_MCP_HEADLESS` | `true` | Run Playwright in headless mode |

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     MCP Server                               │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                    Tools                             │   │
│  │  destinations | attractions | dining | entity | status │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                  API Clients                         │   │
│  │  ┌─────────────────┐    ┌─────────────────┐        │   │
│  │  │ Disney Finder   │───▶│ ThemeParks.wiki │        │   │
│  │  │    (primary)    │    │   (fallback)    │        │   │
│  │  └─────────────────┘    └─────────────────┘        │   │
│  │           │                                          │   │
│  │  ┌─────────────────┐                                │   │
│  │  │ Session Manager │ (Playwright auth)              │   │
│  │  └─────────────────┘                                │   │
│  └─────────────────────────────────────────────────────┘   │
│                           │                                  │
│  ┌─────────────────────────────────────────────────────┐   │
│  │                   SQLite Database                    │   │
│  │  sessions | cache | entities (with FTS5)            │   │
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

## License

MIT
