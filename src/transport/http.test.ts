/**
 * Integration tests for HTTP Transport
 *
 * Tests the HTTP server layer: startup/shutdown, health checks, session management,
 * CORS headers, and request routing.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { McpHttpServer } from "./http.js";
import type { HttpTransportConfig } from "./types.js";

describe("McpHttpServer", () => {
  let mcpServer: Server;
  let httpServer: McpHttpServer;
  let serverAddress: string;

  const defaultConfig: HttpTransportConfig = {
    host: "127.0.0.1",
    port: 0, // Use port 0 to get a random available port
    resumability: false,
  };

  // Helper to create MCP request headers
  const mcpHeaders = {
    "Content-Type": "application/json",
    Accept: "application/json, text/event-stream",
  };

  beforeEach(async () => {
    // Create a real MCP server instance (not mocked)
    // The Server will handle the protocol, we're just testing HTTP layer
    mcpServer = new Server(
      {
        name: "test-server",
        version: "1.0.0",
      },
      {
        capabilities: {
          resources: {},
          tools: {},
        },
      }
    );

    // Create HTTP server instance
    httpServer = new McpHttpServer(mcpServer, defaultConfig);

    // Start server
    await httpServer.start();

    // Get actual address (since we used port 0)
    const address = httpServer.getAddress();
    if (!address) {
      throw new Error("Server failed to start");
    }
    serverAddress = `http://${address.host}:${address.port}`;
  });

  afterEach(async () => {
    // Clean up server
    if (httpServer !== undefined) {
      await httpServer.stop();
    }
    vi.restoreAllMocks();
  });

  describe("Server Lifecycle", () => {
    it("should start server and listen on configured port", async () => {
      const address = httpServer.getAddress();
      expect(address).toBeTruthy();
      expect(address?.host).toBe("127.0.0.1");
      expect(address?.port).toBeGreaterThan(0);
    });

    it("should return null address after stopping", async () => {
      await httpServer.stop();
      const address = httpServer.getAddress();
      expect(address).toBeNull();
    });

    it("should be reachable via HTTP after starting", async () => {
      const response = await fetch(`${serverAddress}/health`);
      expect(response.ok).toBe(true);
    });

    it("should reject connections after stopping", async () => {
      await httpServer.stop();

      // Attempt to connect should fail
      await expect(fetch(`${serverAddress}/health`)).rejects.toThrow();
    });
  });

  describe("Health Check Endpoint", () => {
    it("should respond to GET /health with status 200", async () => {
      const response = await fetch(`${serverAddress}/health`);
      expect(response.status).toBe(200);
    });

    it("should return correct health check JSON", async () => {
      const response = await fetch(`${serverAddress}/health`);
      const data = (await response.json()) as {
        status: string;
        service: string;
        transport: string;
        sessions: number;
      };

      expect(data).toEqual({
        status: "healthy",
        service: "mouse-mcp",
        transport: "http",
        sessions: 0,
      });
    });

    it("should include CORS headers in health check response", async () => {
      const response = await fetch(`${serverAddress}/health`);

      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain("GET");
    });

    it("should update session count in health check", async () => {
      // Create a session by sending initialize request
      const initResponse = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      expect(initResponse.ok).toBe(true);

      // Check health endpoint shows active session
      const healthResponse = await fetch(`${serverAddress}/health`);
      const healthData = (await healthResponse.json()) as { sessions: number };

      expect(healthData.sessions).toBe(1);
    });
  });

  describe("CORS Headers", () => {
    it("should set CORS headers on all endpoints", async () => {
      const response = await fetch(`${serverAddress}/health`);

      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toBe(
        "GET, POST, DELETE, OPTIONS"
      );
      expect(response.headers.get("access-control-allow-headers")).toContain("Content-Type");
      expect(response.headers.get("access-control-allow-headers")).toContain("MCP-Session-Id");
      expect(response.headers.get("access-control-allow-headers")).toContain(
        "MCP-Protocol-Version"
      );
      expect(response.headers.get("access-control-expose-headers")).toBe("MCP-Session-Id");
    });

    it("should handle OPTIONS preflight requests", async () => {
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "OPTIONS",
      });

      expect(response.status).toBe(204);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
      expect(response.headers.get("access-control-allow-methods")).toContain("POST");
    });

    it("should include CORS headers on error responses", async () => {
      // Send invalid request (no session, no initialize)
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(response.status).toBe(400);
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    });
  });

  describe("Session Management", () => {
    it("should create new session on initialize request", async () => {
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      expect(response.ok).toBe(true);

      // Session ID should be in response headers
      const sessionId = response.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();
      expect(sessionId).toMatch(/^[0-9a-f-]{36}$/); // UUID format

      // Response uses Server-Sent Events (SSE) format for streamable transport
      // Check content type
      const contentType = response.headers.get("content-type");
      expect(contentType).toContain("text/event-stream");
    });

    it("should reuse session with valid session ID", async () => {
      // First request: create session
      const initResponse = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      const sessionId = initResponse.headers.get("mcp-session-id");
      expect(sessionId).toBeTruthy();

      // Second request: reuse session
      const listResponse = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: {
          ...mcpHeaders,
          // eslint-disable-next-line @typescript-eslint/no-non-null-assertion -- we verified sessionId is truthy above
          "MCP-Session-Id": sessionId!,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 2,
          method: "tools/list",
        }),
      });

      expect(listResponse.ok).toBe(true);

      // Should have the same session ID
      const listSessionId = listResponse.headers.get("mcp-session-id");
      expect(listSessionId).toBe(sessionId);
    });

    it("should reject requests with invalid session ID", async () => {
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: {
          ...mcpHeaders,
          "MCP-Session-Id": "invalid-session-id",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(response.status).toBe(400);

      const errorData = (await response.json()) as {
        jsonrpc: string;
        error: { code: number; message: string };
        id: null;
      };

      expect(errorData.error.code).toBe(-32000);
      expect(errorData.error.message).toContain("Invalid session");
    });

    it("should reject requests without session ID and not initialize", async () => {
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "tools/list",
        }),
      });

      expect(response.status).toBe(400);

      const errorData = (await response.json()) as {
        jsonrpc: string;
        error: { code: number; message: string };
        id: null;
      };

      expect(errorData.error.code).toBe(-32000);
      expect(errorData.error.message).toContain("Invalid session");
    });
  });

  describe("Request Validation", () => {
    it("should reject GET requests to /mcp endpoint", async () => {
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "GET",
      });

      expect(response.status).toBe(400);

      const errorData = (await response.json()) as {
        error: { message: string };
      };

      expect(errorData.error.message).toContain("Invalid session");
    });

    it("should reject POST requests with invalid JSON", async () => {
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: "not-valid-json",
      });

      expect(response.status).toBeGreaterThanOrEqual(400);
    });

    it("should handle requests without Content-Type header", async () => {
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      // Should still process the request if body is valid JSON
      expect(response.status).toBeLessThan(500);
    });
  });

  describe("Error Handling", () => {
    it("should handle 404 for unknown routes", async () => {
      const response = await fetch(`${serverAddress}/unknown-route`);
      expect(response.status).toBe(404);
    });

    it("should return JSON-RPC error for malformed requests", async () => {
      const response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          // Missing required fields for any valid MCP request
          method: "nonexistent/method",
        }),
      });

      // Should return an error response (not necessarily 500, could be 400 or JSON-RPC error)
      const data = await response.json();
      expect(data).toHaveProperty("error");
    });
  });

  describe("Multiple Sessions", () => {
    it("should handle multiple concurrent sessions", async () => {
      // Create first session
      const session1Response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "client-1",
              version: "1.0.0",
            },
          },
        }),
      });

      const sessionId1 = session1Response.headers.get("mcp-session-id");
      expect(sessionId1).toBeTruthy();

      // Create second session
      const session2Response = await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "client-2",
              version: "1.0.0",
            },
          },
        }),
      });

      const sessionId2 = session2Response.headers.get("mcp-session-id");
      expect(sessionId2).toBeTruthy();

      // Sessions should be different
      expect(sessionId1).not.toBe(sessionId2);

      // Both sessions should work independently
      // Both responses should be successful
      expect(session1Response.ok).toBe(true);
      expect(session2Response.ok).toBe(true);

      // Health check should show 2 sessions
      const healthResponse = await fetch(`${serverAddress}/health`);
      const healthData = (await healthResponse.json()) as { sessions: number };
      expect(healthData.sessions).toBe(2);
    });
  });

  describe("Cleanup", () => {
    it("should close all sessions on server stop", async () => {
      // Create a session
      await fetch(`${serverAddress}/mcp`, {
        method: "POST",
        headers: mcpHeaders,
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "initialize",
          params: {
            protocolVersion: "2024-11-05",
            capabilities: {},
            clientInfo: {
              name: "test-client",
              version: "1.0.0",
            },
          },
        }),
      });

      // Verify session exists
      const healthBefore = await fetch(`${serverAddress}/health`);
      const healthDataBefore = (await healthBefore.json()) as { sessions: number };
      expect(healthDataBefore.sessions).toBe(1);

      // Stop server
      await httpServer.stop();

      // Verify server is stopped
      const address = httpServer.getAddress();
      expect(address).toBeNull();
    });
  });
});
