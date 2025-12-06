# HTTP Transport Code Examples

Complete, working code examples for adding HTTP transport to mouse-mcp.

## Example 1: Minimal HTTP Server

The simplest possible HTTP transport implementation.

### src/http/server.ts

```typescript
import { randomUUID } from "node:crypto";
import express, { Request, Response } from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpExpressApp } from "@modelcontextprotocol/sdk/server/express.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "../shared/index.js";

const logger = createLogger("HttpServer");

interface TransportMap {
  [sessionId: string]: StreamableHTTPServerTransport;
}

export interface HttpServerOptions {
  port: number;
  host: string;
}

/**
 * HTTP server for MCP using Streamable HTTP transport.
 */
export class DisneyMcpHttpServer {
  private readonly mcpServer: McpServer;
  private readonly transports: TransportMap = {};

  constructor(mcpServer: McpServer) {
    this.mcpServer = mcpServer;
  }

  /**
   * Start the HTTP server.
   */
  async start(options: HttpServerOptions): Promise<void> {
    const { port, host } = options;

    // Create Express app with built-in security
    const app = createMcpExpressApp({ host });

    // JSON body parser
    app.use(express.json());

    // Health check endpoint
    app.get("/health", (_req: Request, res: Response) => {
      res.json({
        status: "ok",
        service: "mouse-mcp",
        transport: "http",
        activeSessions: Object.keys(this.transports).length
      });
    });

    // MCP endpoint - handles all HTTP methods (GET, POST, DELETE)
    app.all("/mcp", async (req: Request, res: Response) => {
      await this.handleMcpRequest(req, res);
    });

    // Start server
    app.listen(port, host, () => {
      logger.info("HTTP server started", { host, port });
    });

    // Graceful shutdown
    this.setupShutdownHandlers();
  }

  /**
   * Handle incoming MCP request.
   */
  private async handleMcpRequest(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    logger.debug("MCP request received", {
      method: req.method,
      sessionId: sessionId || "none",
      path: req.path
    });

    try {
      let transport: StreamableHTTPServerTransport;

      // Check for existing session
      if (sessionId && this.transports[sessionId]) {
        logger.debug("Using existing transport", { sessionId });
        transport = this.transports[sessionId];
      }
      // New initialization request
      else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
        logger.info("Creating new session");
        transport = await this.createTransport();
      }
      // Invalid request
      else {
        logger.warn("Invalid MCP request", {
          hasSessionId: !!sessionId,
          method: req.method,
          isInitialize: isInitializeRequest(req.body)
        });

        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: Missing or invalid session ID"
          },
          id: null
        });
        return;
      }

      // Handle the request with the transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("Error handling MCP request", error);

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

  /**
   * Create a new transport and connect it to the MCP server.
   */
  private async createTransport(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        logger.info("Session initialized", { sessionId });
        this.transports[sessionId] = transport;
      },
      onsessionclosed: async (sessionId: string) => {
        logger.info("Session closed", { sessionId });
        delete this.transports[sessionId];
      }
    });

    // Handle transport closure
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId && this.transports[sessionId]) {
        logger.debug("Transport closed, cleaning up", { sessionId });
        delete this.transports[sessionId];
      }
    };

    // Connect to MCP server
    await this.mcpServer.connect(transport);

    return transport;
  }

  /**
   * Set up graceful shutdown handlers.
   */
  private setupShutdownHandlers(): void {
    const shutdown = async (signal: string): Promise<void> => {
      logger.info("Shutdown signal received", { signal });
      await this.shutdown();
      process.exit(0);
    };

    process.on("SIGINT", () => {
      void shutdown("SIGINT");
    });

    process.on("SIGTERM", () => {
      void shutdown("SIGTERM");
    });
  }

  /**
   * Graceful shutdown - close all active transports.
   */
  private async shutdown(): Promise<void> {
    logger.info("Shutting down HTTP server");

    const sessionIds = Object.keys(this.transports);
    logger.debug("Closing active transports", { count: sessionIds.length });

    for (const sessionId of sessionIds) {
      try {
        await this.transports[sessionId].close();
        delete this.transports[sessionId];
      } catch (error) {
        logger.error("Error closing transport", error, { sessionId });
      }
    }

    logger.info("HTTP server shutdown complete");
  }
}
```

### Updated src/server.ts

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { DisneyMcpHttpServer, HttpServerOptions } from "./http/server.js";
// ... rest of imports

export class DisneyMcpServer {
  private readonly server: McpServer;

  constructor() {
    // Existing constructor code
  }

