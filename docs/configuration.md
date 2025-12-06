# Configuration Guide

This document describes all configuration options for mouse-mcp.

## Overview

mouse-mcp uses environment variables for configuration. All application-specific variables are prefixed with `MOUSE_MCP_` to avoid conflicts.

## Environment Variables

### Core Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | `development` | Environment mode: `development`, `production`, `test` |
| `MOUSE_MCP_LOG_LEVEL` | `DEBUG` (dev) / `INFO` (prod) | Log verbosity: `DEBUG`, `INFO`, `WARN`, `ERROR` |
| `MOUSE_MCP_DB_PATH` | `~/.cache/mouse-mcp/disney.db` | SQLite database file path |
| `MOUSE_MCP_TIMEOUT` | `30000` | HTTP request timeout in milliseconds |

### Session Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `MOUSE_MCP_HEADLESS` | `true` | Run Playwright browser in headless mode |
| `MOUSE_MCP_REFRESH_BUFFER` | `60` | Session refresh buffer in minutes |

### Embedding Settings

| Variable | Default | Description |
|----------|---------|-------------|
| `MOUSE_MCP_EMBEDDING_PROVIDER` | `auto` | Provider: `openai`, `transformers`, `auto` |
| `OPENAI_API_KEY` | - | OpenAI API key (required for `openai` provider) |

## Configuration Loading

Configuration is loaded once and cached:

```typescript
// src/config/index.ts

export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const nodeEnv = (process.env["NODE_ENV"] ?? "development") as Config["nodeEnv"];
  const defaultDbPath = join(homedir(), ".cache", "mouse-mcp", "disney.db");

  cachedConfig = {
    nodeEnv,
    logLevel: parseLogLevel(process.env["MOUSE_MCP_LOG_LEVEL"], nodeEnv),
    dbPath: process.env["MOUSE_MCP_DB_PATH"] ?? defaultDbPath,
    refreshBufferMinutes: parseInt(process.env["MOUSE_MCP_REFRESH_BUFFER"] ?? "60", 10),
    timeoutMs: parseInt(process.env["MOUSE_MCP_TIMEOUT"] ?? "30000", 10),
    headless: process.env["MOUSE_MCP_HEADLESS"] !== "false",
    embeddingProvider: parseEmbeddingProvider(process.env["MOUSE_MCP_EMBEDDING_PROVIDER"]),
    openaiApiKey: process.env["OPENAI_API_KEY"],
  };

  return cachedConfig;
}
```

## Configuration Interface

```typescript
export interface Config {
  readonly nodeEnv: "development" | "production" | "test";
  readonly logLevel: LogLevel;
  readonly dbPath: string;
  readonly refreshBufferMinutes: number;
  readonly timeoutMs: number;
  readonly headless: boolean;
  readonly embeddingProvider: EmbeddingProviderType;
  readonly openaiApiKey: string | undefined;
}

export type LogLevel = "DEBUG" | "INFO" | "WARN" | "ERROR";
export type EmbeddingProviderType = "openai" | "transformers" | "auto";
```

## Detailed Settings

### Log Level

Controls log output verbosity:

| Level | Description |
|-------|-------------|
| `DEBUG` | All messages including debugging info |
| `INFO` | Informational messages and above |
| `WARN` | Warnings and errors only |
| `ERROR` | Errors only |

**Default behavior**:

- Development: `DEBUG`
- Production: `INFO`

**Example**:

```bash
MOUSE_MCP_LOG_LEVEL=WARN npm start
```

### Database Path

Location of the SQLite database file.

**Default**: `~/.cache/mouse-mcp/disney.db`

The directory is created automatically if it doesn't exist.

**Example**:

```bash
MOUSE_MCP_DB_PATH=/data/disney.db npm start
```

### Request Timeout

Maximum time to wait for HTTP requests to Disney/ThemeParks.wiki APIs.

**Default**: `30000` (30 seconds)

**Range**: 1000 - 120000 (1 second to 2 minutes)

**Example**:

```bash
MOUSE_MCP_TIMEOUT=60000 npm start  # 60 second timeout
```

### Headless Mode

Controls whether Playwright browser runs with or without a visible window.

**Default**: `true` (headless)

Set to `false` for debugging session establishment:

