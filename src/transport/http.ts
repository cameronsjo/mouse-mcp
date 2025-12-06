/**
 * HTTP Transport Implementation
 *
 * Provides Streamable HTTP transport for cloud deployment of the MCP server.
 * Uses a single /mcp endpoint for all MCP traffic with session management.
 */

import { randomUUID } from "node:crypto";
import express, { type Request, type Response, type Application } from "express";
import type { Server as HttpServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import type { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { createLogger } from "../shared/index.js";
import type { HttpTransportConfig, HttpServerInstance } from "./types.js";

const logger = createLogger("HttpTransport");

/**
 * HTTP Server for MCP Streamable Transport.
 *
 * Manages HTTP endpoints, session tracking, and transport lifecycle.
 */
export class McpHttpServer implements HttpServerInstance {
  private readonly config: HttpTransportConfig;
  private readonly mcpServer: Server;
  private readonly transports: Map<string, StreamableHTTPServerTransport>;
  private app: Application | null = null;
  private httpServer: HttpServer | null = null;

  constructor(mcpServer: Server, config: HttpTransportConfig) {
    this.mcpServer = mcpServer;
    this.config = config;
    this.transports = new Map();
  }

  /**
   * Start the HTTP server.
   */
  async start(): Promise<void> {
    logger.info("Starting HTTP transport server", {
      host: this.config.host,
      port: this.config.port,
      resumability: this.config.resumability,
    });

    // Create Express app
    this.app = express();

    // Parse JSON bodies
    this.app.use(express.json());

    // CORS headers for web clients
    this.app.use((req: Request, res: Response, next) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, POST, DELETE, OPTIONS");
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, MCP-Session-Id, MCP-Protocol-Version"
      );
      res.setHeader("Access-Control-Expose-Headers", "MCP-Session-Id");

      // Handle OPTIONS preflight requests
      if (req.method === "OPTIONS") {
        res.sendStatus(204);
        return;
      }

      next();
    });

    // Health check endpoint
    this.app.get("/health", (_req: Request, res: Response) => {
      res.json({
        status: "healthy",
        service: "mouse-mcp",
        transport: "http",
        sessions: this.transports.size,
      });
    });

    // Main MCP endpoint - handles GET/POST/DELETE
    this.app.all("/mcp", async (req: Request, res: Response) => {
      await this.handleMcpRequest(req, res);
    });

    // Start HTTP server
    await new Promise<void>((resolve, reject) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- app is guaranteed initialized above
        this.httpServer = this.app!.listen(this.config.port, this.config.host, () => {
          logger.info("HTTP server listening", {
            address: `http://${this.config.host}:${this.config.port}`,
          });
          resolve();
        });

        this.httpServer.on("error", (error: Error) => {
          logger.error("HTTP server error", error);
          reject(error);
        });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Failed to start HTTP server", error);
        reject(error);
      }
    });
  }

  /**
   * Stop the HTTP server and clean up all sessions.
   */
  async stop(): Promise<void> {
    logger.info("Stopping HTTP transport server");

    // Close all active transports
    const closePromises: Array<Promise<void>> = [];
    for (const [sessionId, transport] of this.transports.entries()) {
      logger.debug("Closing session", { sessionId });
      closePromises.push(
        transport.close().catch((err: unknown) => {
          const error = err instanceof Error ? err : new Error(String(err));
          logger.error("Error closing transport", error, { sessionId });
        })
      );
    }

    await Promise.all(closePromises);
    this.transports.clear();

    // Close HTTP server
    if (this.httpServer !== null) {
      const server = this.httpServer;
      await new Promise<void>((resolve, reject) => {
        server.close((error) => {
          if (error !== undefined && error !== null) {
            logger.error("Error closing HTTP server", error);
            reject(error);
          } else {
            logger.info("HTTP server closed");
            resolve();
          }
        });
      });
      this.httpServer = null;
    }

    this.app = null;
  }

  /**
   * Get the server address.
   */
  getAddress(): { host: string; port: number } | null {
    if (!this.httpServer) {
      return null;
    }

    const address = this.httpServer.address();
    if (!address || typeof address === "string") {
      return null;
    }

    return {
      host: address.address,
      port: address.port,
    };
  }

  /**
   * Handle MCP request on the /mcp endpoint.
   *
   * Manages session lifecycle and routes requests to appropriate transport.
   */
  private async handleMcpRequest(req: Request, res: Response): Promise<void> {
    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    try {
      let transport: StreamableHTTPServerTransport;

      // Check for existing session
      if (sessionId !== undefined && this.transports.has(sessionId)) {
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- checked with has() above
        transport = this.transports.get(sessionId)!;
        logger.debug("Using existing session", { sessionId, method: req.method });
      }
      // New initialization request
      else if (!sessionId && req.method === "POST" && isInitializeRequest(req.body)) {
        logger.debug("Creating new session");
        transport = await this.createTransport();
      }
      // Invalid request
      else {
        logger.warn("Invalid MCP request", {
          hasSessionId: !!sessionId,
          sessionExists: sessionId ? this.transports.has(sessionId) : false,
          method: req.method,
          isInitialize: req.method === "POST" && isInitializeRequest(req.body),
        });

        res.status(400).json({
          jsonrpc: "2.0",
          error: {
            code: -32000,
            message: "Bad Request: Invalid session or missing initialization",
          },
          id: null,
        });
        return;
      }

      // Handle the request through the transport
      await transport.handleRequest(req, res, req.body);
    } catch (error) {
      logger.error("Error handling MCP request", error, { sessionId, method: req.method });

      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: "2.0",
          error: {
            code: -32603,
            message: error instanceof Error ? error.message : "Internal server error",
          },
          id: null,
        });
      }
    }
  }

  /**
   * Create a new transport instance and connect it to the MCP server.
   */
  private async createTransport(): Promise<StreamableHTTPServerTransport> {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sessionId: string) => {
        logger.info("Session initialized", { sessionId });
        this.transports.set(sessionId, transport);
      },
      onsessionclosed: async (sessionId: string) => {
        logger.info("Session closed", { sessionId });
        this.transports.delete(sessionId);
      },
    });

    // Set up transport close handler
    transport.onclose = () => {
      const sessionId = transport.sessionId;
      if (sessionId && this.transports.has(sessionId)) {
        logger.debug("Transport closed event", { sessionId });
        this.transports.delete(sessionId);
      }
    };

    // Connect transport to MCP server
    await this.mcpServer.connect(transport);

    return transport;
  }
}
