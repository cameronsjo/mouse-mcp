# Research: Adding Streamable HTTP Transport to MCP Server

## Executive Summary

The MCP SDK (`@modelcontextprotocol/sdk` v1.12.0) provides **StreamableHTTPServerTransport** as the recommended HTTP transport for cloud deployment. This transport supports:

- Single endpoint handling GET/POST/DELETE requests
- Server-Sent Events (SSE) for streaming responses
- Session management (stateful) or stateless operation
- Event resumability for reconnection scenarios
- Protocol version 2025-11-25 (latest spec)

The deprecated **SSEServerTransport** (protocol 2024-11-05) SHOULD NOT be used for new implementations.

## 1. Available Transport Options

### StdioServerTransport (Current)

**File:** `@modelcontextprotocol/sdk/server/stdio.js`

**Use Case:** Local MCP servers launched as subprocesses by Claude Desktop

**Characteristics:**
- Reads JSON-RPC messages from stdin, writes to stdout
- Simplest transport mechanism
- Cannot handle multiple client connections
- No session management required

**Current Implementation:**
```typescript
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

const transport = new StdioServerTransport();
await server.connect(transport);
```

### StreamableHTTPServerTransport (Recommended for HTTP)

**File:** `@modelcontextprotocol/sdk/server/streamableHttp.js`

**Use Case:** Cloud-deployed MCP servers accessible via HTTP

**Characteristics:**
- Single endpoint for GET/POST/DELETE methods
- SSE streaming for multi-message responses
- Session management with UUIDs
- Event store for resumability (optional)
- Supports both stateful and stateless modes
- Protocol version: 2025-11-25 (latest)

**Implementation:**
```typescript
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { randomUUID } from "node:crypto";

const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(), // or undefined for stateless
  eventStore: eventStore, // optional, enables resumability
  onsessioninitialized: (sessionId) => {
    // Store session for routing
  },
  onsessionclosed: (sessionId) => {
    // Clean up session
  }
});

await transport.handleRequest(req, res, parsedBody);
```

### SSEServerTransport (Deprecated)

**File:** `@modelcontextprotocol/sdk/server/sse.js`

**Status:** **DEPRECATED** - Use StreamableHTTPServerTransport instead

**Protocol Version:** 2024-11-05 (old spec)

**Why Deprecated:**
- Requires separate GET and POST endpoints
- Less efficient than Streamable HTTP
- Older protocol version

## 2. Supporting Both stdio and HTTP Transport

### Architecture Pattern

The recommended pattern uses **environment-based transport selection** with a single `McpServer` instance connected to different transports:

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

// Transport mode selection
const transportMode = process.env.MOUSE_MCP_TRANSPORT || "stdio";

// Create MCP server instance
const mcpServer = new McpServer(
  { name: "mouse-mcp", version: "1.0.0" },
  { capabilities: { tools: {} } }
);

// Register tools, resources, prompts
mcpServer.registerTool("example", { /* ... */ }, async () => { /* ... */ });

if (transportMode === "stdio") {
  // stdio mode for local Claude Desktop
  const transport = new StdioServerTransport();
  await mcpServer.connect(transport);
} else if (transportMode === "http") {
  // HTTP mode for cloud deployment
  startHttpServer(mcpServer);
}
```

### Dual-Mode Server Pattern

For production deployments supporting both modes:

```typescript
// Entry point decides based on environment
async function main() {
  const server = new DisneyMcpServer();

  if (process.env.MOUSE_MCP_TRANSPORT === "http") {
    await server.runHttp({
      port: parseInt(process.env.MOUSE_MCP_PORT || "3000", 10),
      host: process.env.MOUSE_MCP_HOST || "127.0.0.1"
    });
  } else {
    await server.runStdio();
  }
}
```

## 3. Code Patterns for HTTP Transport

### Complete HTTP Server Implementation

```typescript
import { randomUUID } from "node:crypto";
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";

interface TransportMap {
  [sessionId: string]: StreamableHTTPServerTransport;
}

export class DisneyMcpHttpServer {
  private readonly mcpServer: McpServer;
  private readonly transports: TransportMap = {};