```bash
MOUSE_MCP_HEADLESS=false npm start
```

### Session Refresh Buffer

Time before expiration when sessions are considered "needs refresh".

**Default**: `60` (60 minutes)

If a session expires in less than this time, it will be refreshed on next use.

**Example**:

```bash
MOUSE_MCP_REFRESH_BUFFER=120 npm start  # 2 hour buffer
```

### Embedding Provider

Selects the embedding generation backend:

| Value | Description |
|-------|-------------|
| `auto` | Use OpenAI if API key available, otherwise Transformers.js |
| `openai` | Force OpenAI (requires `OPENAI_API_KEY`) |
| `transformers` | Force local Transformers.js |

**Auto mode behavior**:

1. Check if `OPENAI_API_KEY` is set
2. If set, verify API is accessible
3. If accessible, use OpenAI
4. Otherwise, fall back to Transformers.js

**Example**:

```bash
# Force local embeddings
MOUSE_MCP_EMBEDDING_PROVIDER=transformers npm start

# Force OpenAI
OPENAI_API_KEY=sk-... MOUSE_MCP_EMBEDDING_PROVIDER=openai npm start
```

### OpenAI API Key

API key for OpenAI embedding generation.

**Required for**: `MOUSE_MCP_EMBEDDING_PROVIDER=openai`

**Optional for**: `MOUSE_MCP_EMBEDDING_PROVIDER=auto`

**Why not `MOUSE_MCP_OPENAI_API_KEY`?**

Unlike other settings, `OPENAI_API_KEY` is intentionally **not** prefixed because:

1. **Industry standard**: OpenAI's official SDK and most third-party libraries expect this exact variable name
2. **Shared configuration**: Users often have `OPENAI_API_KEY` set globally for multiple tools
3. **Interoperability**: Avoids requiring duplicate configuration for the same credential

This follows the principle that tool-specific settings use the `MOUSE_MCP_` prefix, while well-established external service credentials use their standard names.

**Example**:

```bash
OPENAI_API_KEY=sk-proj-... npm start
```

## Claude Code Configuration

To use mouse-mcp with Claude Code, add to your MCP configuration:

```json
{
  "mcpServers": {
    "disney": {
      "command": "node",
      "args": ["/path/to/mouse-mcp/dist/index.js"],
      "env": {
        "MOUSE_MCP_LOG_LEVEL": "INFO",
        "OPENAI_API_KEY": "sk-..."
      }
    }
  }
}
```

### Configuration File Locations

Claude Code MCP configuration:

- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Linux: `~/.config/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

## Development Configuration

For local development:

```bash
# .env.local (not committed)
NODE_ENV=development
MOUSE_MCP_LOG_LEVEL=DEBUG
MOUSE_MCP_HEADLESS=false
OPENAI_API_KEY=sk-...
```

Load with:

```bash
source .env.local && npm run dev
```

## Production Configuration

Recommended production settings:

```bash
NODE_ENV=production
MOUSE_MCP_LOG_LEVEL=INFO
MOUSE_MCP_HEADLESS=true
MOUSE_MCP_TIMEOUT=60000
MOUSE_MCP_REFRESH_BUFFER=120
```

## Testing Configuration

For running tests:

```bash
NODE_ENV=test
MOUSE_MCP_LOG_LEVEL=ERROR
MOUSE_MCP_DB_PATH=/tmp/test-disney.db
```

## Configuration Reset

To reset cached configuration (useful for testing):

```typescript
import { resetConfig } from "./config/index.js";

resetConfig();
```

## Troubleshooting

### Sessions Not Establishing

Try disabling headless mode to see what's happening:

```bash
MOUSE_MCP_HEADLESS=false npm run dev
```

### Slow API Responses

Increase timeout:

```bash
MOUSE_MCP_TIMEOUT=60000 npm start
```

### Embedding Errors

Check OpenAI API key or force local embeddings:

```bash
MOUSE_MCP_EMBEDDING_PROVIDER=transformers npm start
```

### Database Issues

Reset database by removing the file:

```bash
rm ~/.cache/mouse-mcp/disney.db
```

Or use a different path:

```bash
MOUSE_MCP_DB_PATH=/tmp/disney-test.db npm start
```
