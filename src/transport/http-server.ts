/**
 * HTTP Transport Server
 *
 * Provides StreamableHTTP transport for cloud deployment.
 * Uses Node.js native http module (no Express dependency).
 *
 * WHY: Enables cloud deployment while keeping dependencies minimal.
 * Uses the MCP 2025-11-25 StreamableHTTPServerTransport for spec compliance.
 */

import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { isInitializeRequest } from "@modelcontextprotocol/sdk/types.js";
import { createLogger, type LogContext } from "../shared/logger.js";
import { getQueryCount } from "../shared/query-counter.js";
import { getConfig } from "../config/index.js";
import { getLastEntityUpdate, getParkCount } from "../db/index.js";
import { BearerAuthenticator, type ValidatedToken } from "../auth/index.js";

const logger = createLogger("HttpServer");

/** HTTP server port from constants */
const DEFAULT_HTTP_PORT = 3000;
const DEFAULT_HTTP_HOST = "127.0.0.1";

interface TransportSession {
  transport: StreamableHTTPServerTransport;
  createdAt: Date;
  token?: ValidatedToken;
}

/**
 * Health check response structure.
 */
interface HealthCheckResponse {
  status: "ok" | "degraded" | "unhealthy";
  service: string;
  version: string;
  timestamp: string;
  uptime: number;
  checks: {
    database: boolean;
    sessions: number;
  };
}

/**
 * Homepage widget response structure.
 * Flat JSON required by Homepage's customapi widget (max 4 fields, no nesting).
 * WHY snake_case: Field names are an external API contract dictated by Homepage.
 */
/* eslint-disable @typescript-eslint/naming-convention */
interface WidgetResponse {
  queries_total: number;
  parks_available: number;
  last_data_refresh: string | null;
  uptime_seconds: number;
}
/* eslint-enable @typescript-eslint/naming-convention */

/**
 * HTTP server for MCP transport.
 *
 * Provides:
 * - /health endpoint for container orchestration
 * - /api/widget endpoint for Homepage dashboard widget
 * - /mcp endpoint for StreamableHTTP transport
 * - /.well-known/mcp discovery endpoint
 */
export class HttpTransportServer {
  private server: Server | null = null;
  private readonly transports = new Map<string, TransportSession>();
  private readonly startTime: Date = new Date();
  private authenticator: BearerAuthenticator | null = null;
  private resourceUrl = "";

  private mcpServerConnector: ((transport: StreamableHTTPServerTransport) => Promise<void>) | null =
    null;

  /**
   * Set the MCP server connector function.
   * Called when a new transport needs to be connected to the MCP server.
   */
  setMcpServerConnector(
    connector: (transport: StreamableHTTPServerTransport) => Promise<void>
  ): void {
    this.mcpServerConnector = connector;
  }

  /**
   * Start the HTTP server.
   */
  async start(port?: number, host?: string): Promise<void> {
    const config = getConfig();
    const actualPort = port ?? config.httpPort ?? DEFAULT_HTTP_PORT;
    const actualHost = host ?? config.httpHost ?? DEFAULT_HTTP_HOST;

    // Build resource URL for OAuth
    // WHY: Used in WWW-Authenticate header and protected resource metadata
    const protocol = actualHost === "127.0.0.1" || actualHost === "localhost" ? "http" : "https";
    this.resourceUrl = `${protocol}://${actualHost}:${actualPort}`;

    // Initialize bearer authenticator
    // WHY: Validates JWT tokens on incoming requests when OAuth is enabled
    this.authenticator = new BearerAuthenticator(config.oauth, this.resourceUrl);

    if (config.oauth.enabled) {
      logger.info("OAuth authentication enabled", {
        issuer: config.oauth.authServer?.issuer,
        audience: config.oauth.authServer?.audience,
      } as LogContext);
    }

    return new Promise((resolve, reject) => {
      this.server = createServer((req, res) => {
        void this.handleRequest(req, res);
      });

      this.server.on("error", (error) => {
        logger.error("HTTP server error", error);
        reject(error);
      });

      this.server.listen(actualPort, actualHost, () => {
        logger.info("HTTP server started", {
          port: actualPort,
          host: actualHost,
        } as LogContext);
        resolve();
      });
    });
  }

  /**
   * Stop the HTTP server.
   */
  async stop(): Promise<void> {
    // Close all active transports
    for (const [sessionId, session] of this.transports) {
      try {
        await session.transport.close();
        logger.debug("Transport closed", { sessionId } as LogContext);
      } catch (error) {
        logger.error("Error closing transport", error, { sessionId } as LogContext);
      }
    }
    this.transports.clear();

    // Close the HTTP server
    if (this.server) {
      return new Promise((resolve, reject) => {
        this.server?.close((error) => {
          if (error) {
            reject(error);
          } else {
            logger.info("HTTP server stopped");
            resolve();
          }
        });
      });
    }
  }

  /**
   * Get the number of active sessions.
   */
  getActiveSessionCount(): number {
    return this.transports.size;
  }