  constructor(mcpServer: McpServer) {
    this.mcpServer = mcpServer;
  }

  async start(port: number, host: string = "127.0.0.1"): Promise<void> {
    const app = createMcpExpressApp({ host });

    // Configure Express middleware
    app.use(express.json());

    // Single MCP endpoint handling all methods
    app.all("/mcp", async (req: Request, res: Response) => {
      await this.handleMcpRequest(req, res);
    });

    // Health check endpoint
    app.get("/health", (_req: Request, res: Response) => {
      res.json({ status: "ok", service: "mouse-mcp" });
    });

    // Start server
    app.listen(port, host, () => {
      console.log(`MCP HTTP server listening on ${host}:${port}`);
    });

    // Graceful shutdown
    process.on("SIGINT", async () => {
      await this.shutdown();
      process.exit(0);
    });

    process.on("SIGTERM", async () => {
      await this.shutdown();
      process.exit(0);
    });
  }

  private async handleMcpRequest(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      // Check for existing session
      if (sessionId && this.transports[sessionId]) {
        transport = this.transports[sessionId];
      }
      // New initialization request
      else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
        transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (sid: string) => {
            console.log(`Session initialized: ${sid}`);
            this.transports[sid] = transport;
          },
          onsessionclosed: async (sid: string) => {
            console.log(`Session closed: ${sid}`);
            delete this.transports[sid];
          }
        });

        // Set up onclose handler
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid && this.transports[sid]) {
            delete this.transports[sid];
          }
        };

        // Connect transport to MCP server
        await this.mcpServer.connect(transport);
      }
      // Invalid request
      else {
        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided"
          },
          id: null
        });
        return;
      }

      // Handle the request
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      console.error("Error handling MCP request:", error);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error"
          },
          id: null
        });
      }
    }
  }

  private async shutdown(): Promise<void> {
    console.log("Shutting down HTTP server...");

    // Close all active transports
    for (const sessionId in this.transports) {
      try {
        await this.transports[sessionId].close();
        delete this.transports[sessionId];
      } catch (error) {
        console.error(`Error closing transport ${sessionId}:`, error);
      }
    }

    console.log("Shutdown complete");
  }
}
```

### Event Store for Resumability (Optional)

For production deployments with connection resumability:

```typescript
import { EventStore, StreamId, EventId } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";

/**
 * In-memory event store for resumability.
 * For production, use Redis, PostgreSQL, or similar persistent storage.
 */
class InMemoryEventStore implements EventStore {
  private events: Map<EventId, { streamId: StreamId; message: JSONRPCMessage }> = new Map();
  private streamEvents: Map<StreamId, EventId[]> = new Map();
  private nextEventId = 0;

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = `event-${this.nextEventId++}`;

    this.events.set(eventId, { streamId, message });

    if (!this.streamEvents.has(streamId)) {
      this.streamEvents.set(streamId, []);
    }
    this.streamEvents.get(streamId)!.push(eventId);

    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    return this.events.get(eventId)?.streamId;
  }

  async replayEventsAfter(
    lastEventId: EventId,
    { send }: { send: (eventId: EventId, message: JSONRPCMessage) => Promise<void> }
  ): Promise<StreamId> {
    const event = this.events.get(lastEventId);
    if (!event) {
      throw new Error(`Event ${lastEventId} not found`);
    }

    const streamId = event.streamId;
    const eventIds = this.streamEvents.get(streamId) || [];
    const startIndex = eventIds.indexOf(lastEventId) + 1;

    for (let i = startIndex; i < eventIds.length; i++) {
      const eventId = eventIds[i];
      const storedEvent = this.events.get(eventId);
      if (storedEvent) {
        await send(eventId, storedEvent.message);
      }
    }

    return streamId;
  }
}

// Usage
const eventStore = new InMemoryEventStore();
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(),
  eventStore, // Enables resumability
});
```

## 4. Port Configuration and Environment Variables

### Recommended Environment Variables

Add to `/Users/cameron/Projects/mouse-mcp/.env.example`:

```bash
# =============================================================================
# Transport Configuration
# =============================================================================

# Transport mode: stdio (default) or http
# - stdio: For local Claude Desktop integration
# - http: For cloud deployment and remote access
MOUSE_MCP_TRANSPORT=stdio

