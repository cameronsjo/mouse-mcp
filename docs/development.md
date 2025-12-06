# Development Guide

This document covers development setup, workflows, and best practices for contributing to mouse-mcp.

## Prerequisites

- **Node.js**: >= 20.0.0
- **npm**: Included with Node.js
- **Git**: For version control

## Getting Started

### Clone and Install

```bash
git clone https://github.com/your-org/mouse-mcp.git
cd mouse-mcp
npm install
```

### Build

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` directory.

### Development Mode

```bash
npm run dev
```

Uses `tsx watch` for hot-reload during development.

### Type Checking

```bash
npm run check
```

Runs TypeScript compiler without emitting (type checking only).

## Project Structure

```
mouse-mcp/
├── src/
│   ├── index.ts              # CLI entry point
│   ├── server.ts             # MCP server
│   ├── config/               # Configuration
│   ├── types/                # TypeScript types
│   ├── clients/              # API clients
│   ├── tools/                # MCP tools
│   ├── db/                   # Database layer
│   ├── embeddings/           # Semantic search
│   └── shared/               # Utilities
├── docs/                     # Documentation
├── dist/                     # Compiled output
├── package.json
├── tsconfig.json
└── README.md
```

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Development with hot-reload |
| `npm run build` | Compile TypeScript |
| `npm start` | Run compiled server |
| `npm run check` | Type check without build |
| `npm run lint` | Run ESLint |
| `npm run lint:fix` | Fix ESLint issues |
| `npm run format` | Format with Prettier |
| `npm test` | Run tests (vitest) |
| `npm run test:run` | Run tests once |
| `npm run inspector` | Test with MCP inspector |

## Testing with MCP Inspector

The MCP inspector provides an interactive UI for testing tools:

```bash
npm run inspector
```

This opens a browser interface where you can:

- List available tools
- Call tools with parameters
- View responses in real-time

## Code Style

### TypeScript

- **Strict mode**: Enabled in tsconfig.json
- **ES Modules**: Using ESM (`"type": "module"`)
- **Target**: ES2022

### Linting

ESLint with TypeScript support:

```bash
npm run lint        # Check issues
npm run lint:fix    # Auto-fix issues
```

### Formatting

Prettier for consistent formatting:

```bash
npm run format
```

## Architecture Guidelines

### Adding a New Tool

1. Create tool file in `src/tools/`:

```typescript
// src/tools/my-tool.ts
import type { ToolDefinition, ToolHandler } from "./types.js";

export const definition: ToolDefinition = {
  name: "disney_my_tool",
  description: "Description of what the tool does",
  inputSchema: {
    type: "object" as const,
    properties: {
      param1: {
        type: "string",
        description: "Parameter description",
      },
    },
    required: ["param1"],
  },
};

export const handler: ToolHandler = async (args) => {
  const param1 = args["param1"] as string;

  // Implementation

  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify({ result: "..." }, null, 2),
      },
    ],
  };
};
```

2. Register in `src/tools/index.ts`:

```typescript
import * as myTool from "./my-tool.js";

const tools: ToolEntry[] = [
  // ... existing tools
  { definition: myTool.definition, handler: myTool.handler },
];
```

### Adding a Data Type

1. Define in `src/types/disney.ts`:

```typescript
export interface DisneyNewEntity extends DisneyEntity {
  readonly entityType: "NEW_TYPE";
  readonly specificField: string;
  // ...
}
```

2. Export in `src/types/index.ts`:

```typescript
export type { DisneyNewEntity } from "./disney.js";
```

### Adding Database Operations

1. Create or modify files in `src/db/`:

```typescript
// src/db/new-operations.ts
export async function getNewEntities(): Promise<NewEntity[]> {
  const db = await getDatabase();
  // Implementation
}
```

2. Export in `src/db/index.ts`:

```typescript
export { getNewEntities } from "./new-operations.js";
```

## Error Handling

Use custom error classes from `src/shared/errors.ts`:

```typescript
import { ValidationError, ApiError } from "../shared/errors.js";

// Input validation
if (!param) {
  throw new ValidationError("Parameter required", "param", null);
}

