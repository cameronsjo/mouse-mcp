/**
 * HTTP Transport
 *
 * Streamable HTTP transport for cloud deployment.
 * Implements MCP spec 2025-11-25 Streamable HTTP.
 */

import { randomUUID } from "node:crypto";
import { createServer, type Server, type IncomingMessage, type ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Server as McpServer } from "@modelcontextprotocol/sdk/server/index.js";
import { createLogger } from "../shared/logger.js";
import { getConfig } from "../config/index.js";

const logger = createLogger("HttpTransport");

/** Active transport sessions by session ID */
const transports = new Map<string, StreamableHTTPServerTransport>();

/**
 * Start the HTTP server for MCP.
 *
 * @param mcpServer The MCP server instance to connect transports to
 * @returns HTTP server instance
 */
export async function startHttpServer(mcpServer: McpServer): Promise<Server> {
  const config = getConfig();
  const { httpPort, httpHost } = config;

  const server = createServer((req, res) => {
    void handleRequest(req, res, mcpServer);
  });

  return new Promise((resolve, reject) => {
    server.on("error", (error) => {
      logger.error("HTTP server error", error);
      reject(error);
    });

    server.listen(httpPort, httpHost, () => {
      logger.info("HTTP server started", { host: httpHost, port: httpPort });
      resolve(server);
    });
  });
}

/**
 * Handle incoming HTTP requests.
 */
async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
  mcpServer: McpServer
): Promise<void> {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);

  // Health check endpoint
  if (url.pathname === "/health" && req.method === "GET") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ status: "ok", service: "mouse-mcp" }));
    return;
  }

  // MCP endpoint
  if (url.pathname === "/mcp") {
    await handleMcpRequest(req, res, mcpServer);
    return;
  }

  // Not found
  res.writeHead(404, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "Not found" }));
}

/**
 * Handle MCP protocol requests.
 */
async function handleMcpRequest(
  req: IncomingMessage,
  res: ServerResponse,
  mcpServer: McpServer
): Promise<void> {
  // Validate host header (DNS rebinding protection)
  const config = getConfig();
  const host = req.headers.host;
  const allowedHosts = ["localhost", "127.0.0.1", "[::1]", `localhost:${config.httpPort}`, `127.0.0.1:${config.httpPort}`];

  if (config.httpHost === "127.0.0.1" || config.httpHost === "localhost") {
    if (!host || !allowedHosts.some((h) => host.startsWith(h))) {
      logger.warn("DNS rebinding protection: rejected request", { host });
      res.writeHead(403, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Forbidden: Invalid host header" }));
      return;
    }
  }

  const sessionId = req.headers["mcp-session-id"] as string | undefined;

  try {
    // Parse request body for POST requests
    let body: unknown = undefined;
    if (req.method === "POST") {
      body = await parseJsonBody(req);
    }

    let transport: StreamableHTTPServerTransport;

    // Check for existing session
    if (sessionId && transports.has(sessionId)) {
      transport = transports.get(sessionId)!;
      logger.debug("Using existing session", { sessionId });
    }
    // New initialization request
    else if (!sessionId && req.method === "POST" && isInitializeRequest(body)) {
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => randomUUID(),
        onsessioninitialized: (sid: string) => {
          logger.info("Session initialized", { sessionId: sid });
          transports.set(sid, transport);
        },
      });

      // Handle session close
      transport.onclose = () => {
        const sid = transport.sessionId;
        if (sid && transports.has(sid)) {
          logger.info("Session closed", { sessionId: sid });
          transports.delete(sid);
        }
      };

      // Connect transport to MCP server
      await mcpServer.connect(transport);
      logger.debug("Transport connected to MCP server");
    }
    // Invalid request - no session and not initialize
    else {
      logger.warn("Bad request: missing session ID or not initialize request", {
        hasSessionId: !!sessionId,
        method: req.method,
        isInitialize: isInitializeRequest(body),
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: No valid session ID provided",
          },
          id: null,
        })
      );
      return;
    }

    // Handle the request with the transport
    await transport.handleRequest(req, res, body);
  } catch (error) {
    logger.error("Error handling MCP request", error);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(
        JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: "Internal server error",
          },
          id: null,
        })
      );
    }
  }
}

/**
 * Parse JSON body from request.
 */
async function parseJsonBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];

    req.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });

    req.on("end", () => {
      try {
        const body = Buffer.concat(chunks).toString("utf-8");
        if (body) {
          resolve(JSON.parse(body));
        } else {
          resolve(undefined);
        }
      } catch (error) {
        reject(error);
      }
    });

    req.on("error", reject);
  });
}

/**
 * Close all active HTTP transports.
 */
export async function closeAllTransports(): Promise<void> {
  logger.info("Closing all HTTP transports", { count: transports.size });

  const closePromises: Promise<void>[] = [];
  for (const [sessionId, transport] of transports) {
    closePromises.push(
      transport.close().catch((error) => {
        logger.error("Error closing transport", error, { sessionId });
      })
    );
  }

  await Promise.all(closePromises);
  transports.clear();
  logger.debug("All HTTP transports closed");
}

/**
 * Get active session count.
 */
export function getActiveSessionCount(): number {
  return transports.size;
}