  /**
   * Run server with stdio transport (existing method).
   */
  async run(): Promise<void> {
    logger.info("Starting Disney Parks MCP server (stdio mode)");

    // Initialize session manager
    const sessionManager = getSessionManager();
    await sessionManager.initialize();

    // Purge expired cache entries
    await cachePurgeExpired();

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info("Disney Parks MCP server running (stdio)");
  }

  /**
   * Run server with HTTP transport (new method).
   */
  async runHttp(options: HttpServerOptions): Promise<void> {
    logger.info("Starting Disney Parks MCP server (HTTP mode)", options);

    // Initialize session manager
    const sessionManager = getSessionManager();
    await sessionManager.initialize();

    // Purge expired cache entries
    await cachePurgeExpired();

    // Start HTTP server
    const httpServer = new DisneyMcpHttpServer(this.server);
    await httpServer.start(options);

    logger.info("Disney Parks MCP server running (HTTP)");
  }

  // Existing shutdown method remains unchanged
}
```

### Updated src/index.ts

```typescript
#!/usr/bin/env node
import "dotenv/config";
import { DisneyMcpServer } from "./server.js";
import { createLogger } from "./shared/index.js";
import { getConfig } from "./config/index.js";

const logger = createLogger("Main");

async function main(): Promise<void> {
  try {
    const config = getConfig();
    const server = new DisneyMcpServer();

    if (config.transport === "http") {
      logger.info("Starting in HTTP mode");
      await server.runHttp({
        port: config.httpPort,
        host: config.httpHost
      });
    } else {
      logger.info("Starting in stdio mode");
      await server.run();
    }
  } catch (error) {
    logger.error("Fatal error starting server", error);
    process.exit(1);
  }
}

void main();
```

## Example 2: With Event Store (Resumability)

Advanced implementation with connection resumability.

### src/http/event-store.ts

```typescript
import { EventStore, StreamId, EventId } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { JSONRPCMessage } from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "../shared/index.js";

const logger = createLogger("EventStore");

interface StoredEvent {
  streamId: StreamId;
  message: JSONRPCMessage;
  timestamp: number;
}

/**
 * In-memory event store for MCP message resumability.
 *
 * For production deployments, replace with Redis, PostgreSQL, or similar
 * persistent storage to survive server restarts.
 */
export class InMemoryEventStore implements EventStore {
  private events: Map<EventId, StoredEvent> = new Map();
  private streamEvents: Map<StreamId, EventId[]> = new Map();
  private nextEventId = 0;
  private readonly maxEvents: number;
  private readonly maxAge: number; // milliseconds

  constructor(options: { maxEvents?: number; maxAge?: number } = {}) {
    this.maxEvents = options.maxEvents ?? 10000;
    this.maxAge = options.maxAge ?? 3600000; // 1 hour default
  }

  async storeEvent(streamId: StreamId, message: JSONRPCMessage): Promise<EventId> {
    const eventId = `event-${this.nextEventId++}`;

    this.events.set(eventId, {
      streamId,
      message,
      timestamp: Date.now()
    });

    if (!this.streamEvents.has(streamId)) {
      this.streamEvents.set(streamId, []);
    }
    this.streamEvents.get(streamId)!.push(eventId);

    logger.debug("Event stored", { eventId, streamId });

    // Clean up old events
    this.cleanupOldEvents();

    return eventId;
  }

  async getStreamIdForEventId(eventId: EventId): Promise<StreamId | undefined> {
    const event = this.events.get(eventId);
    return event?.streamId;
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

    logger.info("Replaying events", {
      streamId,
      lastEventId,
      eventsToReplay: eventIds.length - startIndex
    });

    for (let i = startIndex; i < eventIds.length; i++) {
      const eventId = eventIds[i];
      const storedEvent = this.events.get(eventId);

      if (storedEvent) {
        await send(eventId, storedEvent.message);
      }
    }

    return streamId;
  }

  /**
   * Clean up old events to prevent unbounded memory growth.
   */
  private cleanupOldEvents(): void {
    const now = Date.now();
    const eventsToDelete: EventId[] = [];

    // Find events older than maxAge
    for (const [eventId, event] of this.events.entries()) {
      if (now - event.timestamp > this.maxAge) {
        eventsToDelete.push(eventId);
      }
    }

    // Delete old events
    for (const eventId of eventsToDelete) {
      const event = this.events.get(eventId);
      if (event) {
        this.events.delete(eventId);

        // Remove from stream events
        const streamEventIds = this.streamEvents.get(event.streamId);
        if (streamEventIds) {
          const index = streamEventIds.indexOf(eventId);
          if (index > -1) {
            streamEventIds.splice(index, 1);
          }
        }
      }
    }

    // Enforce max events limit
    if (this.events.size > this.maxEvents) {
      const excess = this.events.size - this.maxEvents;
      const oldestEventIds = Array.from(this.events.keys()).slice(0, excess);

      for (const eventId of oldestEventIds) {
        const event = this.events.get(eventId);
        if (event) {
          this.events.delete(eventId);

          const streamEventIds = this.streamEvents.get(event.streamId);
          if (streamEventIds) {
            const index = streamEventIds.indexOf(eventId);
            if (index > -1) {
              streamEventIds.splice(index, 1);
            }
          }
        }
      }
    }

    if (eventsToDelete.length > 0) {
      logger.debug("Cleaned up old events", { count: eventsToDelete.length });
    }
  }

