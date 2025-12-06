/**
 * Disney MCP Server
 *
 * MCP server that provides Disney parks data through tools.
 */

// Using low-level Server API for fine-grained control over request handling
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "./shared/index.js";
import { formatErrorResponse } from "./shared/errors.js";
import { getToolDefinitions, getTool } from "./tools/index.js";
import { listResources, readResource } from "./resources/index.js";
import { getPromptDefinitions, getPromptHandler } from "./prompts/index.js";
import { getSessionManager } from "./clients/index.js";
import { closeDatabase, cachePurgeExpired } from "./db/index.js";
import { registerEmbeddingHandlers, removeAllEventListeners } from "./events/index.js";
import { McpHttpServer, type HttpTransportConfig } from "./transport/index.js";

const logger = createLogger("Server");

const SERVER_NAME = "disney-parks";
const SERVER_VERSION = "1.0.0";

/**
 * Disney Parks MCP Server
 *
 * Provides structured Disney park data through MCP tools.
 */
export class DisneyMcpServer {
  // eslint-disable-next-line @typescript-eslint/no-deprecated -- Using low-level Server for fine-grained control
  private readonly server: Server;
  private cleanupEventHandlers?: () => void;
  private httpServer?: McpHttpServer;

  constructor() {
    // eslint-disable-next-line @typescript-eslint/no-deprecated
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
  }

  /**
   * Get the underlying MCP server instance.
   * WHY: Allows HTTP transport to connect to the same server instance.
   */
  getServer(): Server {
    return this.server;
  }

  /**
   * Set up MCP request handlers.
   */
  private setupHandlers(): void {
    // List tools handler
    this.server.setRequestHandler(ListToolsRequestSchema, async () => {
      logger.debug("ListTools request");
      return {
        tools: getToolDefinitions(),
      };
    });

    // Call tool handler
    this.server.setRequestHandler(CallToolRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info("Tool invocation", { tool: name });

      const tool = getTool(name);
      if (!tool) {
        logger.warn("Unknown tool requested", { tool: name });
        return formatErrorResponse(new Error(`Unknown tool: ${name}`)) as {
          content: Array<{ type: "text"; text: string }>;
        };
      }

      try {
        const result = await tool.handler(args ?? {});
        logger.debug("Tool completed", { tool: name });
        return result as { content: Array<{ type: "text"; text: string }> };
      } catch (error) {
        logger.error("Tool execution failed", error, { tool: name });
        return formatErrorResponse(error) as { content: Array<{ type: "text"; text: string }> };
      }
    });

    // List resources handler
    this.server.setRequestHandler(ListResourcesRequestSchema, async () => {
      logger.debug("ListResources request");
      try {
        const resources = await listResources();
        return { resources };
      } catch (error) {
        logger.error("Failed to list resources", error);
        throw error;
      }
    });

    // Read resource handler
    this.server.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const { uri } = request.params;

      logger.info("Resource read", { uri });

      try {
        const contents = await readResource(uri);
        logger.debug("Resource read completed", { uri });
        return { contents };
      } catch (error) {
        logger.error("Resource read failed", error, { uri });
        throw error;
      }
    });

    // List prompts handler
    this.server.setRequestHandler(ListPromptsRequestSchema, async () => {
      logger.debug("ListPrompts request");
      return {
        prompts: getPromptDefinitions(),
      };
    });

    // Get prompt handler
    this.server.setRequestHandler(GetPromptRequestSchema, async (request) => {
      const { name, arguments: args } = request.params;

      logger.info("Prompt invocation", { prompt: name });

      const handler = getPromptHandler(name);
      if (!handler) {
        logger.warn("Unknown prompt requested", { prompt: name });
        throw new Error(`Unknown prompt: ${name}`);
      }

      try {
        const result = await handler(args ?? {});
        logger.debug("Prompt completed", { prompt: name });
        return result;
      } catch (error) {
        logger.error("Prompt execution failed", error, { prompt: name });
        throw error;
      }
    });
  }

  /**
   * Set up error handling and graceful shutdown.
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error("Server error", error);
    };

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
   * Initialize and start the server with stdio transport.
   */
  async run(): Promise<void> {
    logger.info("Starting Disney Parks MCP server (stdio mode)", {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });

    await this.initialize();

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info("Disney Parks MCP server running (stdio)");
  }

  /**
   * Initialize and start the server with HTTP transport.
   */
  async runHttp(config: HttpTransportConfig): Promise<void> {
    logger.info("Starting Disney Parks MCP server (HTTP mode)", {
      name: SERVER_NAME,
      version: SERVER_VERSION,
      host: config.host,
      port: config.port,
    });

    await this.initialize();

    // Create and start HTTP server
    this.httpServer = new McpHttpServer(this.server, config);
    await this.httpServer.start();

    logger.info("Disney Parks MCP server running (HTTP)", {
      address: this.httpServer.getAddress(),
    });
  }

  /**
   * Common initialization for both transport modes.
   */
  private async initialize(): Promise<void> {
    // Initialize session manager
    const sessionManager = getSessionManager();
    await sessionManager.initialize();

    // Purge expired cache entries on startup
    await cachePurgeExpired();

    // Register event handlers for entity lifecycle
    // WHY: Wire up event subscriptions at startup to enable embedding generation
    this.cleanupEventHandlers = registerEmbeddingHandlers();
    logger.debug("Event handlers registered");
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down Disney Parks MCP server");

    try {
      // Stop HTTP server if running
      if (this.httpServer) {
        await this.httpServer.stop();
        this.httpServer = undefined;
      }

      // Cleanup event handlers
      if (this.cleanupEventHandlers) {
        this.cleanupEventHandlers();
        logger.debug("Event handlers unregistered");
      }

      // Remove all event listeners
      removeAllEventListeners();

      // Shutdown session manager (close browser)
      const sessionManager = getSessionManager();
      await sessionManager.shutdown();

      // Close database connection
      closeDatabase();

      // Close MCP server
      await this.server.close();

      logger.info("Shutdown complete");
    } catch (error) {
      logger.error("Error during shutdown", error);
    }
  }
}