# HTTP server port (only used when MOUSE_MCP_TRANSPORT=http)
MOUSE_MCP_PORT=3000

# HTTP server host (only used when MOUSE_MCP_TRANSPORT=http)
# Use 127.0.0.1 for localhost-only (recommended for development)
# Use 0.0.0.0 to bind to all interfaces (production with proper auth)
MOUSE_MCP_HOST=127.0.0.1

# Enable resumability for HTTP transport (requires event store)
# Set to "true" to enable connection resumption after disconnects
MOUSE_MCP_HTTP_RESUMABILITY=false
```

### Config Type Updates

Update `/Users/cameron/Projects/mouse-mcp/src/config/index.ts`:

```typescript
export type TransportMode = "stdio" | "http";

export interface Config {
  readonly nodeEnv: "development" | "production" | "test";
  readonly logLevel: LogLevel;
  readonly dbPath: string;
  readonly refreshBufferMinutes: number;
  readonly timeoutMs: number;
  readonly showBrowser: boolean;
  readonly embeddingProvider: EmbeddingProviderType;
  readonly openaiApiKey: string | undefined;

  // Transport configuration
  readonly transport: TransportMode;
  readonly httpPort: number;
  readonly httpHost: string;
  readonly httpResumability: boolean;
}

export function getConfig(): Config {
  if (cachedConfig) {
    return cachedConfig;
  }

  const nodeEnv = (process.env.NODE_ENV ?? "development") as Config["nodeEnv"];
  const projectRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
  const defaultDbPath = join(projectRoot, ".data", "disney.db");

  cachedConfig = {
    nodeEnv,
    logLevel: parseLogLevel(process.env.MOUSE_MCP_LOG_LEVEL, nodeEnv),
    dbPath: process.env.MOUSE_MCP_DB_PATH ?? defaultDbPath,
    refreshBufferMinutes: parseInt(process.env.MOUSE_MCP_REFRESH_BUFFER ?? "60", 10),
    timeoutMs: parseInt(process.env.MOUSE_MCP_TIMEOUT ?? "30000", 10),
    showBrowser: process.env.MOUSE_MCP_SHOW_BROWSER === "true",
    embeddingProvider: parseEmbeddingProvider(process.env.MOUSE_MCP_EMBEDDING_PROVIDER),
    openaiApiKey: process.env.OPENAI_API_KEY,

    // Transport configuration
    transport: parseTransportMode(process.env.MOUSE_MCP_TRANSPORT),
    httpPort: parseInt(process.env.MOUSE_MCP_PORT ?? "3000", 10),
    httpHost: process.env.MOUSE_MCP_HOST ?? "127.0.0.1",
    httpResumability: process.env.MOUSE_MCP_HTTP_RESUMABILITY === "true",
  };

  return cachedConfig;
}

function parseTransportMode(value: string | undefined): TransportMode {
  if (value === "http") {
    return "http";
  }
  return "stdio"; // Default to stdio for backwards compatibility
}
```

## 5. Authentication Middleware Considerations

### DNS Rebinding Protection (Required for Localhost)

The SDK provides built-in protection via `createMcpExpressApp`:

```typescript
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";

// Automatic localhost protection
const app = createMcpExpressApp({
  host: "127.0.0.1" // Enables DNS rebinding protection automatically
});

// Custom allowed hosts
const app = createMcpExpressApp({
  host: "0.0.0.0",
  allowedHosts: ["myapp.local", "localhost", "127.0.0.1"]
});
```

Or use the middleware directly:

```typescript
import { hostHeaderValidation, localhostHostValidation } from "@modelcontextprotocol/sdk/server/middleware/hostHeaderValidation.js";

// For localhost only
app.use(localhostHostValidation());

// For custom hosts
app.use(hostHeaderValidation(["localhost", "127.0.0.1", "[::1]", "myapp.local"]));
```

### Bearer Token Authentication (OAuth 2.0)

For cloud deployments requiring authentication:

```typescript
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";

