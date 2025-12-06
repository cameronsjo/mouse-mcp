#!/usr/bin/env node
/**
 * Disney Parks MCP Server
 *
 * Entry point for the MCP server.
 *
 * Usage:
 *   npx mouse-mcp                              # stdio mode (default)
 *   MOUSE_MCP_TRANSPORT=http npx mouse-mcp     # HTTP mode
 *   node dist/index.js
 */

// Load environment variables from .env file
import "dotenv/config";

import { DisneyMcpServer } from "./server.js";
import { getConfig } from "./config/index.js";
import { createLogger } from "./shared/index.js";

const logger = createLogger("Main");

async function main(): Promise<void> {
  try {
    const config = getConfig();
    const server = new DisneyMcpServer();

    // Start server with appropriate transport
    if (config.transport === "http") {
      logger.info("Starting server in HTTP mode", {
        host: config.httpHost,
        port: config.httpPort,
      });

      await server.runHttp({
        host: config.httpHost,
        port: config.httpPort,
        resumability: config.httpResumability,
      });
    } else {
      logger.info("Starting server in stdio mode");
      await server.run();
    }
  } catch (error) {
    logger.error("Fatal error starting server", error);
    process.exit(1);
  }
}

void main();
