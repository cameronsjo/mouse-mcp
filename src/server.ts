/**
 * Disney MCP Server
 *
 * MCP server that provides Disney parks data through tools.
 * Supports both stdio (default) and HTTP transports.
 */

// Using low-level Server API for fine-grained control over request handling
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import { getConfig } from "./config/index.js";
import { HttpTransportServer } from "./transport/index.js";
import {
  createLogger,
  setMcpServer,
  withSpan,
  SpanAttributes,
  SpanOperations,
  Sentry,
  withAuditLogging,
  incrementQueryCount,
  SENTRY_FLUSH_TIMEOUT_MS,
} from "./shared/index.js";
import { formatErrorResponse } from "./shared/errors.js";
import { getToolDefinitions, getTool } from "./tools/index.js";
import { getPromptDefinitions, executePrompt } from "./prompts/index.js";
import { getSessionManager } from "./clients/index.js";
import { closeDatabase, cachePurgeExpired } from "./db/index.js";
import { registerEmbeddingHandlers, removeAllEventListeners } from "./events/index.js";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const packageJson = require("../package.json") as { version: string };

const logger = createLogger("Server");

const SERVER_NAME = "disney-parks";
const SERVER_VERSION = packageJson.version;

/**
 * Create a new MCP Server with all handlers registered.
 *
 * WHY: A Server can be connected to only one transport at a time (connect()
 * throws "Already connected to a transport" on the second call). HTTP mode
 * opens one transport per session, so each session needs its own Server.
 * Shared state (cache, DB, API clients) lives in module singletons and stays
 * shared; only this lightweight protocol object is per-session.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated -- Using low-level Server for fine-grained control
export function createMcpServer(): Server {
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  const server = new Server(
    {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    },
    {
      capabilities: {
        tools: {},
        prompts: {},
      },
    }
  );

  registerHandlers(server);
  server.onerror = (error) => {
    logger.error("Server error", error);
  };
  return server;
}

/**
 * Register MCP request handlers on a server instance.
 */
// eslint-disable-next-line @typescript-eslint/no-deprecated
function registerHandlers(server: Server): void {
  // List tools handler
  server.setRequestHandler(ListToolsRequestSchema, async () => {
    logger.debug("ListTools request");
    return {
      tools: getToolDefinitions(),
    };
  });

  // Call tool handler with tracing and audit logging
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;

    return withSpan(
      `mcp.tool.${name}`,
      SpanOperations.MCP_TOOL_CALL,
      async (span) => {
        span?.setAttribute(SpanAttributes.MCP_TOOL, name);

        logger.info("Tool invocation", { tool: name });
        incrementQueryCount();

        const tool = getTool(name);
        if (!tool) {
          logger.warn("Unknown tool requested", { tool: name });
          return formatErrorResponse(new Error(`Unknown tool: ${name}`)) as {
            content: Array<{ type: "text"; text: string }>;
          };
        }

        try {
          // Wrap handler with audit logging for automatic timing and PII sanitization
          const auditedHandler = withAuditLogging(name, tool.handler);
          const result = await auditedHandler(args ?? {});
          logger.debug("Tool completed", { tool: name });
          return result as { content: Array<{ type: "text"; text: string }> };
        } catch (error) {
          logger.error("Tool execution failed", error, { tool: name });
          // Capture error in Sentry with tool context
          Sentry.captureException(error, {
            tags: { tool: name },
            extra: { args },
          });
          return formatErrorResponse(error) as { content: Array<{ type: "text"; text: string }> };
        }
      },
      { [SpanAttributes.MCP_TOOL]: name }
    );
  });

  // List prompts handler
  server.setRequestHandler(ListPromptsRequestSchema, async () => {
    logger.debug("ListPrompts request");
    return {
      prompts: getPromptDefinitions(),
    };
  });

  // Get prompt handler
  server.setRequestHandler(GetPromptRequestSchema, async (request) => {
    const { name, arguments: args } = request.params;
    logger.debug("GetPrompt request", { prompt: name });

    const result = await executePrompt(name, args ?? {});
    if (!result) {
      throw new Error(`Unknown prompt: ${name}`);
    }

    // Cast to SDK type - our internal type matches the SDK structure
    return result as unknown as GetPromptResult;
  });
}