const tokenVerifier: OAuthTokenVerifier = {
  verifyAccessToken: async (token: string) => {
    // Verify token with your auth provider
    // Return AuthInfo if valid, throw error if invalid
    const response = await fetch("https://auth.example.com/introspect", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ token })
    });

    if (!response.ok) {
      throw new Error("Invalid token");
    }

    const data = await response.json();

    return {
      token,
      clientId: data.client_id,
      scopes: data.scope ? data.scope.split(" ") : [],
      expiresAt: data.exp
    };
  }
};

const authMiddleware = requireBearerAuth({
  verifier: tokenVerifier,
  requiredScopes: ["mcp:tools"], // Optional
  resourceMetadataUrl: "http://localhost:3000/.well-known/oauth-protected-resource"
});

app.all("/mcp", authMiddleware, mcpHandler);
```

### Environment-Based Security

Following CLAUDE.md principles:

```typescript
const config = getConfig();

// Security based on environment
if (config.nodeEnv === "production") {
  // Production MUST have authentication
  if (!process.env.MOUSE_MCP_AUTH_ENABLED) {
    throw new Error("Authentication MUST be enabled in production");
  }

  // Production MUST use HTTPS (if not localhost)
  if (config.httpHost !== "127.0.0.1" && config.httpHost !== "localhost") {
    console.warn("WARN: Production deployment SHOULD use HTTPS");
  }
}

// Development MAY disable auth for local testing
if (config.nodeEnv === "development" && config.httpHost === "127.0.0.1") {
  console.log("INFO: Running in development mode without authentication (localhost only)");
  // No auth middleware needed for local development
} else {
  // Apply authentication for non-localhost deployments
  app.use("/mcp", authMiddleware);
}
```

## 6. MCP Spec 2025-11-25 Streamable HTTP Details

### Protocol Version Handling

The SDK automatically handles protocol version negotiation:

```typescript
// Client sends in request header
MCP-Protocol-Version: 2025-11-25

// Server validates and responds
const transport = new StreamableHTTPServerTransport({
  // SDK handles protocol version automatically
});
```

### Session Management

**Stateful Mode** (Recommended):
```typescript
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: () => randomUUID(), // Server generates session ID
});

// Server includes session ID in response header
// HTTP/1.1 200 OK
// Mcp-Session-Id: a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d
```

**Stateless Mode**:
```typescript
const transport = new StreamableHTTPServerTransport({
  sessionIdGenerator: undefined, // No session management
});

// No session ID in responses
// Each request is independent
```

### HTTP Methods

**POST** - Send JSON-RPC messages to server:
```http
POST /mcp HTTP/1.1
Content-Type: application/json
Accept: application/json, text/event-stream
MCP-Protocol-Version: 2025-11-25
Mcp-Session-Id: <session-id>

{
  "jsonrpc": "2.0",
  "id": 1,
  "method": "tools/call",
  "params": { "name": "greet", "arguments": { "name": "Alice" } }
}
```

**GET** - Establish SSE stream for server-initiated messages:
```http
GET /mcp HTTP/1.1
Accept: text/event-stream
MCP-Protocol-Version: 2025-11-25
Mcp-Session-Id: <session-id>
Last-Event-ID: event-123
```

**DELETE** - Terminate session:
```http
DELETE /mcp HTTP/1.1
MCP-Protocol-Version: 2025-11-25
Mcp-Session-Id: <session-id>
```

### Response Formats

**JSON Response** (for simple request/response):
```http
HTTP/1.1 200 OK
Content-Type: application/json
Mcp-Session-Id: <session-id>

{
  "jsonrpc": "2.0",
  "id": 1,
  "result": { "content": [{ "type": "text", "text": "Hello, Alice!" }] }
}
```

**SSE Stream** (for multiple messages):
```http
HTTP/1.1 200 OK
Content-Type: text/event-stream
Mcp-Session-Id: <session-id>

data: {"jsonrpc":"2.0","method":"notifications/message","params":{"level":"info","logger":"server","data":"Processing..."}}
id: event-1

data: {"jsonrpc":"2.0","id":1,"result":{"content":[{"type":"text","text":"Result"}]}}
id: event-2
```

### Resumability (Protocol 2025-11-25 Feature)

New in 2025-11-25: Priming events for stream resumption:

```http
HTTP/1.1 200 OK
Content-Type: text/event-stream