  /**
   * Get statistics about the event store.
   */
  getStats(): {
    totalEvents: number;
    totalStreams: number;
    oldestEventAge: number;
  } {
    const now = Date.now();
    let oldestTimestamp = now;

    for (const event of this.events.values()) {
      if (event.timestamp < oldestTimestamp) {
        oldestTimestamp = event.timestamp;
      }
    }

    return {
      totalEvents: this.events.size,
      totalStreams: this.streamEvents.size,
      oldestEventAge: now - oldestTimestamp
    };
  }
}
```

### Updated src/http/server.ts (with resumability)

```typescript
import { InMemoryEventStore } from "./event-store.js";

export class DisneyMcpHttpServer {
  private readonly eventStore?: InMemoryEventStore;

  constructor(mcpServer: McpServer, options: { enableResumability?: boolean } = {}) {
    this.mcpServer = mcpServer;

    if (options.enableResumability) {
      this.eventStore = new InMemoryEventStore({
        maxEvents: 10000,
        maxAge: 3600000 // 1 hour
      });
      logger.info("Event store enabled for resumability");
    }
  }

  private async createTransport(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      eventStore: this.eventStore, // Enable resumability if event store exists
      onsessioninitialized: (sessionId: string) => {
        logger.info("Session initialized", { sessionId });
        this.transports[sessionId] = transport;
      },
      onsessionclosed: async (sessionId: string) => {
        logger.info("Session closed", { sessionId });
        delete this.transports[sessionId];
      }
    });

    // Rest of the method remains the same
  }
}
```

## Example 3: With Authentication

Production-ready implementation with OAuth bearer token authentication.

### src/http/auth.ts

```typescript
import { OAuthTokenVerifier } from "@modelcontextprotocol/sdk/server/auth/provider.js";
import { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";
import { createLogger } from "../shared/index.js";

const logger = createLogger("Auth");

/**
 * Simple token verifier for demonstration.
 * In production, integrate with your OAuth provider (Auth0, Okta, etc.)
 */
export class SimpleTokenVerifier implements OAuthTokenVerifier {
  private readonly validTokens: Map<string, AuthInfo>;

  constructor() {
    this.validTokens = new Map();
  }

  /**
   * Add a valid token (for testing).
   */
  addToken(token: string, info: AuthInfo): void {
    this.validTokens.set(token, info);
  }

  /**
   * Verify an access token.
   */
  async verifyAccessToken(token: string): Promise<AuthInfo> {
    logger.debug("Verifying token");

    const authInfo = this.validTokens.get(token);

    if (!authInfo) {
      logger.warn("Invalid token");
      throw new Error("Invalid or expired token");
    }

    // Check expiration
    if (authInfo.expiresAt && authInfo.expiresAt < Date.now() / 1000) {
      logger.warn("Token expired");
      throw new Error("Token expired");
    }

    logger.debug("Token verified", { clientId: authInfo.clientId });
    return authInfo;
  }
}
```

### src/http/server.ts (with auth)

```typescript
import { requireBearerAuth } from "@modelcontextprotocol/sdk/server/auth/middleware/bearerAuth.js";
import { SimpleTokenVerifier } from "./auth.js";

export interface HttpServerOptions {
  port: number;
  host: string;
  enableAuth?: boolean;
  tokenVerifier?: OAuthTokenVerifier;
}

export class DisneyMcpHttpServer {
  async start(options: HttpServerOptions): Promise<void> {
    const { port, host, enableAuth, tokenVerifier } = options;

    const app = createMcpExpressApp({ host });
    app.use(express.json());

    // Health check (no auth required)
    app.get("/health", (_req: Request, res: Response) => {
      res.json({ status: "ok", service: "mouse-mcp" });
    });

    // MCP endpoint with optional auth
    if (enableAuth && tokenVerifier) {
      logger.info("Authentication enabled");

      const authMiddleware = requireBearerAuth({
        verifier: tokenVerifier,
        requiredScopes: ["mcp:tools"]
      });

      app.all("/mcp", authMiddleware, async (req: Request, res: Response) => {
        // req.auth is now populated with AuthInfo
        logger.debug("Authenticated request", {
          clientId: req.auth?.clientId,
          scopes: req.auth?.scopes
        });
        await this.handleMcpRequest(req, res);
      });
    } else {
      logger.warn("Authentication disabled (development mode)");
      app.all("/mcp", async (req: Request, res: Response) => {
        await this.handleMcpRequest(req, res);
      });
    }

    app.listen(port, host, () => {
      logger.info("HTTP server started", { host, port, auth: enableAuth });
    });

    this.setupShutdownHandlers();
  }
}
```

## Example 4: Testing with MCP Inspector

### Manual Testing

```bash
# Start server in HTTP mode
MOUSE_MCP_TRANSPORT=http MOUSE_MCP_PORT=3000 npm run dev

# In another terminal, use MCP Inspector
npx @modelcontextprotocol/inspector http://localhost:3000/mcp
```

### Automated Testing with curl

```bash
# Initialize session
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -d '{
    "jsonrpc": "2.0",
    "id": 1,
    "method": "initialize",
    "params": {
      "protocolVersion": "2025-11-25",
      "capabilities": {},
      "clientInfo": { "name": "test-client", "version": "1.0.0" }
    }
  }' -v