  /**
   * Route incoming requests.
   */
  private async handleRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);
    const path = url.pathname;

    logger.debug("HTTP request", {
      method: req.method,
      path,
    } as LogContext);

    try {
      // Route requests
      if (path === "/health") {
        this.handleHealthCheck(res);
      } else if (path === "/api/widget") {
        await this.handleWidget(res);
      } else if (path === "/.well-known/mcp") {
        this.handleDiscovery(res);
      } else if (path === "/.well-known/oauth-protected-resource") {
        this.handleProtectedResourceMetadata(res);
      } else if (path === "/mcp") {
        await this.handleMcpRequest(req, res);
      } else {
        this.sendNotFound(res);
      }
    } catch (error) {
      logger.error("Request handler error", error);
      this.sendError(res, 500, "Internal server error");
    }
  }

  /**
   * Handle health check requests.
   * Returns structured health information for container orchestration.
   */
  private handleHealthCheck(res: ServerResponse): void {
    const response: HealthCheckResponse = {
      status: "ok",
      service: "mouse-mcp",
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      uptime: Math.floor((Date.now() - this.startTime.getTime()) / 1000),
      checks: {
        database: true, // TODO: Add actual database health check
        sessions: this.transports.size,
      },
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }

  /**
   * Handle Homepage widget requests.
   * Returns flat JSON stats for Homepage's customapi widget.
   * Unauthenticated — intended for internal network use only.
   */
  private async handleWidget(res: ServerResponse): Promise<void> {
    const uptimeSeconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const [lastRefresh, parkCount] = await Promise.all([getLastEntityUpdate(), getParkCount()]);

    const response: WidgetResponse = {
      queries_total: getQueryCount(),
      parks_available: parkCount,
      last_data_refresh: lastRefresh,
      uptime_seconds: uptimeSeconds,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(response));
  }

  /**
   * Handle MCP discovery requests.
   * Returns server capabilities for .well-known/mcp endpoint.
   */
  private handleDiscovery(res: ServerResponse): void {
    const config = getConfig();
    const discovery = {
      name: "mouse-mcp",
      version: "1.0.0",
      protocol_version: "2025-11-25",
      capabilities: {
        tools: true,
        resources: false,
        prompts: false,
      },
      endpoints: {
        mcp: "/mcp",
      },
      // Include auth info if OAuth is enabled
      ...(config.oauth.enabled && {
        authentication: {
          type: "oauth2",
          protected_resource_metadata: `${this.resourceUrl}/.well-known/oauth-protected-resource`,
        },
      }),
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(discovery));
  }

  /**
   * Handle OAuth protected resource metadata (RFC 9728).
   * Returns authorization server info and supported scopes.
   */
  private handleProtectedResourceMetadata(res: ServerResponse): void {
    if (!this.authenticator) {
      this.sendError(res, 500, "Authentication not configured");
      return;
    }

    const metadata = this.authenticator.getProtectedResourceMetadata();

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(metadata));
  }

  /**
   * Handle MCP protocol requests.
   * Manages session lifecycle and routes to appropriate transport.
   */
  private async handleMcpRequest(req: IncomingMessage, res: ServerResponse): Promise<void> {
    // Authenticate request
    // WHY: MCP OAuth 2.1 requires bearer token authentication for HTTP transport
    if (this.authenticator) {
      const authResult = await this.authenticator.authenticate(req);
      if (!authResult.authenticated) {
        this.authenticator.sendUnauthorized(
          res,
          authResult.errorType ?? "invalid_token",
          authResult.error
        );
        return;
      }
    }

    // Parse request body for POST requests
    let body: unknown = undefined;
    if (req.method === "POST") {
      body = await this.parseJsonBody(req);
      if (body === null) {
        this.sendError(res, 400, "Invalid JSON body");
        return;
      }
    }

    const sessionId = req.headers["mcp-session-id"] as string | undefined;

    // Handle existing session
    if (sessionId) {
      const session = this.transports.get(sessionId);
      if (session) {
        await session.transport.handleRequest(req, res, body);
        return;
      }

      // Session not found
      if (req.method === "DELETE") {
        // Session already gone, return success
        res.writeHead(200);
        res.end();
        return;
      }

      this.sendError(res, 404, "Session not found");
      return;
    }

    // New session - must be POST with initialize request
    if (req.method !== "POST") {
      this.sendError(res, 400, "New session requires POST with initialize request");
      return;
    }

    if (!isInitializeRequest(body)) {
      this.sendError(res, 400, "First request must be initialize");
      return;
    }

    // Create new transport and session
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        logger.info("Session initialized", { sessionId: sid } as LogContext);
        this.transports.set(sid, {
          transport,
          createdAt: new Date(),
        });
      },
    });

    // Set up cleanup on close
    transport.onclose = () => {
      const sid = transport.sessionId;
      if (sid) {
        logger.info("Session closed", { sessionId: sid } as LogContext);
        this.transports.delete(sid);
      }
    };

    // Connect to MCP server
    if (this.mcpServerConnector) {
      await this.mcpServerConnector(transport);
    }

    // Handle the initialize request
    await transport.handleRequest(req, res, body);
  }

  /**
   * Parse JSON body from request.
   */
  private async parseJsonBody(req: IncomingMessage): Promise<unknown> {
    return new Promise((resolve) => {
      const chunks: Buffer[] = [];

      req.on("data", (chunk: Buffer) => {
        chunks.push(chunk);
      });

      req.on("end", () => {
        try {
          const body = Buffer.concat(chunks).toString("utf-8");
          resolve(JSON.parse(body));
        } catch {
          resolve(null);
        }
      });

      req.on("error", () => {
        resolve(null);
      });
    });
  }

  /**
   * Send 404 Not Found response.
   */
  private sendNotFound(res: ServerResponse): void {
    res.writeHead(404, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Not found" }));
  }

  /**
   * Send error response.
   */
  private sendError(res: ServerResponse, code: number, message: string): void {
    res.writeHead(code, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        jsonrpc: "2.0",
        error: {
          code: -32000,
          message,
        },
        id: null,
      })
    );
  }
}