// API errors
if (!response.ok) {
  throw new ApiError(`API error: ${response.status}`, response.status, endpoint);
}
```

Format errors for MCP responses:

```typescript
import { formatErrorResponse } from "../shared/errors.js";

try {
  // ...
} catch (error) {
  return formatErrorResponse(error);
}
```

## Logging

Use structured logging from `src/shared/logger.ts`:

```typescript
import { createLogger } from "../shared/logger.js";

const logger = createLogger("MyModule");

logger.debug("Debug message", { context: "value" });
logger.info("Info message");
logger.warn("Warning", { issue: "description" });
logger.error("Error occurred", error);
```

Logs go to stderr to preserve stdout for MCP communication.

## Testing

### Running Tests

```bash
npm test           # Watch mode
npm run test:run   # Single run
```

### Writing Tests

```typescript
// src/__tests__/my-feature.test.ts
import { describe, it, expect } from "vitest";

describe("MyFeature", () => {
  it("should do something", () => {
    expect(true).toBe(true);
  });
});
```

### Test Configuration

Tests use Vitest with configuration in `vitest.config.ts` or `package.json`:

```json
{
  "test": "vitest"
}
```

## Debugging

### VSCode Configuration

Create `.vscode/launch.json`:

```json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Server",
      "type": "node",
      "request": "launch",
      "runtimeExecutable": "npx",
      "runtimeArgs": ["tsx", "src/index.ts"],
      "skipFiles": ["<node_internals>/**"],
      "env": {
        "MOUSE_MCP_LOG_LEVEL": "DEBUG",
        "MOUSE_MCP_HEADLESS": "false"
      }
    }
  ]
}
```

### Debug Session Establishment

Run with visible browser:

```bash
MOUSE_MCP_HEADLESS=false npm run dev
```

### Debug Database

Use SQLite viewer to inspect `~/.cache/mouse-mcp/disney.db`:

```bash
sqlite3 ~/.cache/mouse-mcp/disney.db ".tables"
sqlite3 ~/.cache/mouse-mcp/disney.db "SELECT * FROM cache"
```

## Common Tasks

### Reset Database

```bash
rm ~/.cache/mouse-mcp/disney.db
```

### Clear Cache

```typescript
import { cachePurgeExpired } from "./db/index.js";

await cachePurgeExpired();
```

### Force Session Refresh

Delete session from database:

```bash
sqlite3 ~/.cache/mouse-mcp/disney.db "DELETE FROM sessions WHERE destination='wdw'"
```

### Regenerate Embeddings

Delete embeddings and run sync:

```bash
sqlite3 ~/.cache/mouse-mcp/disney.db "DELETE FROM embeddings"
```

Then use `disney_sync` tool.

## Release Process

1. **Update version** in `package.json`
2. **Run checks**:

   ```bash
   npm run lint
   npm run check
   npm run test:run
   ```

3. **Build**:

   ```bash
   npm run build
   ```

4. **Test manually** with MCP inspector:

   ```bash
   npm run inspector
   ```

5. **Commit and tag**:

   ```bash
   git add .
   git commit -m "chore: release vX.Y.Z"
   git tag vX.Y.Z
   git push && git push --tags
   ```

## Dependencies

### Production Dependencies

| Package | Purpose |
|---------|---------|
| `@modelcontextprotocol/sdk` | MCP server framework |
| `@xenova/transformers` | Local embeddings |
| `fuse.js` | Fuzzy search |
| `playwright` | Browser automation |
| `sql.js` | SQLite WebAssembly |

### Dev Dependencies

| Package | Purpose |
|---------|---------|
| `typescript` | Type system |
| `@typescript-eslint/*` | TypeScript linting |
| `eslint` | Code linting |
| `prettier` | Code formatting |
| `tsx` | TypeScript execution |
| `vitest` | Testing framework |

## Troubleshooting

### "Cannot find module" Errors

Ensure you've built after changes:

```bash
npm run build
```

Or use dev mode:

```bash
npm run dev
```

### Type Errors

Run type check to see all issues:

```bash
npm run check
```

### Playwright Issues

Install Playwright browsers:

```bash
npx playwright install chromium
```

### sql.js WebAssembly Issues

The package auto-downloads WASM files. If issues occur, try:

```bash
rm -rf node_modules
npm install
```
