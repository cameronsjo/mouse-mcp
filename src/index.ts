#!/usr/bin/env node
/**
 * Disney Parks MCP Server
 *
 * Entry point for the MCP server.
 *
 * Usage:
 *   npx mouse-mcp
 *   node dist/index.js
 */

// Load environment variables from .env file
import "dotenv/config";

import { DisneyMcpServer } from "./server.js";
import { createLogger } from "./shared/index.js";

const logger = createLogger("Main");

async function main(): Promise<void> {
  try {
    const server = new DisneyMcpServer();
    await server.run();
  } catch (error) {
    logger.error("Fatal error starting server", error);
    process.exit(1);
  }
}

void main();
