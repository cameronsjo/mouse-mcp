/**
 * Disney MCP Server
 *
 * MCP server that provides Disney parks data through tools.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { createLogger } from "./shared/index.js";
import { formatErrorResponse } from "./shared/errors.js";
import { getToolDefinitions, getTool } from "./tools/index.js";
import { getSessionManager } from "./clients/index.js";
import { closeDatabase, cachePurgeExpired } from "./db/index.js";

const logger = createLogger("Server");

const SERVER_NAME = "disney-parks";
const SERVER_VERSION = "1.0.0";

/**
 * Disney Parks MCP Server
 *
 * Provides structured Disney park data through MCP tools.
 */
export class DisneyMcpServer {
  private readonly server: Server;

  constructor() {
    this.server = new Server(
      {
        name: SERVER_NAME,
        version: SERVER_VERSION,
      },
      {
        capabilities: {
          tools: {},
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
        return formatErrorResponse(new Error(`Unknown tool: ${name}`)) as { content: Array<{ type: "text"; text: string }> };
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
  }

  /**
   * Set up error handling and graceful shutdown.
   */
  private setupErrorHandling(): void {
    this.server.onerror = (error) => {
      logger.error("Server error", error);
    };

    // Graceful shutdown handlers
    const shutdown = async (signal: string) => {
      logger.info("Shutdown signal received", { signal });
      await this.shutdown();
      process.exit(0);
    };

    process.on("SIGINT", () => shutdown("SIGINT"));
    process.on("SIGTERM", () => shutdown("SIGTERM"));

    // Handle uncaught errors
    process.on("uncaughtException", (error) => {
      logger.error("Uncaught exception", error);
      this.shutdown().finally(() => process.exit(1));
    });

    process.on("unhandledRejection", (reason) => {
      logger.error("Unhandled rejection", reason as Error);
    });
  }

  /**
   * Initialize and start the server.
   */
  async run(): Promise<void> {
    logger.info("Starting Disney Parks MCP server", {
      name: SERVER_NAME,
      version: SERVER_VERSION,
    });

    // Initialize session manager
    const sessionManager = getSessionManager();
    await sessionManager.initialize();

    // Purge expired cache entries on startup
    await cachePurgeExpired();

    // Connect to stdio transport
    const transport = new StdioServerTransport();
    await this.server.connect(transport);

    logger.info("Disney Parks MCP server running");
  }

  /**
   * Graceful shutdown.
   */
  async shutdown(): Promise<void> {
    logger.info("Shutting down Disney Parks MCP server");

    try {
      // Shutdown session manager (close browser)
      const sessionManager = getSessionManager();
      await sessionManager.shutdown();

      // Close database connection
      await closeDatabase();

      // Close MCP server
      await this.server.close();

      logger.info("Shutdown complete");
    } catch (error) {
      logger.error("Error during shutdown", error);
    }
  }
}