/**
 * Disney Parks MCP Server
 *
 * Provides structured Disney park data through MCP tools.
 */
export class DisneyMcpServer {
  /** MCP servers currently connected to a transport (one per HTTP session, or the stdio one). */
  // eslint-disable-next-line @typescript-eslint/no-deprecated
  private readonly activeServers = new Set<Server>();
  private cleanupEventHandlers?: () => void;
  private httpServer?: HttpTransportServer;

  constructor() {
    this.setupErrorHandling();
  }

  /**
   * Set up error handling and graceful shutdown.
   */
  private setupErrorHandling(): void {
    // Graceful shutdown handlers
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

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", error);
      void this.shutdown().finally(() => {
        process.exit(1);
      });
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection", reason as Error);
    });
  }

  /**
   * Initialize and start the server.
   * Uses transport mode from config (stdio or http).
   */
  async run(): Promise<void> {
    const config = getConfig();

    logger.info("Starting Disney Parks MCP server", {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      transport: config.transport,
    });

    // Initialize session manager
    const sessionManager = getSessionManager();
    await sessionManager.initialize();

    // Purge expired cache entries on startup
    await cachePurgeExpired();

    // Register event handlers for entity lifecycle
    // WHY: Wire up event subscriptions at startup to enable embedding generation
    this.cleanupEventHandlers = registerEmbeddingHandlers();
    logger.debug("Event handlers registered");

    // Connect based on transport mode
    if (config.transport === "http") {
      await this.runHttp(config.httpPort, config.httpHost);
    } else {
      await this.runStdio();
    }
  }

  /**
   * Run with stdio transport (default for local Claude Desktop).
   */
  private async runStdio(): Promise<void> {
    const transport = new StdioServerTransport();
    const server = createMcpServer();
    this.activeServers.add(server);

    // Configure logger to use MCP protocol for structured logging
    // WHY: Prevents double-serialized JSON in MCP inspector. Only stdio has a
    // single long-lived server; HTTP sessions come and go, so HTTP logs go to stderr/file.
    setMcpServer(server);

    await server.connect(transport);
    logger.info("Disney Parks MCP server running (stdio)");
  }

  /**
   * Run with HTTP transport (for cloud deployment).
   */
  private async runHttp(port: number, host: string): Promise<void> {
    this.httpServer = new HttpTransportServer();

    // Create a fresh MCP server for every HTTP session/transport.
    // Server.connect() chains the transport's existing onclose, so the transport
    // closing (session end, DELETE, shutdown) tears the server down with it.
    this.httpServer.setMcpServerConnector(async (transport: StreamableHTTPServerTransport) => {
      const server = createMcpServer();
      this.activeServers.add(server);

      const previousOnClose = transport.onclose;
      transport.onclose = () => {
        this.activeServers.delete(server);
        previousOnClose?.();
      };

      try {
        await server.connect(transport);
      } catch (error) {
        this.activeServers.delete(server);
        void transport.close();
        throw error;
      }
    });

    await this.httpServer.start(port, host);
    logger.info("Disney Parks MCP server running (http)", { port, host });
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down Disney Parks MCP server");

    try {
      // Cleanup event handlers
      if (this.cleanupEventHandlers) {
        this.cleanupEventHandlers();
        logger.debug("Event handlers unregistered");
      }

      // Remove all event listeners
      removeAllEventListeners();

      // Shutdown HTTP server if running
      if (this.httpServer) {
        await this.httpServer.stop();
        logger.debug("HTTP server stopped");
      }

      // Shutdown session manager (close browser)
      const sessionManager = getSessionManager();
      await sessionManager.shutdown();

      // Close database connection
      closeDatabase();

      // Close MCP server
      await Promise.allSettled([...this.activeServers].map((server) => server.close()));
      this.activeServers.clear();

      // Flush Sentry events before exit
      await Sentry.close(SENTRY_FLUSH_TIMEOUT_MS);

      logger.info("Shutdown complete");
    } catch (error) {
      logger.error("Error during shutdown", error);
    }
  }
}