: priming event
retry: 5000
id: event-0

data: {"jsonrpc":"2.0","method":"notifications/message","params":{...}}
id: event-1
```

Client reconnects with `Last-Event-ID`:
```http
GET /mcp HTTP/1.1
Last-Event-ID: event-1
```

Server replays events after `event-1` using the event store.

## 7. Implementation Checklist

### Phase 1: Basic HTTP Support

- [ ] Install Express types: `npm install --save-dev @types/express`
- [ ] Add transport configuration to `Config` interface
- [ ] Update `.env.example` with transport variables
- [ ] Create `DisneyMcpHttpServer` class
- [ ] Implement basic HTTP endpoint handler
- [ ] Add health check endpoint
- [ ] Update `DisneyMcpServer` to support both transports
- [ ] Update entry point (`src/index.ts`) for transport selection
- [ ] Test with MCP Inspector: `npx @modelcontextprotocol/inspector http://localhost:3000/mcp`

### Phase 2: Production Features

- [ ] Implement event store (in-memory initially)
- [ ] Add session cleanup on timeout
- [ ] Add graceful shutdown for HTTP server
- [ ] Implement DNS rebinding protection
- [ ] Add structured logging for HTTP requests
- [ ] Add metrics/monitoring hooks
- [ ] Document HTTP deployment in README

### Phase 3: Security Hardening

- [ ] Research OAuth provider integration
- [ ] Implement bearer token authentication (optional)
- [ ] Add rate limiting middleware
- [ ] Add CORS configuration
- [ ] Document security best practices
- [ ] Add production deployment guide

## 8. References

### MCP SDK Documentation
- **SDK README**: `/Users/cameron/Projects/mouse-mcp/node_modules/@modelcontextprotocol/sdk/README.md`
- **Example Server**: `/Users/cameron/Projects/mouse-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/simpleStreamableHttp.js`
- **Backwards Compatibility**: `/Users/cameron/Projects/mouse-mcp/node_modules/@modelcontextprotocol/sdk/dist/esm/examples/server/sseAndStreamableHttpCompatibleServer.js`

### Type Definitions
- **StreamableHTTPServerTransport**: `@modelcontextprotocol/sdk/dist/esm/server/streamableHttp.d.ts`
- **StdioServerTransport**: `@modelcontextprotocol/sdk/dist/esm/server/stdio.d.ts`
- **Express Integration**: `@modelcontextprotocol/sdk/dist/esm/server/express.d.ts`
- **Auth Middleware**: `@modelcontextprotocol/sdk/dist/esm/server/auth/middleware/bearerAuth.d.ts`
- **Host Validation**: `@modelcontextprotocol/sdk/dist/esm/server/middleware/hostHeaderValidation.d.ts`

### MCP Specification
- **Protocol**: Model Context Protocol 2025-11-25
- **Transport Documentation**: https://modelcontextprotocol.io/docs/concepts/transports
- **Security Best Practices**: https://modelcontextprotocol.io/docs/concepts/security

## 9. Key Takeaways

1. **Use StreamableHTTPServerTransport** - SSEServerTransport is deprecated
2. **Single Endpoint Pattern** - One `/mcp` endpoint handles GET/POST/DELETE
3. **Session Management** - Store transports by session ID for stateful connections
4. **Environment-Based Selection** - Use `MOUSE_MCP_TRANSPORT` env var to switch modes
5. **Security First** - Always enable DNS rebinding protection for localhost deployments
6. **Optional Resumability** - Event store enables connection resumption (production feature)
7. **Express Integration** - Use `createMcpExpressApp()` for automatic security defaults
8. **Graceful Shutdown** - Close all active transports on SIGTERM/SIGINT
9. **Protocol Version** - SDK handles 2025-11-25 protocol automatically
10. **Testing Tool** - Use `@modelcontextprotocol/inspector` for HTTP server testing

## Next Steps

1. Review this research document
2. Decide on implementation phases
3. Create GitHub issues for each phase
4. Begin Phase 1 implementation
5. Test with MCP Inspector
6. Document deployment procedures
