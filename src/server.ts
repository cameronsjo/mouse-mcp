/**
 * Disney MCP Server
 *
 * MCP server that provides Disney parks data through tools.
 */

// Using low-level Server API for fine-grained control over request handling
import type { Server as HttpServer } from "node:http";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema,
  type GetPromptResult,
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "./shared/index.js";
import { formatErrorResponse } from "./shared/errors.js";
import { getToolDefinitions, getTool } from "./tools/index.js";
import { getPromptDefinitions, generatePrompt } from "./prompts/index.js";
import { getSessionManager } from "./clients/index.js";
import { closeDatabase, cachePurgeExpired } from "./db/index.js";
import { registerEmbeddingHandlers, removeAllEventListeners } from "./events/index.js";
import { startHttpServer, closeAllTransports } from "./transport/index.js";
import { getConfig } from "./config/index.js";

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
  private httpServer?: HttpServer;

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
          prompts: {},
        },
      }
    );

    this.setupHandlers();
    this.setupErrorHandling();
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

      logger.info("Prompt request", { prompt: name });

      const result = generatePrompt(name, args ?? {});
      if (!result) {
        logger.warn("Unknown prompt requested", { prompt: name });
        throw new Error(`Unknown prompt: ${name}`);
      }

      logger.debug("Prompt generated", { prompt: name });
      return result as GetPromptResult;
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
   * Initialize and start the server.
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

    // Connect to appropriate transport based on configuration
    if (config.transport === "http") {
      // HTTP transport for cloud deployment
      this.httpServer = await startHttpServer(this.server);
      logger.info("Disney Parks MCP server running on HTTP", {
        host: config.httpHost,
        port: config.httpPort,
      });
    } else {
      // stdio transport for local Claude Desktop
      const transport = new StdioServerTransport();
      await this.server.connect(transport);
      logger.info("Disney Parks MCP server running on stdio");
    }
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

      // Close HTTP transports if running
      if (this.httpServer) {
        await closeAllTransports();
        await new Promise<void>((resolve, reject) => {
          this.httpServer!.close((err) => {
            if (err) reject(err);
            else resolve();
          });
        });
        logger.debug("HTTP server closed");
      }

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
