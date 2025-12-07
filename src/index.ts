#!/usr/bin/env node
/**
 * Disney Parks MCP Server
 *
 * Entry point for the MCP server.
 *
 * Usage:
 *   npx mouse-mcp
 *   node --import ./dist/instrumentation.js dist/index.js
 *
 * For development with tsx:
 *   tsx --import ./src/instrumentation.ts src/index.ts
 */

// Load environment variables from .env file FIRST
import "dotenv/config";

// Import instrumentation (Sentry + OTEL) - must be imported early
// Note: For best results, use --import flag instead of this import
import "./instrumentation.js";

import { DisneyMcpServer } from "./server.js";
import { createLogger } from "./shared/index.js";
import { Sentry } from "./shared/tracing.js";

const logger = createLogger("Main");

async function main(): Promise<void> {
  try {
    const server = new DisneyMcpServer();
    await server.run();
  } catch (error) {
    logger.error("Fatal error starting server", error);

    // Capture fatal error in Sentry
    Sentry.captureException(error);

    // Flush Sentry events before exit
    await Sentry.close(2000);

    process.exit(1);
  }
}

void main();