# Extract session ID from response header: Mcp-Session-Id

# Call a tool
curl -X POST http://localhost:3000/mcp \
  -H "Content-Type: application/json" \
  -H "Accept: application/json" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "Mcp-Session-Id: YOUR-SESSION-ID" \
  -d '{
    "jsonrpc": "2.0",
    "id": 2,
    "method": "tools/call",
    "params": {
      "name": "get_destinations",
      "arguments": {}
    }
  }'

# Establish SSE stream
curl -X GET http://localhost:3000/mcp \
  -H "Accept: text/event-stream" \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "Mcp-Session-Id: YOUR-SESSION-ID" \
  -N

# Terminate session
curl -X DELETE http://localhost:3000/mcp \
  -H "MCP-Protocol-Version: 2025-11-25" \
  -H "Mcp-Session-Id: YOUR-SESSION-ID"
```

## Example 5: Docker Deployment

### Dockerfile

```dockerfile
FROM node:20-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy built application
COPY dist/ ./dist/
COPY .env.example ./.env

# Set environment
ENV NODE_ENV=production
ENV MOUSE_MCP_TRANSPORT=http
ENV MOUSE_MCP_PORT=3000
ENV MOUSE_MCP_HOST=0.0.0.0

EXPOSE 3000

CMD ["node", "dist/index.js"]
```

### docker-compose.yml

```yaml
version: '3.8'

services:
  mouse-mcp:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - MOUSE_MCP_TRANSPORT=http
      - MOUSE_MCP_PORT=3000
      - MOUSE_MCP_HOST=0.0.0.0
      - MOUSE_MCP_LOG_LEVEL=INFO
      - MOUSE_MCP_HTTP_RESUMABILITY=true
    volumes:
      - ./data:/app/.data
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "--quiet", "--tries=1", "--spider", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
```

## Running the Examples

### Local Development

```bash
# stdio mode (default)
npm run dev

# HTTP mode
MOUSE_MCP_TRANSPORT=http npm run dev

# HTTP with resumability
MOUSE_MCP_TRANSPORT=http MOUSE_MCP_HTTP_RESUMABILITY=true npm run dev

# HTTP with custom port
MOUSE_MCP_TRANSPORT=http MOUSE_MCP_PORT=8080 npm run dev
```

### Production Build

```bash
# Build
npm run build

# Run with HTTP transport
NODE_ENV=production \
MOUSE_MCP_TRANSPORT=http \
MOUSE_MCP_PORT=3000 \
MOUSE_MCP_HOST=0.0.0.0 \
node dist/index.js
```

### Docker

```bash
# Build image
docker build -t mouse-mcp .

# Run container
docker run -p 3000:3000 \
  -e MOUSE_MCP_TRANSPORT=http \
  -v $(pwd)/data:/app/.data \
  mouse-mcp

# Or use docker-compose
docker-compose up -d
```

## Next Steps

1. Choose which example best fits your needs
2. Start with Example 1 (minimal) for initial implementation
3. Add Example 2 (event store) when deploying to production
4. Add Example 3 (auth) when exposing publicly
5. Use Example 4 for testing
6. Use Example 5 for containerized deployment
