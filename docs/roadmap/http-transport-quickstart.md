# HTTP Transport Quick Start Guide

Quick reference for adding HTTP transport to mouse-mcp server.

## TL;DR

```typescript
// Current: stdio only
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
const transport = new StdioServerTransport();
await server.connect(transport);

// Add: HTTP support
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { randomUUID } from "node:crypto";

const app = createMcpExpressApp({ host: "127.0.0.1" });
const transports = {};

app.all("/mcp", async (req, res) => {
  const sessionId = req.headers["mcp-session-id"];
  let transport = transports[sessionId];

  if (!transport && isInitializeRequest(req.body)) {
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid) => { transports[sid] = transport; }
    });
    await server.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

app.listen(3000);
```

## Minimal Changes Required

### 1. Add Dependencies

```bash
npm install --save-dev @types/express
```

Already have: `express` is bundled with `@modelcontextprotocol/sdk`

### 2. Environment Variables

Add to `.env`:

```bash
MOUSE_MCP_TRANSPORT=stdio  # or "http"
MOUSE_MCP_PORT=3000
MOUSE_MCP_HOST=127.0.0.1
```

### 3. Update Server Class

```typescript
export class DisneyMcpServer {
  // Add HTTP method
  async runHttp(options: { port: number; host: string }): Promise<void> {
    const app = createMcpExpressApp({ host: options.host });
    const transports: Record<string, StreamableHTTPServerTransport> = {};

    app.all("/mcp", async (req, res) => {
      // Handle request (see full implementation in research doc)
    });

    app.listen(options.port, options.host);
  }

  // Keep existing runStdio() method
  async run(): Promise<void> {
    const transport = new StdioServerTransport();
    await this.server.connect(transport);
  }
}
```

### 4. Update Entry Point

```typescript
async function main(): Promise<void> {
  const server = new DisneyMcpServer();

  if (process.env.MOUSE_MCP_TRANSPORT === "http") {
    await server.runHttp({
      port: parseInt(process.env.MOUSE_MCP_PORT || "3000", 10),
      host: process.env.MOUSE_MCP_HOST || "127.0.0.1"
    });
  } else {
    await server.run(); // stdio mode
  }
}
```

## Testing

### stdio mode (current)
```bash
npm run dev
# or
MOUSE_MCP_TRANSPORT=stdio npm run dev
```

### HTTP mode
```bash
MOUSE_MCP_TRANSPORT=http MOUSE_MCP_PORT=3000 npm run dev
```

### Test with MCP Inspector
```bash
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

## Key Files to Modify

1. `/Users/cameron/Projects/mouse-mcp/src/server.ts` - Add `runHttp()` method
2. `/Users/cameron/Projects/mouse-mcp/src/index.ts` - Update entry point
3. `/Users/cameron/Projects/mouse-mcp/src/config/index.ts` - Add transport config
4. `/Users/cameron/Projects/mouse-mcp/.env.example` - Add transport variables

## Security Checklist

- [x] Use `createMcpExpressApp()` for DNS rebinding protection
- [x] Bind to `127.0.0.1` for local development
- [ ] Add bearer auth for production (optional, future)
- [ ] Use HTTPS in production (reverse proxy)
- [ ] Add rate limiting for production

## Full Implementation

See `/Users/cameron/Projects/mouse-mcp/docs/roadmap/research-http-transport.md` for:
- Complete code examples
- Event store implementation (resumability)
- Authentication patterns
- Production deployment guide
- MCP spec details

## Resources

- **SDK Example**: `node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/simpleStreamableHttp.js`
- **MCP Inspector**: `npx @modelcontextprotocol/inspector`
- **Protocol Docs**: https://modelcontextprotocol.io/docs/concepts/transports
